import { spawn, type ChildProcess } from "node:child_process";
import { appendLog } from "./log.js";
import {
  snapshot,
  descendants,
  terminateTree,
  type Identity,
  type Snapshot,
} from "../platform/windows.js";
import { delay, errorText, type Launch, type Status } from "../contract.js";
import { DEFAULT_TAG, installTag, installedVersion, type Version } from "./versions.js";
import { readJson, saveJson, type Paths } from "../paths.js";
import { z } from "zod";
export interface InstanceIo {
  snapshot: (port: number) => Promise<Snapshot>;
  terminate: (identity: Identity, port: number) => Promise<void>;
  prepare: (directory: string, launch: Launch, tag: string) => Promise<Version>;
  launch: (version: Version, port: number, launch: Launch) => ChildProcess;
  reachable: (port: number) => Promise<boolean>;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  schedule: (ms: number, task: () => void) => () => void;
}
export const defaultIo: InstanceIo = {
  snapshot,
  terminate: terminateTree,
  prepare: installTag,
  launch: (version: Version, port: number, launch: Launch): ChildProcess =>
    spawn(
      process.execPath,
      [version.entry, "web", "--host", "127.0.0.1", "--port", String(port), "--no-open"],
      { cwd: launch.cwd, env: launch.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    ),
  reachable: async (port: number): Promise<boolean> => {
    try {
      // DSH 未认证首页可能返回 401/403；进程与端口归属另行验证。
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1500),
      });
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    }
  },
  now: Date.now,
  wait: delay,
  schedule: (ms: number, task: () => void): (() => void) => {
    const timer = setTimeout(task, ms);
    timer.unref();
    return (): void => {
      clearTimeout(timer);
    };
  },
};
export interface Instance {
  start: (launch: Launch) => Promise<Status>;
  stop: () => Promise<Status>;
  status: () => Status;
}
const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
export const UPDATE_INTERVAL = 46_800_000;
// 受管实例不使用 class：可变状态集中在一个显式对象里，每个职责各自成函数。
interface InstanceState {
  view: Status;
  childProcess: ChildProcess | undefined;
  identity: Identity | undefined;
  desired: boolean;
  generation: number;
  retry: number;
  launch: Launch | undefined;
  version: Version | undefined;
  queue: Promise<unknown>;
  commandEpoch: number;
  failedVersion: string | undefined;
  observedLatest: string | undefined;
  preparation: Promise<Version> | undefined;
  cancelUpdate: (() => void) | undefined;
}
const initialState = (port: number, log: string): InstanceState => ({
  view: { port, state: "stopped", version: null, pid: null, error: null, log },
  childProcess: undefined,
  identity: undefined,
  desired: false,
  generation: 0,
  retry: 0,
  launch: undefined,
  version: undefined,
  queue: Promise.resolve(),
  commandEpoch: 0,
  failedVersion: undefined,
  observedLatest: undefined,
  preparation: undefined,
  cancelUpdate: undefined,
});
const instanceStatus = (state: InstanceState): Status => ({ ...state.view });
const serialize = <T>(state: InstanceState, operation: () => Promise<T>): Promise<T> => {
  const result = state.queue.then(operation);
  state.queue = result.catch((): void => {});
  return result;
};
const writeLog = (state: InstanceState, log: string, data: string | Buffer): void => {
  try {
    appendLog(log, data);
  } catch (error) {
    state.view = { ...state.view, error: "Log write failed: " + errorText(error) };
  }
};
const logMessage = (state: InstanceState, log: string, message: string): void =>
  writeLog(state, log, new Date().toISOString() + " " + message + "\n");
const markFailed = (state: InstanceState, log: string, error: unknown): void => {
  state.view = { ...state.view, state: "failed", error: errorText(error) };
  logMessage(state, log, state.view.error!);
};
const haltInstance = async (port: number, io: InstanceIo, state: InstanceState): Promise<void> => {
  state.generation++;
  const child = state.childProcess;
  if (child && !state.identity) {
    const current = await io.snapshot(port);
    if (child.exitCode === null && child.signalCode === null)
      state.identity = current.processes.find((p: Identity): boolean => p.pid === child.pid);
    if (!state.identity && child.exitCode === null && child.signalCode === null)
      throw new Error("Cannot establish child identity; refusing restart");
  }
  if (state.identity) await io.terminate(state.identity, port);
  state.identity = undefined;
  state.childProcess = undefined;
  state.view = { ...state.view, pid: null };
};
const bootInstance = async (
  port: number,
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  recover: (ticket: number, since: number) => Promise<void>,
): Promise<void> => {
  await haltInstance(port, io, state);
  if ((await io.snapshot(port)).owners.length)
    throw new Error("Port is occupied by another process");
  const version = state.version!;
  state.view = { ...state.view, state: "starting", version: version.version, error: null };
  const ticket = state.generation;
  const since = io.now();
  const child = io.launch(version, port, state.launch!);
  state.childProcess = child;
  let spawnError: Error | undefined;
  child.once("error", (error: Error): void => {
    spawnError = error;
  });
  let ready = false;
  child.once("exit", (): void => {
    if (ready) void recover(ticket, since);
  });
  child.stdout?.on("data", (data: Buffer): void => writeLog(state, paths.log, data));
  child.stderr?.on("data", (data: Buffer): void => writeLog(state, paths.log, data));
  while (io.now() - since < 60000) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("DSH exited before readiness");
    const current = await io.snapshot(port);
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("DSH exited during identity check");
    state.identity ??= current.processes.find(
      (p: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
        p.pid === child.pid,
    );
    if (state.identity) {
      const owned = descendants(state.identity, current.processes);
      if (
        current.owners.length &&
        current.owners.every((pid: number): boolean =>
          owned.some(
            (p: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
              p.pid === pid,
          ),
        ) &&
        (await io.reachable(port))
      ) {
        state.view = { ...state.view, state: "running", pid: child.pid!, error: null };
        await saveJson(paths.state, { version: version.version });
        if (spawnError) throw spawnError;
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error("DSH exited during readiness");
        ready = true;
        logMessage(state, paths.log, "Running DSH " + version.version);
        return;
      }
    }
    await io.wait(250);
  }
  throw new Error("DSH readiness timed out after 60 seconds; log: " + paths.log);
};
const recoverInstance = async (
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  boot: () => Promise<void>,
  ticket: number,
  since: number,
): Promise<void> => {
  if (!state.desired || ticket !== state.generation) return;
  if (io.now() - since >= 60000) state.retry = 0;
  const backoff = BACKOFF[Math.min(state.retry++, BACKOFF.length - 1)];
  state.view = { ...state.view, state: "backoff", error: "DSH exited; restarting" };
  logMessage(state, paths.log, state.view.error!);
  await io.wait(backoff);
  if (!state.desired || ticket !== state.generation) return;
  await serialize(state, async (): Promise<void> => {
    if (!state.desired || ticket !== state.generation) return;
    try {
      await boot();
    } catch (error) {
      markFailed(state, paths.log, error);
      void recoverInstance(paths, io, state, boot, state.generation, io.now());
    }
  });
};
const prepareVersion = (
  io: InstanceIo,
  state: InstanceState,
  versions: string,
): Promise<Version> => {
  if (state.preparation) return state.preparation;
  const task = io.prepare(versions, state.launch!, DEFAULT_TAG).finally((): void => {
    if (state.preparation === task) state.preparation = undefined;
  });
  state.preparation = task;
  return task;
};
const applyUpdate = async (
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  next: Version,
  epoch: number,
  boot: () => Promise<void>,
): Promise<void> => {
  if (!state.desired || epoch !== state.commandEpoch) return;
  if (state.observedLatest !== next.version) state.failedVersion = undefined;
  state.observedLatest = next.version;
  if (next.version === state.version!.version || next.version === state.failedVersion) return;
  const previous = state.version!;
  state.version = next;
  try {
    await boot();
  } catch (error) {
    state.failedVersion = next.version;
    state.version = previous;
    try {
      await boot();
    } catch (rollback) {
      state.desired = false;
      markFailed(
        state,
        paths.log,
        "Update and rollback failed: " + errorText(error) + "; " + errorText(rollback),
      );
      try {
        await haltInstance(state.view.port, io, state);
      } catch (cleanup) {
        markFailed(state, paths.log, state.view.error + "; cleanup: " + errorText(cleanup));
      }
      try {
        await saveJson(paths.state, { version: previous.version });
      } catch (storage) {
        markFailed(state, paths.log, state.view.error + "; state: " + errorText(storage));
      }
      state.view = { ...state.view, nextUpdateAt: null };
      throw new Error(state.view.error!);
    }
    state.view = {
      ...state.view,
      error: "Rolled back " + next.version + ": " + errorText(error),
    };
    logMessage(state, paths.log, state.view.error!);
  }
};
const scheduleUpdate = (
  ms: number,
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  prepare: () => Promise<Version>,
  update: (next: Version, epoch: number) => Promise<void>,
): void => {
  state.cancelUpdate?.();
  const epoch = state.commandEpoch;
  state.view = { ...state.view, nextUpdateAt: new Date(io.now() + ms).toISOString() };
  state.cancelUpdate = io.schedule(ms, (): void => {
    void (async (): Promise<void> => {
      if (!state.desired || epoch !== state.commandEpoch) return;
      try {
        const next = await prepare();
        await serialize(state, async (): Promise<void> => update(next, epoch));
      } catch (error) {
        if (epoch === state.commandEpoch) {
          state.view = { ...state.view, error: "Update failed: " + errorText(error) };
          logMessage(state, paths.log, state.view.error!);
        }
      } finally {
        if (state.desired && epoch === state.commandEpoch)
          scheduleUpdate(UPDATE_INTERVAL, paths, io, state, prepare, update);
      }
    })();
  });
};
const startInstance = (
  port: number,
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  input: Launch,
  boot: () => Promise<void>,
  schedule: (ms: number) => void,
): Promise<Status> => {
  const epoch = ++state.commandEpoch;
  state.cancelUpdate?.();
  return serialize(state, async (): Promise<Status> => {
    state.desired = false;
    state.failedVersion = undefined;
    try {
      await haltInstance(port, io, state);
      await state.preparation?.catch((): void => {});
      state.launch = input;
      state.retry = 0;
      try {
        const saved = z.object({ version: z.string() }).parse(await readJson(paths.state));
        state.version = await installedVersion(paths.versions, saved.version);
      } catch {
        state.version = await io.prepare(paths.versions, state.launch, DEFAULT_TAG);
      }
      state.desired = true;
      await boot();
      if (epoch === state.commandEpoch) schedule(0);
      return instanceStatus(state);
    } catch (error) {
      state.desired = false;
      try {
        await haltInstance(port, io, state);
      } catch (cleanup) {
        markFailed(state, paths.log, cleanup);
        throw cleanup;
      }
      markFailed(state, paths.log, error);
      throw error;
    }
  });
};
const stopInstance = (port: number, io: InstanceIo, state: InstanceState): Promise<Status> => {
  state.commandEpoch++;
  state.cancelUpdate?.();
  state.desired = false;
  state.generation++;
  return serialize(state, async (): Promise<Status> => {
    await haltInstance(port, io, state);
    await state.preparation?.catch((): void => {});
    state.view = { ...state.view, state: "stopped", error: null, nextUpdateAt: null };
    return instanceStatus(state);
  });
};
export const createInstance = (
  port: number,
  paths: Paths,
  io: InstanceIo = defaultIo,
): Instance => {
  const state = initialState(port, paths.log);
  // recover 与 boot 相互调用，boot 需前向声明。
  let boot: () => Promise<void>;
  const recover = (ticket: number, since: number): Promise<void> =>
    recoverInstance(paths, io, state, boot, ticket, since);
  boot = (): Promise<void> => bootInstance(port, paths, io, state, recover);
  const prepare = (): Promise<Version> => prepareVersion(io, state, paths.versions);
  const update = (next: Version, epoch: number): Promise<void> =>
    applyUpdate(paths, io, state, next, epoch, boot);
  const schedule = (ms: number): void => scheduleUpdate(ms, paths, io, state, prepare, update);
  return {
    start: (input: Launch): Promise<Status> =>
      startInstance(port, paths, io, state, input, boot, schedule),
    stop: (): Promise<Status> => stopInstance(port, io, state),
    status: (): Status => instanceStatus(state),
  };
};
