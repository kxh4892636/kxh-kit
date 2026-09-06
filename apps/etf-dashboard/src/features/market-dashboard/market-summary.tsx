import type { GetDailyBarsResponse } from "@/libs/api/client";
import type { FC, ReactElement } from "react";
import { formatLargeNumber, formatNumber, formatPercent } from "./market-number-format";

interface MarketSummaryProps {
  data: GetDailyBarsResponse | undefined;
}

/**
 * 摘要卡片把最新行情和数据覆盖范围前置，帮助用户先判断当前图表是否值得继续分析。
 */
export const MarketSummary: FC<MarketSummaryProps> = (props: MarketSummaryProps): ReactElement => {
  const { data } = props;
  const latest = data?.bars?.at(-1);
  const security = data?.security;

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">最新收盘</div>
        <div className="mt-1 text-xl font-semibold text-slate-900">
          {formatNumber(latest?.close ?? Number.NaN, 4)}
        </div>
      </div>
      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">涨跌幅</div>
        <div
          className={`mt-1 text-xl font-semibold ${(latest?.changePercent ?? 0) >= 0 ? "text-red-600" : "text-emerald-600"}`}
        >
          {formatPercent(latest?.changePercent ?? Number.NaN)}
        </div>
      </div>
      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">成交额</div>
        <div className="mt-1 text-xl font-semibold text-slate-900">
          {formatLargeNumber(latest?.amount ?? Number.NaN)}
        </div>
      </div>
      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">数据范围</div>
        <div className="mt-1 text-sm font-medium text-slate-900">
          {security
            ? `${security.earliestTradeDate} 至 ${security.latestCachedTradeDate ?? "-"}`
            : "-"}
        </div>
      </div>
    </div>
  );
};
