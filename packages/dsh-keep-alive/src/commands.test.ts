import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { start, query, listPorts, logs, runSupervisor } from "./commands.js";
import { main } from "./main.js";
import { fixture, temporary } from "./testing/fixture.js";
import { VirtualProcesses } from "./testing/virtual-processes.js";
import { pathsFor } from "./paths.js";
import type { Status } from "./contract.js";
const exec = promisify(execFile);
void test("CLI 帮助、参数错误及未启动查询", async (): Promise<void> => {
  let text = "";
  await main([], (value: string): void => {
    text += value;
  });
  assert.match(text, /start --port/);
  for (const args of [["invalid"], ["start"], ["start", "--port", "0"], ["start", "--port", "1.2"]])
    await assert.rejects(main(args));
  const root = await temporary();
  const paths = pathsFor(1234, root);
  assert.deepEqual(await listPorts(paths), []);
  assert.equal((await query(1234, false, paths)).state, "stopped");
  assert.equal(await logs(1234, paths), "No log yet\n");
  await mkdir(join(root, "1234"));
  await mkdir(join(root, "65536"));
  await mkdir(join(root, "junk"));
  assert.deepEqual(await listPorts(paths), [1234]);
  await writeFile(paths.log, "hello");
  assert.equal(await logs(1234, paths), "hello");
});
void test("控制通道返回状态，stop 拒绝后续排队启动", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  await runSupervisor(f.port, f.paths, os.io);
  try {
    const launch = { cwd: process.cwd(), env: {} };
    assert.equal((await start(f.port, launch, f.paths)).state, "running");
    assert.equal((await query(f.port, false, f.paths)).state, "running");
    const stopped = query(f.port, true, f.paths);
    await assert.rejects(start(f.port, launch, f.paths));
    assert.equal((await stopped).state, "stopped");
  } finally {
    await query(f.port, true, f.paths).catch((): void => {});
  }
});
void test("停止清理失败后仍可查询并重试停止", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  await runSupervisor(f.port, f.paths, os.io);
  try {
    await start(f.port, { cwd: process.cwd(), env: {} }, f.paths);
    os.cleanupError = true;
    await assert.rejects(query(f.port, true, f.paths), /cleanup failed/);
    assert.equal((await query(f.port, false, f.paths)).pid, 100);
    os.cleanupError = false;
    assert.equal((await query(f.port, true, f.paths)).state, "stopped");
  } finally {
    os.cleanupError = false;
    await query(f.port, true, f.paths).catch((): void => {});
  }
});
void test(
  "真实 Windows CLI 关闭父进程后存活、重复启动替换、停止",
  { timeout: 120000 },
  async (): Promise<void> => {
    const f = await fixture();
    const env = { ...process.env, LOCALAPPDATA: f.local, MARKER: "original" };
    const entry = fileURLToPath(new URL("./main.js", import.meta.url));
    const cli = async (args: string[]): Promise<string> =>
      (await exec(process.execPath, [entry, ...args], { env, windowsHide: true, timeout: 90000 }))
        .stdout;
    try {
      const first = JSON.parse(await cli(["start", "--port", String(f.port)])) as Status;
      assert.equal(first.state, "running");
      assert.equal((await fetch("http://127.0.0.1:" + f.port)).status, 200);
      const second = JSON.parse(await cli(["start", "--port", String(f.port)])) as Status;
      assert.notEqual(second.pid, first.pid);
      assert.match(await cli(["status"]), /running/);
      assert.match(await cli(["logs", "--port", String(f.port)]), /fixture-start/);
      assert.equal(JSON.parse(await cli(["stop", "--port", String(f.port)])).state, "stopped");
      await assert.rejects(fetch("http://127.0.0.1:" + f.port));
      await assert.rejects(cli(["bad"]));
    } finally {
      await cli(["stop", "--port", String(f.port)]).catch((): void => {});
    }
  },
);
