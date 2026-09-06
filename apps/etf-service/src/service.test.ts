import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { sql } from "drizzle-orm";
import { createApp, MarketError } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase, createSecurityStore } from "./storage/database.ts";
import { startServer } from "./server.ts";
import { main } from "./main.ts";

const folders: string[] = [];
const temp = (): string => {
  const value = mkdtempSync(path.join(os.tmpdir(), "etf-test-"));
  folders.push(value);
  return value;
};
afterEach((): void => {
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
describe("证券服务", (): void => {
  it("入口遇到端口占用时报告错误并非零退出", async (): Promise<void> => {
    const running = startServer({ port: 0, databaseDsn: ":memory:" });
    await new Promise<void>((resolve): void => {
      running.server.once("listening", resolve);
    });
    const folder = temp();
    writeFileSync(
      path.join(folder, ".env"),
      `PORT=${(running.server.address() as AddressInfo).port}\nDATABASE_DSN=:memory:`,
    );
    try {
      await expect(
        promisify(execFile)(
          process.execPath,
          [fileURLToPath(new URL("main.ts", import.meta.url))],
          { cwd: folder, timeout: 10000 },
        ),
      ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("EADDRINUSE") });
    } finally {
      await running.close();
    }
  });
  it("初始化、重复迁移与重启保留证券，按代码排序", async (): Promise<void> => {
    const file = path.join(temp(), "nested", "db.sqlite");
    for (let index = 0; index < 2; index++) {
      const db = openDatabase(file);
      try {
        const app = createApp(createSecurityStore(db));
        expect(await (await app.request("/")).json()).toEqual({ ok: true });
        const response = await app.request("/api/securities");
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.securities).toEqual([
          {
            symbol: "930955.CSI",
            name: "红利低波100",
            assetType: "index",
            exchange: "CSI",
            currency: "CNY",
            source: "hongsehuojian",
            earliestTradeDate: "2005-12-30",
          },
          {
            symbol: "932315.CSI",
            name: "中证红利质量",
            assetType: "index",
            exchange: "CSI",
            currency: "CNY",
            source: "hongsehuojian",
            earliestTradeDate: "2013-12-31",
          },
        ]);
        expect((await app.request("/missing")).status).toBe(404);
      } finally {
        db.$client.close();
      }
    }
  });
  it("事务回滚且内存库可以关闭", (): void => {
    const db = openDatabase(":memory:");
    try {
      expect(() =>
        db.transaction((tx): void => {
          tx.run(sql`DELETE FROM securities`);
          throw new Error("rollback");
        }),
      ).toThrow("rollback");
      expect(createSecurityStore(db).listSecurities()).toHaveLength(2);
    } finally {
      db.$client.close();
    }
  });
  it("数据库损坏时拒绝启动并释放句柄", (): void => {
    const file = path.join(temp(), "broken.sqlite");
    writeFileSync(file, "not sqlite");
    expect(() => openDatabase(file)).toThrow();
    rmSync(file);
  });
  it.each([
    [new ZodError([]), 400, "invalid_argument"],
    [new MarketError(404, "not_found", "证券不存在"), 404, "not_found"],
    [new Error("private details"), 500, "internal"],
  ])("稳定映射错误而不泄漏内部细节 %s", async (error, status, code): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => {});
    const response = await createApp({
      listSecurities: () => {
        throw error;
      },
    }).request("/api/securities");
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
  it("真实 HTTP 可查询并幂等关闭", async (): Promise<void> => {
    const running = startServer({ port: 0, databaseDsn: path.join(temp(), "db.sqlite") });
    await new Promise<void>((resolve): void => {
      running.server.once("listening", resolve);
    });
    const address = running.server.address() as AddressInfo;
    expect(await (await fetch(`http://127.0.0.1:${address.port}/`)).json()).toEqual({ ok: true });
    await running.close();
    await running.close();
  });
  it("启动入口加载配置并注册停止信号", async (): Promise<void> => {
    const folder = temp();
    const original = process.cwd();
    writeFileSync(path.join(folder, ".env"), "PORT=18087\nDATABASE_DSN=:memory:");
    const callbacks: Record<string, () => void> = {};
    vi.spyOn(process, "once").mockImplementation(((event: string, fn: () => void) => {
      callbacks[event] = fn;
      return process;
    }) as typeof process.once);
    process.chdir(folder);
    try {
      const running = main();
      await new Promise<void>((resolve): void => {
        running.server.once("listening", resolve);
      });
      callbacks.SIGINT();
      await new Promise<void>((resolve): void => {
        running.server.once("close", resolve);
      });
      callbacks.SIGTERM();
    } finally {
      process.chdir(original);
    }
  });
});
describe("配置", (): void => {
  it("默认值、文件、进程优先级与重复键沿用首次值", (): void => {
    const file = path.join(temp(), ".env");
    expect(loadConfig(file, {})).toEqual({ port: 8080, databaseDsn: "./data/etf-service.sqlite" });
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
