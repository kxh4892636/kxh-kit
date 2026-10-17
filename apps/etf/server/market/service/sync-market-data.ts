import type { DailyBar, Security } from "../../../shared/market.ts";
import { addDays } from "../../../shared/utils/trade-date.ts";
import { shanghaiDate } from "../../utils/dates.ts";
import type { MarketRepository } from "../repository/market-repository.ts";
import { MarketError } from "./errors.ts";
import type { RemoteFetcher } from "./market-service.ts";
import { buildTradingDays } from "./trading-days.ts";

export interface MarketSyncSummary {
  symbol: string;
  name: string;
  rows: number;
  earliestTradeDate?: string | undefined;
  latestTradeDate?: string | undefined;
}

export interface MarketSyncDependencies {
  repository: MarketRepository;
  fetcher: RemoteFetcher;
  now?: () => Date;
}

export interface MarketSyncOptions {
  symbols?: string[];
}

/**
 * 全量同步 workflow：逐个证券拉取历史行情，裁剪到上海昨日，
 * 生成交易日历并原子写入，返回覆盖摘要。
 */
export const syncMarketData = async (
  deps: MarketSyncDependencies,
  options: MarketSyncOptions = {},
): Promise<MarketSyncSummary[]> => {
  const now = deps.now ?? ((): Date => new Date());
  const completed = addDays(shanghaiDate(now()), -1);
  const securities: Security[] = options.symbols
    ? options.symbols.map((symbol: string): Security => {
        const security = deps.repository.findSecurity(symbol);
        if (!security) throw new MarketError("not_found", "证券不存在: " + symbol);
        return security;
      })
    : deps.repository.listSecurities();
  const summaries: MarketSyncSummary[] = [];
  for (const security of securities) {
    const remote = await deps.fetcher(security.symbol, "qfq");
    const bars = remote
      .filter(
        (bar: DailyBar): boolean =>
          bar.tradeDate >= security.earliestTradeDate && bar.tradeDate <= completed,
      )
      .sort((left: DailyBar, right: DailyBar): number =>
        left.tradeDate.localeCompare(right.tradeDate),
      );
    if (bars.length === 0)
      throw new MarketError("upstream_unavailable", "上游未返回行情: " + security.symbol);
    deps.repository.saveRefresh(
      bars,
      buildTradingDays(security, bars, security.earliestTradeDate, completed),
    );
    summaries.push({
      symbol: security.symbol,
      name: security.name,
      rows: bars.length,
      earliestTradeDate: bars[0]?.tradeDate,
      latestTradeDate: bars.at(-1)?.tradeDate,
    });
  }
  return summaries;
};
