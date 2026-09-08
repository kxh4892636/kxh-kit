import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { start, query, listPorts, logs, runSupervisor } from "./commands.js";
import { main } from "./main.js";
import { fixture, temporary } from "./testing/fixture.js";
import { VirtualProcesses } from "./testing/virtual-processes.js";
import { pathsFor } from "./paths.js";
import type { Identity } from "./platform/windows.js";
import type { Status } from "./contract.js";
const exec = promisify(execFile);
test("CLI 帮助、参数错误及未启动查询", async (): Promise<void> => {
  let text = "";
  await main([], (value: string): void => {
    text += value;
  });
  expect(text).toMatch(/start --port/);
  for (const args of [["invalid"], ["start"], ["start", "--port", "0"], ["start", "--port", "1.2"]])
    await expect(main(args)).rejects.toThrow();
  const root = await temporary();
  const paths = pathsFor(1234, root);
  expect(await listPorts(paths)).toEqual([]);
  expect((await query(1234, false, paths)).state).toBe("stopped");
  expect(await logs(1234, paths)).toBe("No log yet\n");
  await mkdir(join(root, "1234"));
  await mkdir(join(root, "65536"));
  await mkdir(join(root, "junk"));
  expect(await listPorts(paths)).toEqual([1234]);
  await writeFile(paths.log, "hello");
  expect(await logs(1234, paths)).toBe("hello");
});
test("控制通道返回状态，stop 拒绝后续排队启动", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  // 闸门把 stop 停在「已置位 closing、尚未完成」的状态：两个请求并发走控制通道时到达顺序不定，
  // 直接抢跑会让 start 偶尔先到而通过，这里以可观测的 closing 状态代替时序假设。
  let releaseStop: () => void = (): void => {};
  const stopGate = new Promise<void>((resolve: () => void): void => {
    releaseStop = resolve;
  });
  const terminate = os.io.terminate;
  os.io.terminate = async (identity: Identity, port: number): Promise<void> => {
    await stopGate;
    await terminate(identity, port);
  };
  await runSupervisor(f.port, f.paths, os.io);
  try {
    const launch = { cwd: process.cwd(), env: {} };
    expect((await start(f.port, launch, f.paths)).state).toBe("running");
    expect((await query(f.port, false, f.paths)).state).toBe("running");
    const stopped = query(f.port, true, f.paths);
    await expect
      .poll(
        async (): Promise<string> => {
          try {
            await query(f.port, false, f.paths);
            return "open";
          } catch {
            return "closing";
          }
        },
        { timeout: 5000 },
      )
      .toBe("closing");
    await expect(start(f.port, launch, f.paths)).rejects.toThrow(/stopping/);
    releaseStop();
    expect((await stopped).state).toBe("stopped");
  } finally {
    releaseStop();
    await query(f.port, true, f.paths).catch((): void => {});
  }
});
test("停止清理失败后仍可查询并重试停止", async (): Promise<void> => {
  const f = await fixture();
  const os = new VirtualProcesses();
  await runSupervisor(f.port, f.paths, os.io);
  try {
    await start(f.port, { cwd: process.cwd(), env: {} }, f.paths);
    os.cleanupError = true;
    await expect(query(f.port, true, f.paths)).rejects.toThrow(/cleanup failed/);
    expect((await query(f.port, false, f.paths)).pid).toBe(100);
    os.cleanupError = false;
    expect((await query(f.port, true, f.paths)).state).toBe("stopped");
  } finally {
    os.cleanupError = false;
    await query(f.port, true, f.paths).catch((): void => {});
  }
});
test("真实 Windows CLI 关闭父进程后存活、重复启动替换、停止", async (): Promise<void> => {
  const f = await fixture();
  const env = {
    ...process.env,
    LOCALAPPDATA: f.local,
    MARKER: "original",
    npm_config_registry: "http://127.0.0.1:1",
    npm_config_fetch_retries: "0",
  };
  const entry = fileURLToPath(new URL("../dist/main.mjs", import.meta.url));
  const cli = async (args: string[]): Promise<string> =>
    (await exec(process.execPath, [entry, ...args], { env, windowsHide: true, timeout: 90000 }))
      .stdout;
  try {
    const first = JSON.parse(await cli(["start", "--port", String(f.port)])) as Status;
    expect(first.state).toBe("running");
    expect((await fetch("http://127.0.0.1:" + f.port)).status).toBe(200);
    const second = JSON.parse(await cli(["start", "--port", String(f.port)])) as Status;
    expect(second.pid).not.toBe(first.pid);
    expect(await cli(["status"])).toMatch(/running/);
    expect(await cli(["logs", "--port", String(f.port)])).toMatch(/fixture-start/);
    expect(JSON.parse(await cli(["stop", "--port", String(f.port)])).state).toBe("stopped");
    await expect(fetch("http://127.0.0.1:" + f.port)).rejects.toThrow();
    await expect(cli(["bad"])).rejects.toThrow();
  } finally {
    await cli(["stop", "--port", String(f.port)]).catch((): void => {});
  }
}, 120000);
