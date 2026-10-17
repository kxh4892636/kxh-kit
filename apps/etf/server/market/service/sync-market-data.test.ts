import { expect, test, vi } from "vite-plus/test";
import type { DailyBar, Security } from "../../../shared/market.ts";
import type { MarketRepository, TradingDay } from "../repository/market-repository.ts";
import { syncMarketData } from "./sync-market-data.ts";

const securities: Security[] = [
  {
    symbol: "932315.CSI",
    name: "中证红利质量",
    assetType: "index",
    exchange: "CSI",
    currency: "CNY",
    source: "hongsehuojian",
    earliestTradeDate: "2013-12-31",
  },
  {
    symbol: "930955.CSI",
    name: "红利低波100",
    assetType: "index",
    exchange: "CSI",
    currency: "CNY",
    source: "hongsehuojian",
    earliestTradeDate: "2005-12-30",
  },
];
const bar = (symbol: string, date: string): DailyBar => ({
  symbol,
  adjType: "qfq",
  tradeDate: date,
  open: 1,
  high: 1,
  low: 1,
  close: 1,
  volume: 1,
  amount: 1,
  changeAmount: 0,
  changePercent: 0,
  rawWeekday: "",
});

const createRepository = () => {
  const seeded = new Map(securities.map((item): [string, Security] => [item.symbol, item]));
  const saves: Array<{ bars: DailyBar[]; days: TradingDay[] }> = [];
  const repository: MarketRepository = {
    listSecurities: (): Security[] => [...seeded.values()],
    findSecurity: (symbol: string): Security | undefined => seeded.get(symbol),
    latestDate: (): string | undefined => undefined,
    listBars: (): DailyBar[] => [],
    tradingDays: (): TradingDay[] => [],
    saveRefresh: (bars: DailyBar[], days: TradingDay[]): void => {
      saves.push({ bars, days });
    },
  };
  return { repository, saves };
};

test("遍历证券、过滤未完成日期并写回全量摘要", async (): Promise<void> => {
  const { repository, saves } = createRepository();
  const fetcher = vi.fn(async (symbol: string): Promise<DailyBar[]> => [
    bar(symbol, "2013-12-30"),
    bar(symbol, symbol === "932315.CSI" ? "2013-12-31" : "2005-12-30"),
    bar(symbol, "2026-10-16"),
    bar(symbol, "2026-10-17"),
  ]);
  const summary = await syncMarketData({
    repository,
    fetcher,
    now: (): Date => new Date("2026-10-17T04:00:00Z"),
  });
  expect(summary).toEqual([
    {
      symbol: "932315.CSI",
      name: "中证红利质量",
      rows: 2,
      earliestTradeDate: "2013-12-31",
      latestTradeDate: "2026-10-16",
    },
    {
      symbol: "930955.CSI",
      name: "红利低波100",
      rows: 3,
      earliestTradeDate: "2005-12-30",
      latestTradeDate: "2026-10-16",
    },
  ]);
  expect(saves).toHaveLength(2);
  expect(saves[0]?.bars.map((item): string => item.tradeDate)).toEqual([
    "2013-12-31",
    "2026-10-16",
  ]);
  expect(saves[0]?.days).toEqual(
    expect.arrayContaining([
      { exchange: "CSI", tradeDate: "2013-12-31", isOpen: 1 },
      { exchange: "CSI", tradeDate: "2026-10-16", isOpen: 1 },
      { exchange: "CSI", tradeDate: "2026-10-15", isOpen: 0 },
    ]),
  );
});

test("未知证券与空上游返回稳定错误", async (): Promise<void> => {
  const { repository } = createRepository();
  await expect(
    syncMarketData(
      {
        repository,
        fetcher: async (): Promise<DailyBar[]> => [],
        now: (): Date => new Date("2026-10-17T04:00:00Z"),
      },
      { symbols: ["no"] },
    ),
  ).rejects.toMatchObject({ code: "not_found" });
  await expect(
    syncMarketData({
      repository,
      fetcher: async (): Promise<DailyBar[]> => [],
      now: (): Date => new Date("2026-10-17T04:00:00Z"),
    }),
  ).rejects.toMatchObject({ code: "upstream_unavailable" });
});
