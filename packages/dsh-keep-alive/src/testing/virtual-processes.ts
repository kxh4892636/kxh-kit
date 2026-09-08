import { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import type { Launch } from "../contract.js";
import type { InstanceIo } from "../runtime/instance.js";
import type { Identity, Snapshot } from "../platform/windows.js";
import type { Version } from "../runtime/versions.js";
export class VirtualProcesses {
  time = 0;
  nextPid = 100;
  current?: ChildProcess;
  currentIdentity?: Identity;
  launched: Launch[] = [];
  versions: string[] = [];
  occupied = false;
  reachable = true;
  installError = false;
  cleanupError = false;
  spawnError = false;
  exitDuringReadiness = false;
  currentVersion: Version = { version: "1.0.0", entry: "fixture" };
  sleeps: Array<{
    ms: number;
    resolve: () => void;
  }> = [];
  io: InstanceIo = {
    now: (): number => this.time,
    wait: async (ms: number): Promise<void> => {
      if (ms === 250) {
        this.time += ms;
        return;
      }
      await new Promise<void>((resolve: (value: void | PromiseLike<void>) => void): number =>
        this.sleeps.push({ ms, resolve }),
      );
    },
    latest: async (): Promise<Version> => {
      if (this.installError) throw new Error("install failed");
      return this.currentVersion;
    },
    snapshot: async (): Promise<Snapshot> => ({
      processes: this.currentIdentity ? [this.currentIdentity] : [],
      owners: this.occupied ? [999] : this.currentIdentity ? [this.currentIdentity.pid] : [],
    }),
    reachable: async (): Promise<boolean> => {
      if (this.exitDuringReadiness) this.crash();
      return this.reachable;
    },
    launch: (_version: Version, _port: number, launch: Launch): ChildProcess => {
      this.launched.push(launch);
      this.versions.push(_version.version);
      const child = new ChildProcess();
      Object.assign(child, {
        pid: this.nextPid++,
        exitCode: null,
        signalCode: null,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      this.current = child;
      this.currentIdentity = {
        pid: child.pid!,
        parent: 1,
        birth: new Date(this.time).toISOString(),
        command: "fixture",
      };
      if (this.spawnError)
        queueMicrotask((): void => {
          child.emit("error", new Error("spawn failed"));
        });
      return child;
    },
    terminate: async (): Promise<void> => {
      if (this.cleanupError) throw new Error("cleanup failed");
      this.crash();
    },
  };
  crash = (): void => {
    if (this.current) {
      Object.assign(this.current, { exitCode: 7 });
      this.current.emit("exit", 7, null);
    }
    this.current = undefined;
    this.currentIdentity = undefined;
  };
  advance = async (): Promise<void> => {
    const sleep = this.sleeps.shift();
    if (!sleep) throw new Error("No pending sleep");
    this.time += sleep.ms;
    sleep.resolve();
    await new Promise<void>((resolve: (value: void | PromiseLike<void>) => void): unknown =>
      setImmediate(resolve),
    );
  };
}
