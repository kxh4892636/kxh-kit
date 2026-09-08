import { mkdir, readFile, rm } from "node:fs/promises";
import { expect, test } from "vitest";
import { createInstance } from "./instance.js";
import { readRecordedState, type Version } from "./versions.js";
import { fixture, fixtureVersion } from "../testing/fixture.js";
import { createVirtualProcesses } from "../testing/virtual-processes.js";
import { saveJson } from "../paths.js";
const launch = { cwd: process.cwd(), env: {} };
test("start 按通道准备并启动，不再调度周期检查", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  const status = await instance.start(launch, "alpha");
  expect(status).toMatchObject({
    state: "running",
    version: "1.0.0",
    tag: "alpha",
    prepared: null,
  });
  expect(os.preparedTags).toEqual(["alpha"]);
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "1.0.0", tag: "alpha" });
  expect(await readFile(f.paths.log, "utf8")).toMatch(/Running DSH 1\.0\.0 \(tag alpha\)/);
  await instance.stop();
});
test("update 安装新版本并记录，但不启动不重启", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  const before = await instance.start(launch, "latest");
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0-alpha.1");
  const status = await instance.update(launch, "alpha");
  expect(status).toMatchObject({
    state: "running",
    version: "1.0.0",
    pid: before.pid,
    tag: "alpha",
    prepared: "2.0.0-alpha.1",
  });
  expect(os.versions).toEqual(["1.0.0"]);
  expect(await readRecordedState(f.paths.state)).toEqual({
    version: "2.0.0-alpha.1",
    tag: "alpha",
  });
  await instance.stop();
});
test("update 无新版时不做任何事", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  const before = await instance.start(launch, "latest");
  const status = await instance.update(launch, "latest");
  expect(status).toMatchObject({
    state: "running",
    version: "1.0.0",
    pid: before.pid,
    prepared: null,
  });
  expect(os.versions).toEqual(["1.0.0"]);
  expect(await readFile(f.paths.log, "utf8")).toMatch(/No change for tag latest \(DSH 1\.0\.0\)/);
  await instance.stop();
});
test("通道切换即使版本相同也会记录", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch, "latest");
  const status = await instance.update(launch, "next");
  expect(status).toMatchObject({ version: "1.0.0", tag: "next", prepared: null });
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "1.0.0", tag: "next" });
  await instance.stop();
});
test("update 在实例未运行时只准备版本，不启动", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  const status = await instance.update(launch, "next");
  expect(status).toMatchObject({
    state: "stopped",
    version: null,
    tag: "next",
    prepared: "2.0.0",
  });
  expect(os.versions).toEqual([]);
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "2.0.0", tag: "next" });
});
test("update 安装失败时不改变已记录版本与运行状态", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  const before = await instance.start(launch, "latest");
  os.installError = true;
  await expect(instance.update(launch, "alpha")).rejects.toThrow(/install failed/);
  expect(instance.status()).toMatchObject({
    state: "running",
    version: "1.0.0",
    pid: before.pid,
    prepared: null,
  });
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "1.0.0", tag: "latest" });
  await instance.stop();
});
test("start 版本检查失败时回退已缓存版本并保留原通道", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  await saveJson(f.paths.state, { version: "1.0.0", tag: "next" });
  const instance = createInstance(f.port, f.paths, os.io);
  os.installError = true;
  const status = await instance.start(launch, "alpha");
  expect(status).toMatchObject({ state: "running", version: "1.0.0", tag: "next" });
  expect(status.error!).toMatch(/Version check failed/);
  // 失败的检查不得把通道改成请求的 alpha。
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "1.0.0", tag: "next" });
  await instance.stop();
});
test("start 启动新版失败时回退上一可运行版本", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
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
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  const instance = createInstance(f.port, f.paths, io);
  const status = await instance.start(launch, "next");
  expect(status).toMatchObject({ state: "running", version: "1.0.0" });
  expect(status.error!).toMatch(/Rolled back 2\.0\.0/);
  expect(os.versions).toEqual(["2.0.0", "1.0.0"]);
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "1.0.0", tag: "latest" });
  await instance.stop();
});
test("state.json 丢失时仍回退到正在运行的版本", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
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
  await instance.start(launch, "latest");
  await rm(f.paths.state);
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  const status = await instance.start(launch, "next");
  expect(status).toMatchObject({ state: "running", version: "1.0.0" });
  expect(status.error!).toMatch(/Rolled back 2\.0\.0/);
  await instance.stop();
});
test("回退优先使用正在运行的版本而不是记录版本", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
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
  await instance.start(launch, "latest");
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  await instance.update(launch, "alpha");
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "2.0.0", tag: "alpha" });
  // 记录里是 2.0.0，但正在运行且已知可用的是 1.0.0。
  os.currentVersion = await fixtureVersion(f.paths, "3.0.0");
  const status = await instance.start(launch, "next");
  expect(status).toMatchObject({ state: "running", version: "1.0.0" });
  expect(status.error!).toMatch(/Rolled back 3\.0\.0/);
  expect(os.versions).toEqual(["1.0.0", "3.0.0", "1.0.0"]);
  await instance.stop();
});
test("回退与状态写入同时失败仍清理进程并显示 failed", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch, "latest");
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  await rm(f.paths.state);
  await mkdir(f.paths.state);
  os.reachable = false;
  await expect(instance.start(launch, "next")).rejects.toThrow(/rollback failed/);
  expect(instance.status().state).toBe("failed");
  expect(instance.status().error!).toMatch(/state:/);
  expect(os.current).toBeUndefined();
});
test("回退也失败时报告 failed 且不留残留进程", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
  os.reachable = false;
  const instance = createInstance(f.port, f.paths, os.io);
  await expect(instance.start(launch, "next")).rejects.toThrow(/rollback failed/);
  expect(instance.status().state).toBe("failed");
  expect(os.current).toBeUndefined();
  expect(await readRecordedState(f.paths.state)).toEqual({ version: "1.0.0", tag: "latest" });
});
