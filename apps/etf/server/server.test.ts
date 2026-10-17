import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { apiCode } from "../shared/api.ts";
import { loadConfig } from "./config.ts";
import { main } from "./main.ts";
import { startServer } from "./server.ts";

const folders: string[] = [];
const temp = (): string => {
  const value = mkdtempSync(path.join(os.tmpdir(), "etf-test-"));
  folders.push(value);
  return value;
};
afterEach((): void => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("进程与启动", (): void => {
  it("入口遇到端口占用时报告错误并非零退出", async (): Promise<void> => {
    const running = startServer({ port: 0, databaseDsn: ":memory:" });
    await new Promise<void>((resolve): void => {
      running.server.once("listening", resolve);
    });
    try {
      await expect(
        promisify(execFile)(
          process.execPath,
          [fileURLToPath(new URL("main.ts", import.meta.url))],
          {
            cwd: path.resolve(fileURLToPath(new URL("..", import.meta.url))),
            env: {
              ...process.env,
              PORT: String((running.server.address() as AddressInfo).port),
              DATABASE_DSN: ":memory:",
            },
            timeout: 10000,
          },
        ),
      ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("EADDRINUSE") });
    } finally {
      await running.close();
    }
  });
  it("真实 HTTP 可查询并幂等关闭", async (): Promise<void> => {
    const running = startServer({ port: 0, databaseDsn: path.join(temp(), "db.sqlite") });
    await new Promise<void>((resolve): void => {
      running.server.once("listening", resolve);
    });
    const address = running.server.address() as AddressInfo;
    expect(await (await fetch(`http://127.0.0.1:${address.port}/`)).json()).toEqual({
      code: apiCode.ok,
      message: "ok",
      extra: {},
      data: { ok: true },
    });
    await running.close();
    await running.close();
  });
  it("启动入口加载配置并注册停止信号", async (): Promise<void> => {
    const callbacks: Record<string, () => void> = {};
    vi.spyOn(process, "once").mockImplementation(((event: string, fn: () => void) => {
      callbacks[event] = fn;
      return process;
    }) as typeof process.once);
    vi.stubEnv("PORT", "18087");
    vi.stubEnv("DATABASE_DSN", ":memory:");
    const running = main();
    await new Promise<void>((resolve): void => {
      running.server.once("listening", resolve);
    });
    callbacks["SIGINT"]?.();
    await new Promise<void>((resolve): void => {
      running.server.once("close", resolve);
    });
    callbacks["SIGTERM"]?.();
  });
});

describe("配置", (): void => {
  it("默认值、文件、进程优先级与重复键沿用首次值", (): void => {
    const file = path.join(temp(), ".env");
    expect(loadConfig(file, {})).toEqual({ port: 8080, databaseDsn: "./data/etf.sqlite" });
    writeFileSync(file, "# 配置\n\nPORT=1234\nPORT=5678\nDATABASE_DSN=local.sqlite\n");
    expect(loadConfig(file, {})).toEqual({ port: 1234, databaseDsn: "local.sqlite" });
    expect(loadConfig(file, { PORT: " 9012 ", DATABASE_DSN: " override.sqlite " })).toEqual({
      port: 9012,
      databaseDsn: "override.sqlite",
    });
  });
  it.each(["WRONG=x", "PORT=", "broken", "=x", "PORT=0", "PORT=65536", "PORT=1.2", "PORT=no"])(
    "拒绝非法配置 %s",
    (contents): void => {
      const file = path.join(temp(), ".env");
      writeFileSync(file, contents);
      expect(() => loadConfig(file, {})).toThrow();
    },
  );
  it("文件无法读取时保留错误", (): void => {
    expect(() => loadConfig(temp(), {})).toThrow();
  });
});
