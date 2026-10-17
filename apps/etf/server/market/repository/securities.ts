import type { Security } from "../../../shared/market.ts";

export const supportedSecurities: Security[] = [
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
