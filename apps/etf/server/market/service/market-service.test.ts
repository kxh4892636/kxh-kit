import { afterEach, expect, it, vi } from "vite-plus/test";
import type { DailyBar, Security } from "../../../shared/market.ts";
import type { MarketRepository, TradingDay } from "../repository/market-repository.ts";
import { MarketError } from "./errors.ts";
import { createMarketService } from "./market-service.ts";

const security: Security = {
  symbol: "932315.CSI",
  name: "中证红利质量",
  assetType: "index",
  exchange: "CSI",
  currency: "CNY",
  source: "hongsehuojian",
  earliestTradeDate: "2013-12-31",
};
const bar = (date: string): DailyBar => ({
  symbol: security.symbol,
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

/** 内存仓储替身：证明业务用例不依赖 SQLite/Hono。 */
const createFakeRepository = (): MarketRepository => {
  const bars = new Map<string, DailyBar>();
  const days = new Map<string, TradingDay>();
  const key = (symbol: string, adjType: string, date: string): string =>
    [symbol, adjType, date].join("|");
  return {
    listSecurities: (): Security[] => [security],
    findSecurity: (symbol: string): Security | undefined =>
      symbol === security.symbol ? security : undefined,
    latestDate: (symbol: string, adjType: string): string | undefined =>
      [...bars.values()]
        .filter((item): boolean => item.symbol === symbol && item.adjType === adjType)
        .map((item): string => item.tradeDate)
        .sort()
        .at(-1),
    listBars: (symbol: string, adjType: string, start: string, end: string): DailyBar[] =>
      [...bars.values()]
        .filter(
          (item): boolean =>
            item.symbol === symbol &&
            item.adjType === adjType &&
            item.tradeDate >= start &&
            item.tradeDate <= end,
        )
        .sort((left, right): number => left.tradeDate.localeCompare(right.tradeDate)),
    tradingDays: (exchange: string, start: string, end: string): TradingDay[] =>
      [...days.values()].filter(
        (day): boolean =>
          day.exchange === exchange && day.tradeDate >= start && day.tradeDate <= end,
      ),
    saveRefresh: (nextBars: DailyBar[], nextDays: TradingDay[]): void => {
      for (const item of nextBars) bars.set(key(item.symbol, item.adjType, item.tradeDate), item);
      for (const day of nextDays) days.set([day.exchange, day.tradeDate].join("|"), day);
    },
  };
};

const setup = () => {
  const repository = createFakeRepository();
  const fetcher = vi.fn(async (): Promise<DailyBar[]> => [bar("2026-05-29"), bar("2026-05-31")]);
  const service = createMarketService({
    repository,
    fetcher,
    now: (): Date => new Date("2026-05-31T04:00:00Z"),
  });
  return { repository, fetcher, service };
};
afterEach((): void => {
  vi.restoreAllMocks();
});

it("首次刷新、裁剪到昨日、再次命中缓存并更新最新缓存日期", async (): Promise<void> => {
  const { repository, fetcher, service } = setup();
  const data = await service.getDailyBars({
    symbol: "932315.CSI",
    adjType: "qfq",
    startDate: "2026-05-28",
    endDate: "2026-05-31",
  });
  expect(data.bars).toEqual([bar("2026-05-29")]);
  expect(data.meta).toMatchObject({
    cacheStatus: "refreshed",
    effectiveEndDate: "2026-05-30",
    rows: 1,
    refreshed: true,
  });
  expect(repository.latestDate("932315.CSI", "qfq")).toBe("2026-05-29");
  const cached = await service.getDailyBars({
    symbol: "932315.CSI",
    adjType: "qfq",
    startDate: "2026-05-28",
  });
  expect(cached.meta.cacheStatus).toBe("cache");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("未知证券抛出 not_found", async (): Promise<void> => {
  const { service } = setup();
  await expect(service.getDailyBars({ symbol: "no", adjType: "qfq" })).rejects.toMatchObject({
    code: "not_found",
  });
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
  const { repository, service, fetcher } = setup();
  expect(
    (await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-30" }))
      .meta.cacheStatus,
  ).toBe("cache");
  repository.saveRefresh([], [{ exchange: "CSI", tradeDate: "2026-05-29", isOpen: 0 }]);
  expect(
    (await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-29" }))
      .meta.cacheStatus,
  ).toBe("cache");
  expect(fetcher).not.toHaveBeenCalled();
});
it("旧缓存刷新闭市日，upsert 幂等且按日期返回", async (): Promise<void> => {
  const { repository, service } = setup();
  repository.saveRefresh([bar("2026-05-27")], []);
  await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-27" });
  repository.saveRefresh([{ ...bar("2026-05-29"), close: 102 }], []);
  expect(
    repository
      .listBars("932315.CSI", "qfq", "2026-05-27", "2026-05-30")
      .map((value): number => value.close),
  ).toEqual([101, 102]);
  expect(repository.tradingDays("CSI", "2026-05-28", "2026-05-28")).toEqual([
    { exchange: "CSI", tradeDate: "2026-05-28", isOpen: 0 },
  ]);
});
it("上海跨日使用本地昨日", async (): Promise<void> => {
  const { repository, fetcher } = setup();
  const service = createMarketService({
    repository,
    fetcher,
    now: (): Date => new Date("2026-05-29T16:00:00Z"),
  });
  expect(
    (await service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI", startDate: "2026-05-29" }))
      .meta.effectiveEndDate,
  ).toBe("2026-05-29");
});
it("取消发生在上游返回时也不写入", async (): Promise<void> => {
  const { repository } = setup();
  const controller = new AbortController();
  const service = createMarketService({
    repository,
    fetcher: async (): Promise<DailyBar[]> => {
      controller.abort();
      return [bar("2026-05-29")];
    },
    now: (): Date => new Date("2026-05-31T04:00:00Z"),
  });
  await expect(
    service.getDailyBars({ adjType: "qfq", symbol: "932315.CSI" }, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(repository.latestDate("932315.CSI", "qfq")).toBeUndefined();
});
it("上游业务错误保持域内错误码", async (): Promise<void> => {
  const { repository } = setup();
  const service = createMarketService({
    repository,
    fetcher: async (): Promise<DailyBar[]> => {
      throw new MarketError("upstream_unavailable", "上游行情不可用");
    },
    now: (): Date => new Date("2026-05-31T04:00:00Z"),
  });
  await expect(
    service.getDailyBars({ symbol: "932315.CSI", adjType: "qfq" }),
  ).rejects.toMatchObject({ code: "upstream_unavailable" });
});
