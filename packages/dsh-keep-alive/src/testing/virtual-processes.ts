import { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import type { Launch } from "../contract.js";
import type { InstanceIo } from "../runtime/instance.js";
import type { Identity, Snapshot } from "../platform/windows.js";
import type { Version } from "../runtime/versions.js";
export interface VirtualProcesses {
  time: number;
  nextPid: number;
  current?: ChildProcess;
  currentIdentity?: Identity;
  launched: Launch[];
  versions: string[];
  occupied: boolean;
  reachable: boolean;
  installError: boolean;
  cleanupError: boolean;
  spawnError: boolean;
  exitDuringReadiness: boolean;
  currentVersion: Version;
  timers: Array<{ ms: number; task: () => void; cancelled: boolean }>;
  sleeps: Array<{
    ms: number;
    resolve: () => void;
  }>;
  io: InstanceIo;
  crash: () => void;
  advance: () => Promise<void>;
}
const initialProcesses = (): Omit<VirtualProcesses, "io" | "crash" | "advance"> => ({
  time: 0,
  nextPid: 100,
  current: undefined,
  currentIdentity: undefined,
  launched: [],
  versions: [],
  occupied: false,
  reachable: true,
  installError: false,
  cleanupError: false,
  spawnError: false,
  exitDuringReadiness: false,
  currentVersion: { version: "1.0.0", entry: "fixture" },
  timers: [],
  sleeps: [],
});
// 测试替身不使用 class：可变字段与 io 由工厂函数与闭包提供。
export const createVirtualProcesses = (): VirtualProcesses => {
  // io 的方法要读写同一份字段，故先声明后赋值，保持引用一致。
  let os: VirtualProcesses;
  const crash = (): void => {
    if (os.current) {
      Object.assign(os.current, { exitCode: 7 });
      os.current.emit("exit", 7, null);
    }
    os.current = undefined;
    os.currentIdentity = undefined;
  };
  const advance = async (): Promise<void> => {
    const sleep = os.sleeps.shift();
    if (!sleep) throw new Error("No pending sleep");
    os.time += sleep.ms;
    sleep.resolve();
    await new Promise<void>((resolve: (value: void | PromiseLike<void>) => void): unknown =>
      setImmediate(resolve),
    );
  };
  const io: InstanceIo = {
    schedule: (ms: number, task: () => void): (() => void) => {
      const timer = { ms, task, cancelled: false };
      os.timers.push(timer);
      return (): void => {
        timer.cancelled = true;
      };
    },
    now: (): number => os.time,
    wait: async (ms: number): Promise<void> => {
      if (ms === 250) {
        os.time += ms;
        return;
      }
      await new Promise<void>((resolve: (value: void | PromiseLike<void>) => void): number =>
        os.sleeps.push({ ms, resolve }),
      );
    },
    latest: async (): Promise<Version> => {
      if (os.installError) throw new Error("install failed");
      return os.currentVersion;
    },
    snapshot: async (): Promise<Snapshot> => ({
      processes: os.currentIdentity ? [os.currentIdentity] : [],
      owners: os.occupied ? [999] : os.currentIdentity ? [os.currentIdentity.pid] : [],
    }),
    reachable: async (): Promise<boolean> => {
      if (os.exitDuringReadiness) crash();
      return os.reachable;
    },
    launch: (_version: Version, _port: number, launch: Launch): ChildProcess => {
      os.launched.push(launch);
      os.versions.push(_version.version);
      const child = new ChildProcess();
      Object.assign(child, {
        pid: os.nextPid++,
        exitCode: null,
        signalCode: null,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      os.current = child;
      os.currentIdentity = {
        pid: child.pid!,
        parent: 1,
        birth: new Date(os.time).toISOString(),
        command: "fixture",
      };
      if (os.spawnError)
        queueMicrotask((): void => {
          child.emit("error", new Error("spawn failed"));
        });
      return child;
    },
    terminate: async (): Promise<void> => {
      if (os.cleanupError) throw new Error("cleanup failed");
      crash();
    },
  };
  os = { ...initialProcesses(), io, crash, advance };
  return os;
};
