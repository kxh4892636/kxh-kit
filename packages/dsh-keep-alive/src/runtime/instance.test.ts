import { test } from "node:test";
import assert from "node:assert/strict";
import { rm, readFile } from "node:fs/promises";
import { createInstance } from "./instance.js";
import { fixture, temporary } from "../testing/fixture.js";
import { VirtualProcesses } from "../testing/virtual-processes.js";
import { pathsFor, preparePaths } from "../paths.js";
import type { Launch } from "../contract.js";
const launch: Launch = { cwd: process.cwd(), env: { MARKER: "first" } };
void test("重复与并发启动各完成一次替换，停止后不恢复", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  const first = await instance.start(launch);
  const [second, third] = await Promise.all([
    instance.start(launch),
    instance.start({ ...launch, env: { MARKER: "last" } }),
  ]);
  assert.deepEqual([first.pid, second.pid, third.pid], [100, 101, 102]);
  assert.equal(os.launched[2].env.MARKER, "last");
  os.current!.stdout!.emit("data", Buffer.from("stdout\n"));
  os.current!.stderr!.emit("data", Buffer.from("stderr\n"));
  assert.match(await readFile(f.paths.log, "utf8"), /stdout\nstderr/);
  assert.equal((await instance.stop()).state, "stopped");
  assert.equal(os.sleeps.length, 0);
});
void test("退出按退避恢复，稳定60秒后重置；停止取消待恢复", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  for (const wait of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    os.crash();
    assert.equal(instance.status().state, "backoff");
    assert.equal(os.sleeps[0].ms, wait);
    await os.advance();
    await new Promise<void>(
      (resolve: (value: void | PromiseLike<void>) => void): ReturnType<typeof setTimeout> =>
        setTimeout(resolve, 10),
    );
    assert.equal(instance.status().state, "running");
  }
  os.time += 60000;
  os.crash();
  assert.equal(os.sleeps[0].ms, 1000);
  await instance.stop();
  await os.advance();
  assert.equal(instance.status().state, "stopped");
});
void test("安装、端口、spawn、就绪和清理失败不报告成功", async (): Promise<void> => {
  for (const scenario of ["install", "occupied", "spawn", "timeout", "readiness-exit", "cleanup"]) {
    const root = await temporary();
    const paths = pathsFor(4321, root);
    await preparePaths(paths);
    const os = new VirtualProcesses();
    os.installError = scenario === "install";
    os.occupied = scenario === "occupied";
    os.spawnError = scenario === "spawn";
    os.reachable = scenario !== "timeout";
    os.exitDuringReadiness = scenario === "readiness-exit";
    const instance = createInstance(4321, paths, os.io);
    if (scenario === "cleanup") {
      await instance.start(launch);
      os.cleanupError = true;
    }
    await assert.rejects(instance.start(launch));
    assert.equal(instance.status().state, "failed");
    if (scenario === "timeout") assert.match(instance.status().error!, /log:/);
    os.cleanupError = false;
    await instance.stop();
  }
});
void test("日志故障不让进程事件处理抛出", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  await rm(f.paths.log);
  await rm(f.paths.directory, { recursive: true, force: true });
  assert.doesNotThrow((): boolean => os.current!.stdout!.emit("data", Buffer.from("data")));
  assert.match(instance.status().error!, /Log write failed/);
  await instance.stop();
});
void test("恢复时启动失败继续退避，手动停止终止恢复", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  const instance = createInstance(f.port, f.paths, os.io);
  await instance.start(launch);
  os.crash();
  os.occupied = true;
  await os.advance();
  assert.equal(instance.status().state, "backoff");
  assert.equal(os.sleeps[0].ms, 2000);
  await instance.stop();
  await os.advance();
});
void test("建立身份期间退出且 PID 重用时不得停止外部进程", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  let terminations = 0;
  const io = {
    ...os.io,
    snapshot: async (): Promise<import("../platform/windows.js").Snapshot> => {
      if (os.current) {
        const reused = {
          ...os.currentIdentity!,
          command: "external",
          birth: "2099-01-01T00:00:00Z",
        };
        os.crash();
        return { processes: [reused], owners: [reused.pid] };
      }
      return { processes: [], owners: [] };
    },
    terminate: async (): Promise<void> => {
      terminations++;
    },
  };
  const instance = createInstance(f.port, f.paths, io);
  await assert.rejects(instance.start(launch), /identity/);
  assert.equal(terminations, 0);
  await instance.stop();
});
