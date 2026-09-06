import { z } from "zod";
import { tradeDate, addDays, shanghaiDate, dateRange, isWeekday } from "./dates.ts";
import { MarketError } from "./errors.ts";
import type { Security, SecurityStore } from "./securities.ts";

export interface DailyBar {
  symbol: string;
  adjType: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changeAmount: number;
  changePercent: number;
  rawWeekday: string;
}
export interface TradingDay {
  exchange: string;
  tradeDate: string;
  isOpen: number;
}
export interface MarketStore extends SecurityStore {
  findSecurity: (symbol: string) => Security | undefined;
  latestDate: (symbol: string, adjType: string) => string | undefined;
  listBars: (symbol: string, adjType: string, start: string, end: string) => DailyBar[];
  tradingDays: (exchange: string, start: string, end: string) => TradingDay[];
  saveRefresh: (bars: DailyBar[], days: TradingDay[]) => void;
}
export type RemoteFetcher = (
  symbol: string,
  adjType: string,
  signal?: AbortSignal,
) => Promise<DailyBar[]>;
export const dailyBarsRequest = z
  .object({
    symbol: z.string().trim().min(1),
    adjType: z
      .string()
      .trim()
      .transform((value: string): string => value || "qfq")
      .pipe(z.literal("qfq"))
      .default("qfq"),
    startDate: tradeDate.optional(),
    endDate: tradeDate.optional(),
  })
  .refine(
    (value): boolean => !value.startDate || !value.endDate || value.startDate <= value.endDate,
    "起点不能晚于终点",
  );
export interface DailyBarsMeta {
  cacheStatus: "invalid" | "cache" | "refreshed";
  requestedStartDate: string;
  requestedEndDate: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  earliestTradeDate: string;
  latestCachedTradeDate?: string;
  refreshed: boolean;
  rows: number;
}
export interface DailyBarsResponse {
  security: Security;
  bars: DailyBar[];
  meta: DailyBarsMeta;
}
export interface MarketService extends SecurityStore {
  getDailyBars: (
    input: z.output<typeof dailyBarsRequest>,
    signal?: AbortSignal,
  ) => Promise<DailyBarsResponse>;
}
export const createMarketService = (
  store: MarketStore,
  fetcher: RemoteFetcher,
  now: () => Date = (): Date => new Date(),
): MarketService => ({
  listSecurities: (): Security[] => store.listSecurities(),
  getDailyBars: async (
    input: z.output<typeof dailyBarsRequest>,
    signal?: AbortSignal,
  ): Promise<DailyBarsResponse> => {
    const request = input;
    const security = store.findSecurity(request.symbol);
    if (!security) throw new MarketError(404, "not_found", "证券不存在");
    const completed = addDays(shanghaiDate(now()), -1);
    const requestedStartDate = request.startDate ?? security.earliestTradeDate,
      requestedEndDate = request.endDate ?? completed;
    const start =
      requestedStartDate > security.earliestTradeDate
        ? requestedStartDate
        : security.earliestTradeDate;
    const end = requestedEndDate < completed ? requestedEndDate : completed;
    const before = store.latestDate(request.symbol, request.adjType);
    const meta: DailyBarsMeta = {
      cacheStatus: "invalid",
      requestedStartDate,
      requestedEndDate,
      earliestTradeDate: security.earliestTradeDate,
      latestCachedTradeDate: before,
      refreshed: false,
      rows: 0,
    };
    if (start > end)
      return { security: { ...security, latestCachedTradeDate: before }, bars: [], meta };
    const closed = new Set(
      store
        .tradingDays(security.exchange, start, end)
        .filter((day: TradingDay): boolean => day.isOpen === 0)
        .map((day: TradingDay): string => day.tradeDate),
    );
    const required = dateRange(start, end)
      .filter((date: string): boolean => isWeekday(date) && !closed.has(date))
      .at(-1);
    const refreshed = required !== undefined && (before === undefined || before < required);
    if (refreshed)
      await refresh(store, fetcher, request, security, completed, before, start, end, signal);
    const bars = store.listBars(request.symbol, request.adjType, start, end);
    const latest = store.latestDate(request.symbol, request.adjType);
    return {
      security: { ...security, latestCachedTradeDate: latest },
      bars,
      meta: {
        ...meta,
        cacheStatus: refreshed ? "refreshed" : "cache",
        effectiveStartDate: start,
        effectiveEndDate: end,
        latestCachedTradeDate: latest,
        refreshed,
        rows: bars.length,
      },
    };
  },
});

const refresh = async (
  store: MarketStore,
  fetcher: RemoteFetcher,
  request: z.infer<typeof dailyBarsRequest>,
  security: Security,
  completed: string,
  before: string | undefined,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<void> => {
  const remote = await fetcher(request.symbol, request.adjType, signal);
  signal?.throwIfAborted();
  const bars = remote.filter((bar: DailyBar): boolean => bar.tradeDate <= completed);
  const open = new Set(bars.map((bar: DailyBar): string => bar.tradeDate));
  const missing = dateRange(before ? addDays(before, 1) : start, end).filter(
    (date: string): boolean => isWeekday(date) && !open.has(date),
  );
  const days: TradingDay[] = [...open].map(
    (date: string): TradingDay => ({ exchange: security.exchange, tradeDate: date, isOpen: 1 }),
  );
  days.push(
    ...missing.map(
      (date: string): TradingDay => ({
        exchange: security.exchange,
        tradeDate: date,
        isOpen: 0,
      }),
    ),
  );
  // 行情与交易日历作为一次刷新原子提交，失败不能留下部分缓存。
  store.saveRefresh(bars, days);
};
