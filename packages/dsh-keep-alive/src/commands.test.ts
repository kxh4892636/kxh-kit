import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { start, query, listPorts, logs, runSupervisor } from "./commands.js";
import { DEFAULT_PORT, main, resolvePort } from "./main.js";
import { fixture, fixtureVersion, temporary } from "./testing/fixture.js";
import { VirtualProcesses } from "./testing/virtual-processes.js";
import { pathsFor, preparePaths, saveJson } from "./paths.js";
import { snapshot } from "./platform/windows.js";
import type { Identity } from "./platform/windows.js";
import type { Status } from "./contract.js";
const exec = promisify(execFile);
test("CLI 帮助、参数错误及未启动查询", async (): Promise<void> => {
  let text = "";
  await main([], (value: string): void => {
    text += value;
  });
  expect(text).toMatch(/dsh-alive/);
  expect(text).toMatch(/start \[--port N\]/);
  for (const args of [
    ["invalid"],
    ["start", "--port"],
    ["start", "--port", "0"],
    ["start", "--port", "1.2"],
    ["start", "--bad", "1"],
    ["start", "--port", "1234", "extra"],
  ])
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
test("省略 --port 时解析为 3080，显式端口仍被校验", async (): Promise<void> => {
  expect(DEFAULT_PORT).toBe(3080);
  expect(resolvePort([])).toBe(3080);
  expect(resolvePort(["--port", "1234"])).toBe(1234);
  expect(resolvePort(["--port", "65535"])).toBe(65535);
  for (const args of [["--port"], ["--port", "1.2"], ["--bad", "1"], ["--port", "1234", "extra"]])
    expect(() => resolvePort(args)).toThrow(/Expected --port N/);
  for (const args of [
    ["--port", "0"],
    ["--port", "65536"],
  ])
    expect(() => resolvePort(args)).toThrow();
  // 隔离 LOCALAPPDATA，验证 CLI 在省略端口时确实落到 3080 且不触碰真实实例。
  const local = await temporary();
  const previous = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = local;
  try {
    let text = "";
    await main(["logs"], (value: string): void => {
      text += value;
    });
    expect(text).toBe("No log yet\n");
    text = "";
    await main(["stop"], (value: string): void => {
      text += value;
    });
    expect(JSON.parse(text)).toMatchObject({ port: 3080, state: "stopped" });
    text = "";
    await main(["status"], (value: string): void => {
      text += value;
    });
    expect(text).toBe("");
  } finally {
    if (previous === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previous;
  }
});
test("缺省端口指向被占用的 3080 时报错且不终止占用者", async (): Promise<void> => {
  // 3080 空闲时由本测试自己监听，两个分支都产生证据；已有外部占用者时直接复用它。
  const external = (await snapshot(3080)).owners.length > 0;
  const listener = external ? undefined : createServer();
  if (listener) {
    listener.listen(3080, "127.0.0.1");
    await once(listener, "listening");
  }
  const before = (await snapshot(3080)).owners
    .slice()
    .sort((a: number, b: number): number => a - b);
  expect(before.length).toBeGreaterThan(0);
  const local = await temporary();
  const paths = pathsFor(3080, join(local, "dsh-keep-alive"));
  await preparePaths(paths);
  await saveJson(paths.state, { version: (await fixtureVersion(paths)).version });
  // 用打包产物执行：真实 CLI 的 supervisor 自启动路径相对 dist/main.mjs 解析。
  const entry = fileURLToPath(new URL("../dist/main.mjs", import.meta.url));
  const env = {
    ...process.env,
    LOCALAPPDATA: local,
    npm_config_registry: "http://127.0.0.1:1",
    npm_config_fetch_retries: "0",
  };
  const run = async (args: string[]): Promise<{ stdout: string; stderr: string }> =>
    exec(process.execPath, [entry, ...args], { env, windowsHide: true, timeout: 30000 });
  try {
    const failure = await run(["start"]).then(
      (result): string => result.stdout,
      (error: { stderr?: string }): string => error.stderr ?? "",
    );
    expect(failure).toMatch(/occupied/i);
    expect(
      (await snapshot(3080)).owners.slice().sort((a: number, b: number): number => a - b),
    ).toEqual(before);
  } finally {
    await run(["stop"]).catch((): void => {});
    if (listener)
      await new Promise<void>((resolve: () => void): void => {
        listener.close((): void => resolve());
      });
  }
}, 60000);
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
    expect(JSON.parse(await cli(["status", "--port", String(f.port)]))).toMatchObject({
      port: f.port,
      state: "running",
    });
    expect(await cli(["logs", "--port", String(f.port)])).toMatch(/fixture-start/);
    expect(JSON.parse(await cli(["stop", "--port", String(f.port)])).state).toBe("stopped");
    await expect(fetch("http://127.0.0.1:" + f.port)).rejects.toThrow();
    await expect(cli(["bad"])).rejects.toThrow();
    // 省略 --port 的日志与停止落在 3080：隔离 LOCALAPPDATA 下没有该实例，故只读返回空日志与 stopped。
    expect(await cli(["logs"])).toMatch(/No log yet/);
    expect(JSON.parse(await cli(["stop"]))).toMatchObject({ port: 3080, state: "stopped" });
  } finally {
    await cli(["stop", "--port", String(f.port)]).catch((): void => {});
  }
}, 120000);
