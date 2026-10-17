import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import type { DailyBar } from "../../../../shared/market.ts";
import { openSqliteDatabase } from "../../../libs/sqlite/database.ts";
import { createSqliteMarketRepository } from "./sqlite-market-repository.ts";

const folders: string[] = [];
const databases: ReturnType<typeof openSqliteDatabase>[] = [];
const temp = (): string => {
  const value = mkdtempSync(path.join(os.tmpdir(), "etf-test-"));
  folders.push(value);
  return value;
};
const open = (file = ":memory:"): ReturnType<typeof openSqliteDatabase> => {
  const db = openSqliteDatabase(file);
  databases.push(db);
  return db;
};
const bar = (date: string, close = 101): DailyBar => ({
  symbol: "932315.CSI",
  adjType: "qfq",
  tradeDate: date,
  open: 100,
  high: 103,
  low: 99,
  close,
  volume: 10,
  amount: 1000,
  changeAmount: 1,
  changePercent: 1,
  rawWeekday: "五",
});
afterEach((): void => {
  for (const db of databases.splice(0)) db.$client.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("SQLite 仓储", (): void => {
  it("迁移幂等、重启保留证券并按代码排序", (): void => {
    const file = path.join(temp(), "nested", "db.sqlite");
    for (let index = 0; index < 2; index++) {
      const db = openSqliteDatabase(file);
      try {
        expect(createSqliteMarketRepository(db).listSecurities()).toEqual([
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
      } finally {
        db.$client.close();
      }
    }
  });
  it("事务回滚后证券仍在", (): void => {
    const db = open();
    const repository = createSqliteMarketRepository(db);
    expect(() =>
      db.transaction((tx): void => {
        tx.run(sql`DELETE FROM securities`);
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(repository.listSecurities()).toHaveLength(2);
  });
  it("数据库损坏时拒绝启动并释放句柄", (): void => {
    const file = path.join(temp(), "broken.sqlite");
    writeFileSync(file, "not sqlite");
    expect(() => openSqliteDatabase(file)).toThrow();
  });
  it("upsert 幂等、按日期返回并记录交易日历", (): void => {
    const repository = createSqliteMarketRepository(open());
    repository.saveRefresh([bar("2026-05-27")], []);
    repository.saveRefresh([{ ...bar("2026-05-29"), close: 102 }], []);
    expect(
      repository
        .listBars("932315.CSI", "qfq", "2026-05-27", "2026-05-30")
        .map((value): number => value.close),
    ).toEqual([101, 102]);
    repository.saveRefresh([], [{ exchange: "CSI", tradeDate: "2026-05-28", isOpen: 0 }]);
    expect(repository.tradingDays("CSI", "2026-05-28", "2026-05-28")).toEqual([
      { exchange: "CSI", tradeDate: "2026-05-28", isOpen: 0 },
    ]);
    expect(repository.latestDate("932315.CSI", "qfq")).toBe("2026-05-29");
  });
  it("写交易日历失败会连同日线回滚", (): void => {
    const db = open();
    const repository = createSqliteMarketRepository(db);
    db.run(
      sql.raw(
        "CREATE TRIGGER reject_calendar BEFORE INSERT ON trading_calendar BEGIN SELECT RAISE(ABORT,'reject'); END;",
      ),
    );
    expect(() =>
      repository.saveRefresh(
        [bar("2026-05-29")],
        [{ exchange: "CSI", tradeDate: "2026-05-29", isOpen: 1 }],
      ),
    ).toThrow();
    expect(repository.latestDate("932315.CSI", "qfq")).toBeUndefined();
  });
});
