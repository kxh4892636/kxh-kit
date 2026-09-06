import { useMemo } from "react";
import {
  calculateMaSeries,
  calculateVirtualMaSeries,
  parseMaPeriods,
  VIRTUAL_MA_COLOR,
  type ChartBar,
  type MaSeries,
  type VirtualMaSeries,
} from "./chart-data";
import type { ZoomWindow } from "./kline-interactions";
import { parseVirtualMaExpression, type VirtualMaExpression } from "./virtual-ma-expression";

interface UseMaSeriesResult {
  maPeriods: number[];
  maSourceSeries: MaSeries[];
  maSeries: MaSeries[];
  virtualMa: VirtualMaSeries | null;
}

/**
 * 在日线基准数组中定位可见数据的起点。
 * bars 可能已按周期或范围聚合，maBars 保留完整日线基准，
 * 先通过对象引用匹配，失败后按 startDate/endDate/label 匹配。
 */
const getMaStartIndex = (params: { bars: ChartBar[]; maBars: ChartBar[] }): number => {
  const firstBar = params.bars[0];
  if (!firstBar) {
    return 0;
  }

  const identityIndex = params.maBars.indexOf(firstBar);
  if (identityIndex >= 0) {
    return identityIndex;
  }

  const matchedIndex = params.maBars.findIndex(
    (record: ChartBar): boolean =>
      record.startDate === firstBar.startDate &&
      record.endDate === firstBar.endDate &&
      record.label === firstBar.label,
  );
  return Math.max(matchedIndex, 0);
};

/**
 * 均线数据一站式 hook。
 * 输入原始数据和视图参数，输出渲染就绪的 MA 数组。
 *
 * @returns maPeriods 解析后的均线周期、maSourceSeries 完整均线（供图例开关）、maSeries 已切片并过滤隐藏周期的均线、virtualMa 已切片的虚拟均线（表达式为空或非法时为 null）
 */
export const useMaSeries = (params: {
  maText: string;
  virtualMaText?: string;
  maBars: ChartBar[];
  bars: ChartBar[];
  zoomWindow: ZoomWindow;
  hiddenPeriods: Set<number>;
}): UseMaSeriesResult => {
  const { maText, virtualMaText, maBars, bars, zoomWindow, hiddenPeriods } = params;

  const maPeriods = useMemo((): number[] => parseMaPeriods(maText), [maText]);

  const maStartIndex = useMemo((): number => getMaStartIndex({ bars, maBars }), [bars, maBars]);

  const maSourceSeries = useMemo(
    (): MaSeries[] => calculateMaSeries({ bars: maBars, periods: maPeriods }),
    [maBars, maPeriods],
  );

  const maSeries = useMemo(
    (): MaSeries[] =>
      maSourceSeries
        .filter((series: MaSeries): boolean => !hiddenPeriods.has(series.period))
        .map(
          (series: MaSeries): MaSeries => ({
            ...series,
            // MA 数组跟随可见窗口切片，保证 tooltip、hover index 和蜡烛索引始终一一对应。
            values: series.values.slice(
              maStartIndex + zoomWindow.start,
              maStartIndex + zoomWindow.end,
            ),
          }),
        ),
    [hiddenPeriods, maSourceSeries, maStartIndex, zoomWindow.end, zoomWindow.start],
  );

  const virtualMaExpression = useMemo(
    (): VirtualMaExpression | null =>
      virtualMaText ? parseVirtualMaExpression(virtualMaText) : null,
    [virtualMaText],
  );

  const virtualMa = useMemo((): VirtualMaSeries | null => {
    if (!virtualMaExpression) return null;
    const sourceValues = calculateVirtualMaSeries({
      bars: maBars,
      expression: virtualMaExpression,
    });
    return {
      color: VIRTUAL_MA_COLOR,
      values: sourceValues.slice(maStartIndex + zoomWindow.start, maStartIndex + zoomWindow.end),
    };
  }, [virtualMaExpression, maBars, maStartIndex, zoomWindow.end, zoomWindow.start]);

  return { maPeriods, maSourceSeries, maSeries, virtualMa };
};
