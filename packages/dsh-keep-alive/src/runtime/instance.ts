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
import {
  DEFAULT_TAG,
  installTag,
  installedVersion,
  prepareVersion,
  readRecordedState,
  saveRecordedState,
  preparedMessage,
  type RecordedState,
  type Version,
} from "./versions.js";
import type { Paths } from "../paths.js";
export interface InstanceIo {
  snapshot: (port: number) => Promise<Snapshot>;
  terminate: (identity: Identity, port: number) => Promise<void>;
  prepare: (directory: string, launch: Launch, tag: string) => Promise<Version>;
  launch: (version: Version, port: number, launch: Launch) => ChildProcess;
  reachable: (port: number) => Promise<boolean>;
  now: () => number;
  wait: (ms: number) => Promise<void>;
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
};
export interface Instance {
  start: (launch: Launch, tag: string) => Promise<Status>;
  update: (launch: Launch, tag: string) => Promise<Status>;
  stop: () => Promise<Status>;
  status: () => Status;
}
const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
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
  tag: string;
  queue: Promise<unknown>;
}
// 一个可运行的精确版本，以及它来自哪个发布通道。
interface VersionRef {
  version: Version;
  tag: string;
}
interface Target extends VersionRef {
  previous?: VersionRef;
  fallback?: string;
}
const initialState = (port: number, log: string, recorded?: RecordedState): InstanceState => ({
  view: {
    port,
    state: "stopped",
    version: null,
    pid: null,
    error: null,
    log,
    tag: recorded?.tag ?? null,
    // prepared 表示「下次 start 将启动的版本」；此刻没有运行版本，故直接取记录。
    prepared: recorded?.version ?? null,
  },
  childProcess: undefined,
  identity: undefined,
  desired: false,
  generation: 0,
  retry: 0,
  launch: undefined,
  version: undefined,
  tag: recorded?.tag ?? DEFAULT_TAG,
  queue: Promise.resolve(),
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
  state.view = {
    ...state.view,
    state: "starting",
    version: version.version,
    error: null,
    tag: state.tag,
  };
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
        await saveRecordedState(paths.state, { version: version.version, tag: state.tag });
        if (spawnError) throw spawnError;
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error("DSH exited during readiness");
        ready = true;
        logMessage(state, paths.log, "Running DSH " + version.version + " (tag " + state.tag + ")");
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
const bootVersion = async (
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  boot: () => Promise<void>,
  next: VersionRef,
  previous: VersionRef | undefined,
): Promise<void> => {
  state.version = next.version;
  state.tag = next.tag;
  try {
    await boot();
  } catch (error) {
    if (!previous || previous.version.version === next.version.version) throw error;
    state.version = previous.version;
    state.tag = previous.tag;
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
        await saveRecordedState(paths.state, {
          version: previous.version.version,
          tag: previous.tag,
        });
      } catch (storage) {
        markFailed(state, paths.log, state.view.error + "; state: " + errorText(storage));
      }
      throw new Error(state.view.error!);
    }
    state.view = {
      ...state.view,
      error: "Rolled back " + next.version.version + ": " + errorText(error),
    };
    logMessage(state, paths.log, state.view.error!);
  }
};
const resolveTarget = async (
  paths: Paths,
  io: InstanceIo,
  launch: Launch,
  tag: string,
  running: VersionRef | undefined,
): Promise<Target> => {
  const recorded = await readRecordedState(paths.state);
  const cached =
    recorded === undefined
      ? undefined
      : await installedVersion(paths.versions, recorded.version).catch((): undefined => undefined);
  // 优先用正在运行的版本做回退：它是已知可启动的；记录版本可能从未启动过。
  const known: VersionRef | undefined =
    running ??
    (recorded === undefined || cached === undefined
      ? undefined
      : { version: cached, tag: recorded.tag });
  try {
    const version = await io.prepare(paths.versions, launch, tag);
    return {
      version,
      tag,
      previous:
        known !== undefined && known.version.version !== version.version ? known : undefined,
    };
  } catch (error) {
    if (known === undefined) throw error;
    // 版本检查失败时回退到已缓存版本：已缓存版本可离线启动。
    return {
      version: known.version,
      tag: known.tag,
      fallback:
        "Version check failed, using cached " + known.version.version + ": " + errorText(error),
    };
  }
};
const startInstance = (
  port: number,
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  input: Launch,
  tag: string,
  boot: () => Promise<void>,
): Promise<Status> =>
  serialize(state, async (): Promise<Status> => {
    state.launch = input;
    state.retry = 0;
    let target: Target;
    try {
      // 先准备目标版本：准备期间旧实例继续服务，且仍受保活。
      target = await resolveTarget(
        paths,
        io,
        input,
        tag,
        state.version === undefined ? undefined : { version: state.version, tag: state.tag },
      );
    } catch (error) {
      // 没有可回退版本时不动正在运行的实例：启动请求失败不等于要停掉旧实例。
      if (state.childProcess === undefined) {
        state.desired = false;
        markFailed(state, paths.log, error);
      } else {
        state.view = { ...state.view, error: errorText(error) };
        logMessage(state, paths.log, "Version resolution failed: " + errorText(error));
      }
      throw error;
    }
    try {
      state.desired = true;
      await bootVersion(paths, io, state, boot, target, target.previous);
      state.view = { ...state.view, prepared: null };
      if (target.fallback !== undefined) {
        state.view = { ...state.view, error: target.fallback };
        logMessage(state, paths.log, target.fallback);
      }
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
const updateInstance = (
  paths: Paths,
  io: InstanceIo,
  state: InstanceState,
  input: Launch,
  tag: string,
): Promise<Status> =>
  serialize(state, async (): Promise<Status> => {
    const prepared = await prepareVersion(paths, input, tag, io.prepare);
    state.tag = tag;
    // 只更新不启动：运行中的实例保持原版本与原进程，新版在下次 start 生效。
    state.view = {
      ...state.view,
      tag,
      prepared: prepared.version.version === state.view.version ? null : prepared.version.version,
    };
    logMessage(state, paths.log, preparedMessage(prepared));
    return instanceStatus(state);
  });
const stopInstance = (port: number, io: InstanceIo, state: InstanceState): Promise<Status> => {
  state.desired = false;
  state.generation++;
  return serialize(state, async (): Promise<Status> => {
    await haltInstance(port, io, state);
    state.view = { ...state.view, state: "stopped", error: null };
    return instanceStatus(state);
  });
};
export const createInstance = (
  port: number,
  paths: Paths,
  io: InstanceIo = defaultIo,
  recorded?: RecordedState,
): Instance => {
  const state = initialState(port, paths.log, recorded);
  // recover 与 boot 相互调用，boot 需前向声明。
  let boot: () => Promise<void>;
  const recover = (ticket: number, since: number): Promise<void> =>
    recoverInstance(paths, io, state, boot, ticket, since);
  boot = (): Promise<void> => bootInstance(port, paths, io, state, recover);
  return {
    start: (input: Launch, tag: string): Promise<Status> =>
      startInstance(port, paths, io, state, input, tag, boot),
    update: (input: Launch, tag: string): Promise<Status> =>
      updateInstance(paths, io, state, input, tag),
    stop: (): Promise<Status> => stopInstance(port, io, state),
    status: (): Status => instanceStatus(state),
  };
};
