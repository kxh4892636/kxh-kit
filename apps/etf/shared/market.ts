export interface Security {
  symbol: string;
  name: string;
  assetType: string;
  exchange: string;
  currency: string;
  source: string;
  earliestTradeDate: string;
  latestCachedTradeDate?: string | undefined;
}

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

export interface DailyBarsMeta {
  cacheStatus: "invalid" | "cache" | "refreshed";
  requestedStartDate: string;
  requestedEndDate: string;
  effectiveStartDate?: string | undefined;
  effectiveEndDate?: string | undefined;
  earliestTradeDate: string;
  latestCachedTradeDate?: string | undefined;
  refreshed: boolean;
  rows: number;
}

export interface DailyBarsResponse {
  security: Security;
  bars: DailyBar[];
  meta: DailyBarsMeta;
}
