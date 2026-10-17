import type { DailyBar, Security } from "../../../shared/market.ts";

export interface TradingDay {
  exchange: string;
  tradeDate: string;
  isOpen: number;
}

/** 数据库访问接口；SQLite/MySQL/PostgreSQL 实现均需满足此契约。 */
export interface MarketRepository {
  listSecurities: () => Security[];
  findSecurity: (symbol: string) => Security | undefined;
  latestDate: (symbol: string, adjType: string) => string | undefined;
  listBars: (symbol: string, adjType: string, start: string, end: string) => DailyBar[];
  tradingDays: (exchange: string, start: string, end: string) => TradingDay[];
  saveRefresh: (bars: DailyBar[], days: TradingDay[]) => void;
}
