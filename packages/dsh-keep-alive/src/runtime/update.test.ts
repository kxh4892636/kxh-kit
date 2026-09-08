import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { createInstance, UPDATE_INTERVAL } from "./instance.js";
import { fixture, fixtureVersion } from "../testing/fixture.js";
import { VirtualProcesses } from "../testing/virtual-processes.js";
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
  assert.ok(timer);
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
  assert.ok(predicate());
};
void test("先启动缓存版本，再立即检查并每13小时检查", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  assert.equal(instance.status().version, "1.0.0");
  assert.equal(UPDATE_INTERVAL, 46_800_000);
  assert.equal(await fire(os), 0);
  assert.equal(await fire(os), 46_800_000);
  assert.deepEqual(os.versions, ["1.0.0"]);
  await instance.stop();
  assert.ok(os.timers.every((timer: { cancelled: boolean }): boolean => timer.cancelled));
});
void test("准备更新期间旧实例服务，成功后显示新版", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
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
  assert.equal(instance.status().pid, before.pid);
  assert.equal(instance.status().state, "running");
  finish(next);
  await settled(
    (): boolean =>
      instance.status().version === "2.0.0-rc.1" && instance.status().state === "running",
  );
  assert.notEqual(instance.status().pid, before.pid);
  await instance.stop();
});
void test("网络安装失败不打断当前进程，下周期继续检查", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  const before = await instance.start(launch);
  os.installError = true;
  await fire(os);
  assert.equal(instance.status().pid, before.pid);
  assert.match(instance.status().error!, /Update failed/);
  os.installError = false;
  await fire(os);
  assert.equal(instance.status().state, "running");
  await instance.stop();
});
void test("新版失败回退且抑制同版重试，latest改变或手动start后可再试", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
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
  assert.deepEqual(os.versions, ["1.0.0", "2.0.0", "1.0.0"]);
  assert.equal(instance.status().version, "1.0.0");
  await fire(os);
  assert.equal(os.versions.length, 3);
  await instance.start(launch);
  await fire(os);
  await settled((): boolean => os.versions.length === 6 && instance.status().state === "running");
  os.currentVersion = await fixtureVersion(f.paths, "3.0.0");
  await fire(os);
  await settled((): boolean => os.versions.length === 8 && instance.status().state === "running");
  await instance.stop();
});
void test("更新准备期间stop排队，准备完成后不切换或复活", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
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
  assert.equal((await stopping).state, "stopped");
  assert.deepEqual(os.versions, ["1.0.0"]);
});
void test("回退本身失败时明确失败且保留上次可用版本", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  os.reachable = false;
  await fire(os);
  await settled((): boolean => instance.status().state === "failed");
  assert.match(instance.status().error!, /rollback failed/);
  assert.equal(os.current, undefined);
  os.reachable = true;
  await instance.start(launch);
  assert.equal(instance.status().version, "1.0.0");
  await instance.stop();
});
void test("下载期间旧版退出仍按退避恢复，不等待下载", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
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
  assert.notEqual(instance.status().pid, first.pid);
  const stop = instance.stop();
  finish(f.version);
  await stop;
});
void test("latest离开失败版本再返回时解除抑制", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
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
void test("回退与状态持久化同时失败仍清理进程并显示failed", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
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
  assert.equal(os.current, undefined);
  assert.equal(instance.status().nextUpdateAt, null);
  await instance.stop();
});
