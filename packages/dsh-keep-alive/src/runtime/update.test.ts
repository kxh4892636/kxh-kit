import { mkdir, rm } from "node:fs/promises";
import { expect, test } from "vitest";
import { createInstance, UPDATE_INTERVAL } from "./instance.js";
import { fixture, fixtureVersion } from "../testing/fixture.js";
import { createVirtualProcesses, type VirtualProcesses } from "../testing/virtual-processes.js";
import type { Version } from "./versions.js";
const launch = { cwd: process.cwd(), env: {} };
const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++)
    await new Promise<void>((resolve: () => void): void => {
      setImmediate(resolve);
    });
};
const fire = async (os: VirtualProcesses): Promise<number> => {
  await settled((): boolean =>
    os.timers.some((item: { cancelled: boolean }): boolean => !item.cancelled),
  );
  const timer = os.timers.find((item: { cancelled: boolean }): boolean => !item.cancelled);
  // settled 已保证存在未取消的 timer；这里同时完成类型收窄与失败定位。
  if (!timer) throw new Error("timer missing");
  timer.cancelled = true;
  os.time += timer.ms;
  timer.task();
  await flush();
  return timer.ms;
};
const settled = async (predicate: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !predicate(); i++)
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, 5);
    });
  expect(predicate()).toBeTruthy();
};
test("先启动缓存版本，再立即检查并每13小时检查", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  expect(instance.status().version).toBe("1.0.0");
  expect(UPDATE_INTERVAL).toBe(46_800_000);
  expect(await fire(os)).toBe(0);
  expect(await fire(os)).toBe(46_800_000);
  expect(os.versions).toEqual(["1.0.0"]);
  await instance.stop();
  expect(os.timers.every((timer: { cancelled: boolean }): boolean => timer.cancelled)).toBeTruthy();
});
test("准备更新期间旧实例服务，成功后显示新版", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const next = await fixtureVersion(f.paths, "2.0.0-rc.1");
  let finish!: (version: Version) => void;
  const io = {
    ...os.io,
    latest: async (): Promise<Version> =>
      new Promise((resolve: (version: Version) => void): void => {
        finish = resolve;
      }),
  };
  const instance = createInstance(f.port, f.paths, io);
  const before = await instance.start(launch);
  await fire(os);
  expect(instance.status().pid).toBe(before.pid);
  expect(instance.status().state).toBe("running");
  finish(next);
  await settled(
    (): boolean =>
      instance.status().version === "2.0.0-rc.1" && instance.status().state === "running",
  );
  expect(instance.status().pid).not.toBe(before.pid);
  await instance.stop();
});
test("网络安装失败不打断当前进程，下周期继续检查", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  const before = await instance.start(launch);
  os.installError = true;
  await fire(os);
  expect(instance.status().pid).toBe(before.pid);
  expect(instance.status().error!).toMatch(/Update failed/);
  os.installError = false;
  await fire(os);
  expect(instance.status().state).toBe("running");
  await instance.stop();
});
test("新版失败回退且抑制同版重试，latest改变或手动start后可再试", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  const io = {
    ...os.io,
    launch: (
      version: Version,
      port: number,
      input: typeof launch,
    ): import("node:child_process").ChildProcess => {
      os.reachable = version.version === "1.0.0";
      return os.io.launch(version, port, input);
    },
  };
  const instance = createInstance(f.port, f.paths, io);
  await instance.start(launch);
  await fire(os);
  await settled((): boolean => instance.status().error?.startsWith("Rolled back") === true);
  expect(os.versions).toEqual(["1.0.0", "2.0.0", "1.0.0"]);
  expect(instance.status().version).toBe("1.0.0");
  await fire(os);
  expect(os.versions.length).toBe(3);
  await instance.start(launch);
  await fire(os);
  await settled((): boolean => os.versions.length === 6 && instance.status().state === "running");
  os.currentVersion = await fixtureVersion(f.paths, "3.0.0");
  await fire(os);
  await settled((): boolean => os.versions.length === 8 && instance.status().state === "running");
  await instance.stop();
});
test("更新准备期间stop排队，准备完成后不切换或复活", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  let finish!: (version: Version) => void;
  const io = {
    ...os.io,
    latest: async (): Promise<Version> =>
      new Promise((resolve: (version: Version) => void): void => {
        finish = resolve;
      }),
  };
  const instance = createInstance(f.port, f.paths, io);
  await instance.start(launch);
  await fire(os);
  const stopping = instance.stop();
  finish({ version: "2.0.0", entry: "unused" });
  expect((await stopping).state).toBe("stopped");
  expect(os.versions).toEqual(["1.0.0"]);
});
test("回退本身失败时明确失败且保留上次可用版本", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  os.reachable = false;
  await fire(os);
  await settled((): boolean => instance.status().state === "failed");
  expect(instance.status().error!).toMatch(/rollback failed/);
  expect(os.current).toBeUndefined();
  os.reachable = true;
  await instance.start(launch);
  expect(instance.status().version).toBe("1.0.0");
  await instance.stop();
});
test("下载期间旧版退出仍按退避恢复，不等待下载", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  let finish!: (version: Version) => void;
  const io = {
    ...os.io,
    latest: async (): Promise<Version> =>
      new Promise((resolve: (version: Version) => void): void => {
        finish = resolve;
      }),
  };
  const instance = createInstance(f.port, f.paths, io);
  const first = await instance.start(launch);
  await fire(os);
  os.crash();
  await os.advance();
  await settled((): boolean => instance.status().state === "running");
  expect(instance.status().pid).not.toBe(first.pid);
  const stop = instance.stop();
  finish(f.version);
  await stop;
});
test("latest离开失败版本再返回时解除抑制", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const bad = await fixtureVersion(f.paths, "2.0.0");
  os.currentVersion = bad;
  const io = {
    ...os.io,
    launch: (
      version: Version,
      port: number,
      input: typeof launch,
    ): import("node:child_process").ChildProcess => {
      os.reachable = version.version === "1.0.0";
      return os.io.launch(version, port, input);
    },
  };
  const instance = createInstance(f.port, f.paths, io);
  await instance.start(launch);
  await fire(os);
  await settled((): boolean => os.versions.length === 3 && instance.status().state === "running");
  os.currentVersion = f.version;
  await fire(os);
  os.currentVersion = bad;
  await fire(os);
  await settled((): boolean => os.versions.length === 5 && instance.status().state === "running");
  await instance.stop();
});
test("回退与状态持久化同时失败仍清理进程并显示failed", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  await rm(f.paths.state);
  await mkdir(f.paths.state);
  await fire(os);
  await settled(
    (): boolean =>
      instance.status().state === "failed" && instance.status().error?.includes("state:") === true,
  );
  expect(os.current).toBeUndefined();
  expect(instance.status().nextUpdateAt).toBe(null);
  await instance.stop();
});
