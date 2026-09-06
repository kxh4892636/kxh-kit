import { describe, expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useMaSeries } from "./use-ma-series";
import { makeChartBars } from "../../../test-support/render";

describe("useMaSeries", () => {
  test("解析 maText：去重、忽略非法值", { timeout: 15_000 }, async () => {
    const bars = makeChartBars(60);
    const { result } = await renderHook(() =>
      useMaSeries({
        maText: "5, 20 5，abc 1000",
        maBars: bars,
        bars,
        zoomWindow: { start: 0, end: 60 },
        hiddenPeriods: new Set<number>(),
      }),
    );

    expect(result.current.maPeriods).toEqual([5, 20]);
    expect(result.current.maSourceSeries.map((item): number => item.period)).toEqual([5, 20]);
  });

  test("hiddenPeriods 过滤掉对应均线但保留 source", { timeout: 15_000 }, async () => {
    const bars = makeChartBars(60);
    const { result } = await renderHook(() =>
      useMaSeries({
        maText: "5 20",
        maBars: bars,
        bars,
        zoomWindow: { start: 0, end: 60 },
        hiddenPeriods: new Set<number>([20]),
      }),
    );

    expect(result.current.maSourceSeries).toHaveLength(2);
    expect(result.current.maSeries.map((item): number => item.period)).toEqual([5]);
  });

  test("zoomWindow 切片后 values 与可见蜡烛一一对应", { timeout: 15_000 }, async () => {
    const bars = makeChartBars(60);
    const { result } = await renderHook(() =>
      useMaSeries({
        maText: "5",
        maBars: bars,
        bars,
        zoomWindow: { start: 10, end: 20 },
        hiddenPeriods: new Set<number>(),
      }),
    );

    const [series] = result.current.maSeries;
    expect(series?.values).toHaveLength(10);
    // closes[i] = 10 + i * 0.1，MA5 在全局 index 10 = mean(closes[6..10]) = 10.8
    expect(series?.values[0]).toBeCloseTo(10.8, 5);
    expect(series?.values[9]).toBeCloseTo(11.7, 5);
  });

  test(
    "maBars 与 bars 错位且无引用匹配时按 startDate/endDate/label 对齐",
    { timeout: 15_000 },
    async () => {
      const maBars = makeChartBars(60);
      // 复制对象打破引用匹配，强制走 startDate/endDate/label 的匹配路径。
      const bars = maBars.slice(20).map((record) => ({ ...record }));
      const { result } = await renderHook(() =>
        useMaSeries({
          maText: "5",
          maBars,
          bars,
          zoomWindow: { start: 0, end: 5 },
          hiddenPeriods: new Set<number>(),
        }),
      );

      const [series] = result.current.maSeries;
      expect(series?.values).toHaveLength(5);
      // 对齐后切片起点为 maBars 全局 index 20，MA5 = mean(closes[16..20]) = 11.8
      expect(series?.values[0]).toBeCloseTo(11.8, 5);
    },
  );
});
