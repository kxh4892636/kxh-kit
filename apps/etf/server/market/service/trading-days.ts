import type { DailyBar, Security } from "../../../shared/market.ts";
import { dateRange, isWeekday } from "../../../shared/utils/trade-date.ts";
import type { TradingDay } from "../repository/market-repository.ts";

/** 区间内的工作日按是否有日线标记开市/闭市；周末不入表。 */
export const buildTradingDays = (
  security: Security,
  bars: DailyBar[],
  start: string,
  end: string,
): TradingDay[] => {
  const open = new Set(
    bars
      .filter((bar: DailyBar): boolean => bar.tradeDate >= start && bar.tradeDate <= end)
      .map((bar: DailyBar): string => bar.tradeDate),
  );
  const days: TradingDay[] = [];
  for (const date of dateRange(start, end)) {
    if (!isWeekday(date)) continue;
    days.push({ exchange: security.exchange, tradeDate: date, isOpen: open.has(date) ? 1 : 0 });
  }
  return days;
};
