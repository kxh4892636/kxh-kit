import type { CSSProperties, FC, ReactElement } from "react";
import type { ChartBar } from "./chart-data";
import { formatLargeNumber, formatNumber, formatPercent } from "../market-number-format";

export interface TooltipMaValue {
  label: string;
  value: number;
  color: string;
}

interface KlineTooltipProps {
  record: ChartBar;
  maValues: TooltipMaValue[];
  virtualMaValue: TooltipMaValue | null;
  left: number;
  top: number;
}

export const KlineTooltip: FC<KlineTooltipProps> = (props: KlineTooltipProps): ReactElement => {
  const { record, maValues, virtualMaValue, left, top } = props;
  const trendClass = record.changeAmount >= 0 ? "text-red-600" : "text-emerald-600";
  const title =
    record.startDate !== record.endDate
      ? `${record.startDate} 至 ${record.endDate}`
      : record.tradeDate;
  const position: CSSProperties = { left, top };

  return (
    <div
      className="pointer-events-none absolute z-10 w-[236px] rounded border border-slate-200 bg-white/95 p-3 text-slate-700 shadow-lg"
      style={position}
    >
      <div className="mb-2 flex items-center justify-between gap-4 font-medium">
        <span>{title}</span>
        <span className={trendClass}>{formatPercent(record.changePercent)}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs">
        <span>开盘</span>
        <b className="text-right">{formatNumber(record.open, 4)}</b>
        <span>最高</span>
        <b className="text-right">{formatNumber(record.high, 4)}</b>
        <span>最低</span>
        <b className="text-right">{formatNumber(record.low, 4)}</b>
        <span>收盘</span>
        <b className="text-right">{formatNumber(record.close, 4)}</b>
        <span>涨跌额</span>
        <b className={`text-right ${trendClass}`}>
          {record.changeAmount >= 0 ? "+" : ""}
          {formatNumber(record.changeAmount, 4)}
        </b>
        <span>成交量</span>
        <b className="text-right">{formatLargeNumber(record.volume)}</b>
        <span>成交额</span>
        <b className="text-right">{formatLargeNumber(record.amount)}</b>
      </div>
      {(maValues.length > 0 || virtualMaValue) && (
        <div className="mt-2 border-t border-slate-200 pt-2 text-xs">
          {maValues.map(
            (item: TooltipMaValue): ReactElement => (
              <div key={item.label} className="flex justify-between gap-4">
                <span>{item.label}</span>
                <b style={{ color: item.color }}>{formatNumber(item.value, 2)}</b>
              </div>
            ),
          )}
          {virtualMaValue && (
            <div className="flex justify-between gap-4">
              <span>{virtualMaValue.label}</span>
              <b style={{ color: virtualMaValue.color }}>{formatNumber(virtualMaValue.value, 2)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
