import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:net";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { start, update, query, listPorts, logs, runSupervisor } from "./commands.js";
import { DEFAULT_PORT, main, parseOptions, resolveTag } from "./main.js";
import { fixture, fixtureVersion, temporary, writePackage } from "./testing/fixture.js";
import { createVirtualProcesses } from "./testing/virtual-processes.js";
import { pathsFor, preparePaths, saveJson } from "./paths.js";
import { readRecordedState, type Npm } from "./runtime/versions.js";
import { serve } from "./runtime/transport.js";
import { snapshot } from "./platform/windows.js";
import type { Identity } from "./platform/windows.js";
import type { Paths } from "./paths.js";
import type { Reply, Request, Status } from "./contract.js";
const exec = promisify(execFile);
interface LegacySupervisor {
  server: Server;
  stopping: () => boolean;
  release: () => void;
}
// 旧版 supervisor 替身：状态回复没有 tag/prepared 字段；收到 stop 后先继续以「正在停止」应答，
// 直到测试放行才关闭控制通道——这正是 start 必须等待、无法靠运气通过的窗口。
const legacySupervisor = async (paths: Paths, port: number): Promise<LegacySupervisor> => {
  const token = "a".repeat(64);
  let stopping = false;
  let release: () => void = (): void => {};
  const gate = new Promise<void>((resolve: () => void): void => {
    release = resolve;
  });
  const status: Status = {
    port,
    state: "running",
    version: "1.0.0",
    pid: 4242,
    error: null,
    log: paths.log,
  };
  let server: Server;
  server = await serve(
    paths.pipe,
    async (message: Request): Promise<Reply> => {
      if (message.command === "stop") {
        stopping = true;
        void gate.then((): void => {
          server.close();
        });
        return { ok: true, status };
      }
      if (stopping) return { ok: false, error: "Supervisor is stopping; retry start" };
      return { ok: true, status };
    },
    token,
  );
  await saveJson(join(paths.directory, "control.json"), { token });
  return { server, stopping: (): boolean => stopping, release };
};
// 替身 npm：view 返回给定版本，install 在 --prefix 下写出可运行的包目录。
const fakeNpm =
  (version: string): Npm =>
  async (args: string[]): Promise<string> => {
    if (args[0] === "view") return JSON.stringify(version);
    await writePackage(args[args.indexOf("--prefix") + 1], version);
    return "";
  };
test("CLI 帮助、参数错误及未启动查询", async (): Promise<void> => {
  let text = "";
  await main([], (value: string): void => {
    text += value;
  });
  expect(text).toMatch(/dsh-alive/);
  expect(text).toMatch(/start \[--port N\] \[--tag T\]/);
  expect(text).toMatch(/update \[--port N\] \[--tag T\]/);
  for (const args of [
    ["invalid"],
    ["start", "--port"],
    ["start", "--port", "0"],
    ["start", "--port", "1.2"],
    ["start", "--bad", "1"],
    ["start", "--port", "1234", "extra"],
    ["start", "--tag", "bad tag"],
    ["update", "--tag", "0.1.2"],
    ["update", "--tag", "alpha", "--tag", "next"],
    ["stop", "--tag", "next"],
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
test("选项解析：缺省端口 3080，--port 与 --tag 均被校验", async (): Promise<void> => {
  expect(DEFAULT_PORT).toBe(3080);
  expect(parseOptions([])).toEqual({ port: 3080, tag: undefined });
  expect(parseOptions(["--port", "1234"]).port).toBe(1234);
  expect(parseOptions(["--port", "65535"]).port).toBe(65535);
  expect(parseOptions(["--port", "1234", "--tag", "alpha"], true)).toEqual({
    port: 1234,
    tag: "alpha",
  });
  expect(parseOptions(["--tag", "next"], true).tag).toBe("next");
  for (const args of [["--port"], ["--port", "1.2"], ["--bad", "1"], ["--port", "1234", "extra"]])
    expect(() => parseOptions(args)).toThrow(/Expected --port N/);
  // --tag 只对 start/update 开放，且必须通过 tagSchema。
  expect(() => parseOptions(["--tag", "alpha"])).toThrow(/Expected --port N/);
  for (const tag of ["0.1.2", "bad tag", "-alpha", ""])
    expect(() => parseOptions(["--tag", tag], true)).toThrow();
  for (const args of [
    ["--port", "0"],
    ["--port", "65536"],
  ])
    expect(() => parseOptions(args)).toThrow();
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
test("未指定 --tag 时沿用该端口上次使用的通道", async (): Promise<void> => {
  const local = await temporary();
  const previous = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = local;
  try {
    const paths = pathsFor(4242, join(local, "dsh-keep-alive"));
    await preparePaths(paths);
    await saveJson(paths.state, { version: "1.0.0", tag: "alpha" });
    expect(await resolveTag(4242, undefined)).toBe("alpha");
    expect(await resolveTag(4242, "next")).toBe("next");
    // 没有记录的端口回落到默认通道。
    expect(await resolveTag(9999, undefined)).toBe("latest");
    // 旧状态文件没有 tag 字段时同样回落到默认通道。
    await saveJson(paths.state, { version: "1.0.0" });
    expect(await resolveTag(4242, undefined)).toBe("latest");
  } finally {
    if (previous === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previous;
  }
});
test("没有 supervisor 时 update 在 CLI 进程内准备版本且不启动实例", async (): Promise<void> => {
  const local = await temporary();
  const paths = pathsFor(5353, join(local, "dsh-keep-alive"));
  await preparePaths(paths);
  await saveJson(paths.state, { version: "1.0.0", tag: "latest" });
  const status = await update(
    5353,
    { cwd: process.cwd(), env: {} },
    "alpha",
    paths,
    fakeNpm("2.0.0-alpha.1"),
  );
  expect(status).toMatchObject({
    port: 5353,
    state: "stopped",
    version: null,
    tag: "alpha",
    prepared: "2.0.0-alpha.1",
  });
  expect(await readRecordedState(paths.state)).toEqual({
    version: "2.0.0-alpha.1",
    tag: "alpha",
  });
  // 没有 supervisor 的查询从 state.json 报告通道与下次 start 的版本。
  expect(await query(5353, false, paths)).toMatchObject({
    state: "stopped",
    tag: "alpha",
    prepared: "2.0.0-alpha.1",
  });
  expect(await logs(5353, paths)).toMatch(/Prepared DSH 2\.0\.0-alpha\.1 \(tag alpha\)/);
});
test("新建 supervisor 从 state.json 恢复通道与待生效版本", async (): Promise<void> => {
  const f = await fixture();
  await saveJson(f.paths.state, { version: "1.0.0", tag: "alpha" });
  const os = createVirtualProcesses();
  await runSupervisor(f.port, f.paths, os.io);
  try {
    expect(await query(f.port, false, f.paths)).toMatchObject({
      state: "stopped",
      tag: "alpha",
      prepared: "1.0.0",
    });
  } finally {
    await query(f.port, true, f.paths).catch((): void => {});
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
    // 版本解析固定用官方源，这里把它指向死地址以模拟不可达的源。
    DSH_ALIVE_REGISTRY: "http://127.0.0.1:1",
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
  const os = createVirtualProcesses();
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
    expect((await start(f.port, launch, "latest", f.paths)).state).toBe("running");
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
    // 拒绝时不应自行拉起新的 supervisor，故传入空实现。
    await expect(start(f.port, launch, "latest", f.paths, (): void => {})).rejects.toThrow(
      /stopping/,
    );
    releaseStop();
    expect((await stopped).state).toBe("stopped");
  } finally {
    releaseStop();
    await query(f.port, true, f.paths).catch((): void => {});
  }
});
test("有 supervisor 时 update 交给它处理且不重启实例", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  await runSupervisor(f.port, f.paths, os.io);
  try {
    const launch = { cwd: process.cwd(), env: {} };
    const running = await start(f.port, launch, "latest", f.paths);
    os.currentVersion = await fixtureVersion(f.paths, "2.0.0");
    const status = await update(f.port, launch, "alpha", f.paths);
    expect(status).toMatchObject({
      state: "running",
      version: "1.0.0",
      pid: running.pid,
      tag: "alpha",
      prepared: "2.0.0",
    });
    expect((await query(f.port, false, f.paths)).prepared).toBe("2.0.0");
    expect(os.versions).toEqual(["1.0.0"]);
  } finally {
    await query(f.port, true, f.paths).catch((): void => {});
  }
});
test("磁盘通道非法时按默认通道处理并保留版本", async (): Promise<void> => {
  const local = await temporary();
  const paths = pathsFor(4243, join(local, "dsh-keep-alive"));
  await preparePaths(paths);
  for (const tag of ["0.1.2", "bad tag", "-alpha"]) {
    await saveJson(paths.state, { version: "1.0.0", tag });
    expect(await readRecordedState(paths.state)).toEqual({ version: "1.0.0", tag: "latest" });
  }
  await saveJson(paths.state, { version: "../../escape" });
  expect(await readRecordedState(paths.state)).toBeUndefined();
});
test("update 遇到旧版 supervisor 时要求先执行 start", async (): Promise<void> => {
  const f = await fixture();
  const legacy = await legacySupervisor(f.paths, f.port);
  try {
    await expect(
      update(f.port, { cwd: process.cwd(), env: {} }, "alpha", f.paths, fakeNpm("2.0.0")),
    ).rejects.toThrow(/predates tag support/);
    expect(await readRecordedState(f.paths.state)).toEqual({ version: "1.0.0", tag: "latest" });
  } finally {
    legacy.release();
    legacy.server.close();
  }
});
test("start 等到旧版 supervisor 退出后才接管并按 tag 启动", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  const legacy = await legacySupervisor(f.paths, f.port);
  const starting = start(f.port, { cwd: process.cwd(), env: {} }, "alpha", f.paths, (): void => {
    void runSupervisor(f.port, f.paths, os.io);
  });
  try {
    // 旧版仍在应答「正在停止」时，新版不得接管，也不得启动实例。
    await expect.poll(legacy.stopping, { timeout: 5000 }).toBe(true);
    expect(os.preparedTags).toEqual([]);
    legacy.release();
    const status = await starting;
    expect(status).toMatchObject({ state: "running", tag: "alpha", version: "1.0.0" });
    expect(os.preparedTags).toEqual(["alpha"]);
  } finally {
    legacy.release();
    legacy.server.close();
    await query(f.port, true, f.paths).catch((): void => {});
    await starting.catch((): void => {});
  }
});
test("停止清理失败后仍可查询并重试停止", async (): Promise<void> => {
  const f = await fixture();
  const os = createVirtualProcesses();
  await runSupervisor(f.port, f.paths, os.io);
  try {
    await start(f.port, { cwd: process.cwd(), env: {} }, "latest", f.paths);
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
    // 版本解析固定用官方源；指向死地址即可让 start 走缓存版本回退路径。
    DSH_ALIVE_REGISTRY: "http://127.0.0.1:1",
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
