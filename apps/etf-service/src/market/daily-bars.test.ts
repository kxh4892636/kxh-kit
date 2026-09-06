import { afterEach, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { openDatabase } from "../storage/database.ts";
import { createMarketStore } from "../storage/market-store.ts";
import { createMarketService, type DailyBar } from "./daily-bars.ts";
import { createApp } from "../app.ts";
import { MarketError } from "./errors.ts";
const databases: ReturnType<typeof openDatabase>[] = [];
const setup = () => {
  const db = openDatabase(":memory:");
  databases.push(db);
  const store = createMarketStore(db);
  const fetcher = vi.fn(async (): Promise<DailyBar[]> => [bar("2026-05-29"), bar("2026-05-31")]);
  const service = createMarketService(store, fetcher, (): Date => new Date("2026-05-31T04:00:00Z"));
  return { db, store, fetcher, service, app: createApp(service) };
};
const bar = (date: string): DailyBar => ({
  symbol: "932315.CSI",
  adjType: "qfq",
  tradeDate: date,
  open: 100,
  high: 103,
  low: 99,
  close: 101,
  volume: 10,
  amount: 1000,
  changeAmount: 1,
  changePercent: 1,
  rawWeekday: "五",
});
afterEach((): void => {
  for (const db of databases.splice(0)) db.$client.close();
  vi.restoreAllMocks();
});
it("首次刷新、裁剪到昨日、再次命中缓存且目录包含最新日期", async (): Promise<void> => {
  const { app, fetcher } = setup();
  const response = await app.request(
    "/api/daily-bars?symbol=932315.CSI&startDate=2026-05-28&endDate=2026-05-31",
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.bars).toEqual([bar("2026-05-29")]);
  expect(body.meta).toMatchObject({
    cacheStatus: "refreshed",
    effectiveEndDate: "2026-05-30",
    rows: 1,
    refreshed: true,
  });
  const cached = await (
    await app.request("/api/daily-bars?symbol=932315.CSI&startDate=2026-05-28")
  ).json();
  expect(cached.meta.cacheStatus).toBe("cache");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    (await (await app.request("/api/securities")).json()).securities[1].latestCachedTradeDate,
  ).toBe("2026-05-29");
});
it.each([
  "",
  "symbol=",
  "symbol=932315.CSI&adjType=none",
  "symbol=932315.CSI&startDate=2026-02-30",
  "symbol=932315.CSI&endDate=bad",
  "symbol=932315.CSI&startDate=2026-05-30&endDate=2026-05-29",
])("拒绝错误请求 %s", async (query): Promise<void> => {
  const { app, fetcher } = setup();
  expect((await app.request("/api/daily-bars?" + query)).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("未知证券返回 404", async (): Promise<void> => {
  const { app } = setup();
  expect((await app.request("/api/daily-bars?symbol=no")).status).toBe(404);
});
it("区间为空不拉取，上限与最早日期裁剪", async (): Promise<void> => {
  const { service, fetcher } = setup();
  expect(
    (await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", endDate: "2010-01-01" }))
      .meta,
  ).toMatchObject({ cacheStatus: "invalid", rows: 0 });
  expect(fetcher).not.toHaveBeenCalled();
  const normal = await service.getDailyBars({
    symbol: "932315.CSI",
    startDate: "2010-01-01",
    adjType: "qfq",
  });
  expect(normal.meta.effectiveStartDate).toBe("2013-12-31");
});
it("仅周末或已记录闭市日无需刷新", async (): Promise<void> => {
  const { service, store, fetcher } = setup();
  expect(
    (await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-30" }))
      .meta.cacheStatus,
  ).toBe("cache");
  store.saveRefresh([], [{ exchange: "CSI", tradeDate: "2026-05-29", isOpen: 0 }]);
  expect(
    (await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-29" }))
      .meta.cacheStatus,
  ).toBe("cache");
  expect(fetcher).not.toHaveBeenCalled();
});
it("旧缓存刷新闭市日，upsert 幂等且按日期返回", async (): Promise<void> => {
  const { store, service } = setup();
  store.saveRefresh([bar("2026-05-27")], []);
  await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-27" });
  store.saveRefresh([{ ...bar("2026-05-29"), close: 102 }], []);
  expect(
    store
      .listBars("932315.CSI", "qfq", "2026-05-27", "2026-05-30")
      .map((value): number => value.close),
  ).toEqual([101, 102]);
  expect(store.tradingDays("CSI", "2026-05-28", "2026-05-28")).toEqual([
    { exchange: "CSI", tradeDate: "2026-05-28", isOpen: 0 },
  ]);
});
it("上海跨日使用本地昨日", async (): Promise<void> => {
  const { store, fetcher } = setup();
  const service = createMarketService(store, fetcher, (): Date => new Date("2026-05-29T16:00:00Z"));
  expect(
    (await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-29" }))
      .meta.effectiveEndDate,
  ).toBe("2026-05-29");
});
it("写交易日历失败会连同日线回滚", (): void => {
  const { db, store } = setup();
  db.run(
    sql.raw(
      "CREATE TRIGGER reject_calendar BEFORE INSERT ON trading_calendar BEGIN SELECT RAISE(ABORT,'reject'); END;",
    ),
  );
  expect(() =>
    store.saveRefresh(
      [bar("2026-05-29")],
      [{ exchange: "CSI", tradeDate: "2026-05-29", isOpen: 1 }],
    ),
  ).toThrow();
  expect(store.latestDate("932315.CSI", "qfq")).toBeUndefined();
});
it("取消发生在上游返回时也不写入", async (): Promise<void> => {
  const { store } = setup();
  const controller = new AbortController();
  const service = createMarketService(store, async (): Promise<DailyBar[]> => {
    controller.abort();
    return [bar("2026-05-29")];
  });
  await expect(
    service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI" }, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(store.latestDate("932315.CSI", "qfq")).toBeUndefined();
});
it("HTTP 映射上游异常和取消", async (): Promise<void> => {
  const { store } = setup();
  const app = createApp(
    createMarketService(store, async (): Promise<DailyBar[]> => {
      throw new MarketError(502, "upstream_unavailable", "上游行情不可用");
    }),
  );
  expect((await app.request("/api/daily-bars?symbol=932315.CSI")).status).toBe(502);
  const controller = new AbortController();
  controller.abort();
  expect(
    (
      await app.request(
        new Request("http://localhost/api/daily-bars?symbol=932315.CSI", {
          signal: controller.signal,
        }),
      )
    ).status,
  ).toBe(408);
});
