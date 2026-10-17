import { expect, test } from "vite-plus/test";
import type { DailyBar, Security } from "../../../shared/market.ts";
import { buildTradingDays } from "./trading-days.ts";

const security: Security = {
  symbol: "932315.CSI",
  name: "中证红利质量",
  assetType: "index",
  exchange: "CSI",
  currency: "CNY",
  source: "hongsehuojian",
  earliestTradeDate: "2026-05-29",
};
const bar = (date: string): DailyBar => ({
  symbol: security.symbol,
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

test("工作日按日线标记开市，缺失工作日标记闭市，周末不入表", (): void => {
  expect(
    buildTradingDays(security, [bar("2026-05-29"), bar("2026-06-01")], "2026-05-29", "2026-06-01"),
  ).toEqual([
    { exchange: "CSI", tradeDate: "2026-05-29", isOpen: 1 },
    { exchange: "CSI", tradeDate: "2026-06-01", isOpen: 1 },
  ]);
  expect(buildTradingDays(security, [bar("2026-05-29")], "2026-05-29", "2026-06-02")).toEqual([
    { exchange: "CSI", tradeDate: "2026-05-29", isOpen: 1 },
    { exchange: "CSI", tradeDate: "2026-06-01", isOpen: 0 },
    { exchange: "CSI", tradeDate: "2026-06-02", isOpen: 0 },
  ]);
});
