import type { FC, ReactElement } from "react";
import type { MaSeries } from "./chart-data";

interface VirtualMaLegendItem {
  color: string;
  hidden: boolean;
  onToggle: () => void;
}

interface MaLegendProps {
  series: MaSeries[];
  hiddenPeriods: ReadonlySet<number>;
  onToggle: (period: number) => void;
  virtualMa?: VirtualMaLegendItem | null;
}

export const MaLegend: FC<MaLegendProps> = (props: MaLegendProps): ReactElement => {
  const { series, hiddenPeriods, onToggle, virtualMa } = props;

  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
      {series.map(
        (maSeries: MaSeries): ReactElement => (
          <button
            key={maSeries.period}
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              hiddenPeriods.has(maSeries.period)
                ? "border-slate-200 text-slate-400"
                : "border-slate-300"
            }`}
            onClick={(): void => onToggle(maSeries.period)}
          >
            <span
              className="mr-1 inline-block size-2 rounded-full"
              style={{ background: maSeries.color }}
            />
            MA{maSeries.period}
          </button>
        ),
      )}
      {virtualMa && (
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            virtualMa.hidden ? "border-slate-200 text-slate-400" : "border-slate-300"
          }`}
          onClick={virtualMa.onToggle}
        >
          <span
            className="mr-1 inline-block w-3 align-middle"
            style={{ borderTop: `2px dashed ${virtualMa.color}` }}
          />
          虚拟
        </button>
      )}
    </div>
  );
};
