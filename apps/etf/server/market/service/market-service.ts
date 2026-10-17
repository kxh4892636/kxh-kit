import type {
  DailyBar,
  DailyBarsMeta,
  DailyBarsResponse,
  Security,
} from "../../../shared/market.ts";
import { addDays, dateRange, isWeekday } from "../../../shared/utils/trade-date.ts";
import { shanghaiDate } from "../../utils/dates.ts";
import type { MarketRepository, TradingDay } from "../repository/market-repository.ts";
import { buildTradingDays } from "./trading-days.ts";
import { MarketError } from "./errors.ts";

export type RemoteFetcher = (
  symbol: string,
  adjType: string,
  signal?: AbortSignal,
) => Promise<DailyBar[]>;

export interface DailyBarsInput {
  symbol: string;
  adjType: string;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export interface MarketService {
  listSecurities: () => Security[];
  getDailyBars: (input: DailyBarsInput, signal?: AbortSignal) => Promise<DailyBarsResponse>;
}

export interface MarketServiceDependencies {
  repository: MarketRepository;
  fetcher: RemoteFetcher;
  now?: () => Date;
}

export const createMarketService = (deps: MarketServiceDependencies): MarketService => {
  const repository = deps.repository;
  const fetcher = deps.fetcher;
  const now = deps.now ?? ((): Date => new Date());
  return {
    listSecurities: (): Security[] => repository.listSecurities(),
    getDailyBars: async (
      input: DailyBarsInput,
      signal?: AbortSignal,
    ): Promise<DailyBarsResponse> => {
      const security = repository.findSecurity(input.symbol);
      if (!security) throw new MarketError("not_found", "证券不存在");
      const completed = addDays(shanghaiDate(now()), -1);
      const requestedStartDate = input.startDate ?? security.earliestTradeDate;
      const requestedEndDate = input.endDate ?? completed;
      const start =
        requestedStartDate > security.earliestTradeDate
          ? requestedStartDate
          : security.earliestTradeDate;
      const end = requestedEndDate < completed ? requestedEndDate : completed;
      const before = repository.latestDate(input.symbol, input.adjType);
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
        repository
          .tradingDays(security.exchange, start, end)
          .filter((day: TradingDay): boolean => day.isOpen === 0)
          .map((day: TradingDay): string => day.tradeDate),
      );
      const required = dateRange(start, end)
        .filter((date: string): boolean => isWeekday(date) && !closed.has(date))
        .at(-1);
      const refreshed = required !== undefined && (before === undefined || before < required);
      if (refreshed)
        await refresh(repository, fetcher, input, security, completed, start, end, signal);
      const bars = repository.listBars(input.symbol, input.adjType, start, end);
      const latest = repository.latestDate(input.symbol, input.adjType);
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
  };
};

const refresh = async (
  repository: MarketRepository,
  fetcher: RemoteFetcher,
  request: DailyBarsInput,
  security: Security,
  completed: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<void> => {
  const remote = await fetcher(request.symbol, request.adjType, signal);
  signal?.throwIfAborted();
  const bars = remote.filter((bar: DailyBar): boolean => bar.tradeDate <= completed);
  // 行情与交易日历作为一次刷新原子提交，失败不能留下部分缓存。
  repository.saveRefresh(bars, buildTradingDays(security, bars, start, end));
};
