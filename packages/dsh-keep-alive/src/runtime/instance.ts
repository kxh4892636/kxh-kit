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
import { installedVersion, installLatest, type Version } from "./versions.js";
import { readJson, saveJson, type Paths } from "../paths.js";
import { z } from "zod";
export interface InstanceIo {
  snapshot: (port: number) => Promise<Snapshot>;
  terminate: (identity: Identity, port: number) => Promise<void>;
  latest: (directory: string, launch: Launch) => Promise<Version>;
  launch: (version: Version, port: number, launch: Launch) => ChildProcess;
  reachable: (port: number) => Promise<boolean>;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  schedule: (ms: number, task: () => void) => () => void;
}
export const defaultIo: InstanceIo = {
  snapshot,
  terminate: terminateTree,
  latest: installLatest,
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
class ManagedInstance implements Instance {
  private view: Status;
  private child?: ChildProcess;
  private identity?: Identity;
  private desired = false;
  private generation = 0;
  private retry = 0;
  private launch!: Launch;
  private version!: Version;
  private queue: Promise<unknown> = Promise.resolve();
  private commandEpoch = 0;
  private failedVersion?: string;
  private observedLatest?: string;
  private preparation?: Promise<Version>;
  private cancelUpdate?: () => void;
  constructor(
    private port: number,
    private paths: Paths,
    private io: InstanceIo,
  ) {
    this.view = { port, state: "stopped", version: null, pid: null, error: null, log: paths.log };
  }
  status = (): Status => ({ ...this.view });
  private serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = this.queue.then(operation);
    this.queue = result.catch((): void => {});
    return result;
  };
  private logData = (data: string | Buffer): void => {
    try {
      appendLog(this.paths.log, data);
    } catch (error) {
      this.view = { ...this.view, error: "Log write failed: " + errorText(error) };
    }
  };
  private log = (message: string): void =>
    this.logData(new Date().toISOString() + " " + message + "\n");
  private fail = (error: unknown): void => {
    this.view = { ...this.view, state: "failed", error: errorText(error) };
    this.log(this.view.error!);
  };
  private halt = async (): Promise<void> => {
    this.generation++;
    if (this.child && !this.identity) {
      const current = await this.io.snapshot(this.port);
      if (this.child.exitCode === null && this.child.signalCode === null)
        this.identity = current.processes.find((p: Identity): boolean => p.pid === this.child?.pid);
      if (!this.identity && this.child.exitCode === null && this.child.signalCode === null)
        throw new Error("Cannot establish child identity; refusing restart");
    }
    if (this.identity) await this.io.terminate(this.identity, this.port);
    this.identity = undefined;
    this.child = undefined;
    this.view = { ...this.view, pid: null };
  };
  private recover = async (ticket: number, since: number): Promise<void> => {
    if (!this.desired || ticket !== this.generation) return;
    if (this.io.now() - since >= 60000) this.retry = 0;
    const backoff = BACKOFF[Math.min(this.retry++, BACKOFF.length - 1)];
    this.view = { ...this.view, state: "backoff", error: "DSH exited; restarting" };
    this.log(this.view.error!);
    await this.io.wait(backoff);
    if (!this.desired || ticket !== this.generation) return;
    await this.serial(async (): Promise<void> => {
      if (!this.desired || ticket !== this.generation) return;
      try {
        await this.boot();
      } catch (error) {
        this.fail(error);
        void this.recover(this.generation, this.io.now());
      }
    });
  };
  private boot = async (): Promise<void> => {
    await this.halt();
    if ((await this.io.snapshot(this.port)).owners.length)
      throw new Error("Port is occupied by another process");
    this.view = { ...this.view, state: "starting", version: this.version.version, error: null };
    const ticket = this.generation;
    const since = this.io.now();
    const child = this.io.launch(this.version, this.port, this.launch);
    this.child = child;
    let spawnError: Error | undefined;
    child.once("error", (error: Error): void => {
      spawnError = error;
    });
    let ready = false;
    child.once("exit", (): void => {
      if (ready) void this.recover(ticket, since);
    });
    child.stdout?.on("data", (data: Buffer): void => this.logData(data));
    child.stderr?.on("data", (data: Buffer): void => this.logData(data));
    while (this.io.now() - since < 60000) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("DSH exited before readiness");
      const current = await this.io.snapshot(this.port);
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("DSH exited during identity check");
      this.identity ??= current.processes.find(
        (p: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
          p.pid === child.pid,
      );
      if (this.identity) {
        const owned = descendants(this.identity, current.processes);
        if (
          current.owners.length &&
          current.owners.every((pid: number): boolean =>
            owned.some(
              (p: {
                pid: number;
                parent: number;
                birth: string;
                command: string | null;
              }): boolean => p.pid === pid,
            ),
          ) &&
          (await this.io.reachable(this.port))
        ) {
          this.view = { ...this.view, state: "running", pid: child.pid!, error: null };
          await saveJson(this.paths.state, { version: this.version.version });
          if (spawnError) throw spawnError;
          if (child.exitCode !== null || child.signalCode !== null)
            throw new Error("DSH exited during readiness");
          ready = true;
          this.log("Running DSH " + this.version.version);
          return;
        }
      }
      await this.io.wait(250);
    }
    throw new Error("DSH readiness timed out after 60 seconds; log: " + this.paths.log);
  };
  private prepare = (): Promise<Version> => {
    if (this.preparation) return this.preparation;
    const task = this.io.latest(this.paths.versions, this.launch).finally((): void => {
      if (this.preparation === task) this.preparation = undefined;
    });
    this.preparation = task;
    return task;
  };
  private scheduleUpdate = (ms: number): void => {
    this.cancelUpdate?.();
    const epoch = this.commandEpoch;
    this.view = { ...this.view, nextUpdateAt: new Date(this.io.now() + ms).toISOString() };
    this.cancelUpdate = this.io.schedule(ms, (): void => {
      void (async (): Promise<void> => {
        if (!this.desired || epoch !== this.commandEpoch) return;
        try {
          const next = await this.prepare();
          await this.serial(async (): Promise<void> => this.update(next, epoch));
        } catch (error) {
          if (epoch === this.commandEpoch) {
            this.view = { ...this.view, error: "Update failed: " + errorText(error) };
            this.log(this.view.error!);
          }
        } finally {
          if (this.desired && epoch === this.commandEpoch) this.scheduleUpdate(UPDATE_INTERVAL);
        }
      })();
    });
  };
  private update = async (next: Version, epoch: number): Promise<void> => {
    if (!this.desired || epoch !== this.commandEpoch) return;
    if (this.observedLatest !== next.version) this.failedVersion = undefined;
    this.observedLatest = next.version;
    if (next.version === this.version.version || next.version === this.failedVersion) return;
    const previous = this.version;
    this.version = next;
    try {
      await this.boot();
    } catch (error) {
      this.failedVersion = next.version;
      this.version = previous;
      try {
        await this.boot();
      } catch (rollback) {
        this.desired = false;
        this.fail("Update and rollback failed: " + errorText(error) + "; " + errorText(rollback));
        try {
          await this.halt();
        } catch (cleanup) {
          this.fail(this.view.error + "; cleanup: " + errorText(cleanup));
        }
        try {
          await saveJson(this.paths.state, { version: previous.version });
        } catch (storage) {
          this.fail(this.view.error + "; state: " + errorText(storage));
        }
        this.view = { ...this.view, nextUpdateAt: null };
        throw new Error(this.view.error!);
      }
      this.view = { ...this.view, error: "Rolled back " + next.version + ": " + errorText(error) };
      this.log(this.view.error!);
    }
  };
  start = (input: Launch): Promise<Status> => {
    const epoch = ++this.commandEpoch;
    this.cancelUpdate?.();
    return this.serial(async (): Promise<Status> => {
      this.desired = false;
      this.failedVersion = undefined;
      try {
        await this.halt();
        await this.preparation?.catch((): void => {});
        this.launch = input;
        this.retry = 0;
        try {
          const saved = z.object({ version: z.string() }).parse(await readJson(this.paths.state));
          this.version = await installedVersion(this.paths.versions, saved.version);
        } catch {
          this.version = await this.io.latest(this.paths.versions, this.launch);
        }
        this.desired = true;
        await this.boot();
        if (epoch === this.commandEpoch) this.scheduleUpdate(0);
        return this.status();
      } catch (error) {
        this.desired = false;
        try {
          await this.halt();
        } catch (cleanup) {
          this.fail(cleanup);
          throw cleanup;
        }
        this.fail(error);
        throw error;
      }
    });
  };
  stop = (): Promise<Status> => {
    this.commandEpoch++;
    this.cancelUpdate?.();
    this.desired = false;
    this.generation++;
    return this.serial(async (): Promise<Status> => {
      await this.halt();
      await this.preparation?.catch((): void => {});
      this.view = { ...this.view, state: "stopped", error: null, nextUpdateAt: null };
      return this.status();
    });
  };
}
export const createInstance = (port: number, paths: Paths, io: InstanceIo = defaultIo): Instance =>
  new ManagedInstance(port, paths, io);
