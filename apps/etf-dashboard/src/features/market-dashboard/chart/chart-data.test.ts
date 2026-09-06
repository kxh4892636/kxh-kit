import { describe, expect, it } from "vitest";

import type { DailyBar } from "../../../libs/api/client";

import {
  aggregateBars,
  calculateMaSeries,
  calculateVirtualMaSeries,
  getRangeBars,
  MA_COLORS,
  normalizeBars,
  parseMaPeriods,
  type ChartBar,
} from "./chart-data";
import { parseVirtualMaExpression, type VirtualMaExpression } from "./virtual-ma-expression";

const makeBar = (tradeDate: string, overrides: Partial<DailyBar> = {}): DailyBar =>
  ({
    tradeDate,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
    amount: 0,
    changeAmount: 0,
    changePercent: 0,
    ...overrides,
  }) as DailyBar;

const makeChartBar = (tradeDate: string, overrides: Partial<DailyBar> = {}): ChartBar =>
  normalizeBars([makeBar(tradeDate, overrides)])[0] as ChartBar;

describe("normalizeBars", () => {
  it("从 tradeDate 解析出年月日和 UTC 毫秒，并初始化 startDate/endDate/label", () => {
    const [bar] = normalizeBars([makeBar("2024-03-05", { close: 12.3 })]);
    expect(bar?.year).toBe(2024);
    expect(bar?.month).toBe(3);
    expect(bar?.day).toBe(5);
    expect(bar?.dateMs).toBe(Date.UTC(2024, 2, 5));
    expect(bar?.startDate).toBe("2024-03-05");
    expect(bar?.endDate).toBe("2024-03-05");
    expect(bar?.label).toBe("2024-03-05");
    expect(bar?.close).toBe(12.3);
  });

  it("保留输入顺序与数量", () => {
    const bars = normalizeBars([makeBar("2024-01-02"), makeBar("2024-01-03")]);
    expect(bars.map((bar) => bar.tradeDate)).toEqual(["2024-01-02", "2024-01-03"]);
  });
});

describe("aggregateBars", () => {
  it("period 为 day 时直接返回规范化后的日线", () => {
    const result = aggregateBars({
      bars: [makeBar("2024-01-02", { close: 10 }), makeBar("2024-01-03", { close: 11 })],
      period: "day",
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.label).toBe("2024-01-02");
    expect(result[1]?.label).toBe("2024-01-03");
  });

  describe("按周聚合", () => {
    // 2024-01-01 是周一，2024-01-07 是周日，2024-01-08 是下一个周一。
    const bars = [
      makeBar("2024-01-01", { open: 10, high: 12, low: 9, close: 11, volume: 100, amount: 1000 }),
      makeBar("2024-01-02", { open: 11, high: 13, low: 10, close: 12, volume: 200, amount: 2000 }),
      makeBar("2024-01-03", { open: 12, high: 14, low: 11, close: 13, volume: 300, amount: 3000 }),
      makeBar("2024-01-07", { open: 13, high: 15, low: 12, close: 14, volume: 400, amount: 4000 }),
      makeBar("2024-01-08", { open: 14, high: 16, low: 13, close: 15, volume: 500, amount: 5000 }),
      makeBar("2024-01-09", { open: 15, high: 17, low: 14, close: 16, volume: 600, amount: 6000 }),
    ];
    const result = aggregateBars({ bars, period: "week" });

    it("自然周以周一为界：周日归入前一周，跨年周末不被拆开", () => {
      expect(result).toHaveLength(2);
      expect(result[0]?.label).toBe("2024-01-01");
      expect(result[1]?.label).toBe("2024-01-08");
      expect(result[0]?.startDate).toBe("2024-01-01");
      expect(result[0]?.endDate).toBe("2024-01-07");
      expect(result[1]?.startDate).toBe("2024-01-08");
      expect(result[1]?.endDate).toBe("2024-01-09");
    });

    it("OHLC 取首根开盘、区间最高、区间最低、末根收盘", () => {
      const first = result[0];
      expect(first?.open).toBe(10);
      expect(first?.high).toBe(15);
      expect(first?.low).toBe(9);
      expect(first?.close).toBe(14);
    });

    it("volume 与 amount 为组内求和", () => {
      expect(result[0]?.volume).toBe(1000);
      expect(result[0]?.amount).toBe(10000);
      expect(result[1]?.volume).toBe(1100);
      expect(result[1]?.amount).toBe(11000);
    });

    it("首组涨跌以开盘价兜底，后续组以前一组收盘价为基准", () => {
      const first = result[0];
      expect(first?.changeAmount).toBe(14 - 10);
      expect(first?.changePercent).toBeCloseTo(40, 10);
      const second = result[1];
      expect(second?.changeAmount).toBe(16 - 14);
      expect(second?.changePercent).toBeCloseTo((2 / 14) * 100, 10);
    });
  });

  describe("按月聚合", () => {
    it("同月归入一组，label 为 YYYY-MM", () => {
      const result = aggregateBars({
        bars: [
          makeBar("2024-01-30", {
            open: 20,
            high: 22,
            low: 19,
            close: 21,
            volume: 10,
            amount: 100,
          }),
          makeBar("2024-01-31", {
            open: 21,
            high: 23,
            low: 20,
            close: 22,
            volume: 20,
            amount: 200,
          }),
          makeBar("2024-02-01", {
            open: 22,
            high: 24,
            low: 21,
            close: 23,
            volume: 30,
            amount: 300,
          }),
        ],
        period: "month",
      });
      expect(result).toHaveLength(2);

      const jan = result[0];
      expect(jan?.label).toBe("2024-01");
      expect(jan?.open).toBe(20);
      expect(jan?.high).toBe(23);
      expect(jan?.low).toBe(19);
      expect(jan?.close).toBe(22);
      expect(jan?.volume).toBe(30);
      expect(jan?.amount).toBe(300);
      expect(jan?.changeAmount).toBe(2);
      expect(jan?.changePercent).toBeCloseTo(10, 10);
      expect(jan?.startDate).toBe("2024-01-30");
      expect(jan?.endDate).toBe("2024-01-31");

      const feb = result[1];
      expect(feb?.label).toBe("2024-02");
      expect(feb?.changeAmount).toBe(1);
      expect(feb?.changePercent).toBeCloseTo((1 / 22) * 100, 10);
    });
  });

  describe("按季聚合", () => {
    it("label 为 YYYY-Qn，涨跌以前一季度收盘价为基准", () => {
      const result = aggregateBars({
        bars: [
          makeBar("2024-02-15", { open: 25, high: 31, low: 24, close: 30 }),
          makeBar("2024-04-15", { open: 30, high: 41, low: 29, close: 40 }),
        ],
        period: "quarter",
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.label).toBe("2024-Q1");
      expect(result[0]?.changeAmount).toBe(5);
      expect(result[0]?.changePercent).toBeCloseTo(20, 10);
      expect(result[1]?.label).toBe("2024-Q2");
      expect(result[1]?.changeAmount).toBe(10);
      expect(result[1]?.changePercent).toBeCloseTo((10 / 30) * 100, 10);
    });
  });

  describe("按年聚合", () => {
    it("label 为年份，跨年分为两组", () => {
      const result = aggregateBars({
        bars: [
          makeBar("2023-12-29", { open: 8, high: 9, low: 7, close: 8.5 }),
          makeBar("2024-01-02", { open: 8.5, high: 10, low: 8, close: 9.5 }),
        ],
        period: "year",
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.label).toBe("2023");
      expect(result[1]?.label).toBe("2024");
      expect(result[1]?.open).toBe(8.5);
      expect(result[1]?.changeAmount).toBe(1);
      expect(result[1]?.changePercent).toBeCloseTo((1 / 8.5) * 100, 10);
    });
  });
});

describe("getRangeBars", () => {
  const bars = [
    makeChartBar("2020-06-15"),
    makeChartBar("2022-06-15"),
    makeChartBar("2023-06-15"),
    makeChartBar("2024-06-15"),
  ];

  it("1y 以最后一根 bar 的日期为锚点向前裁剪一年", () => {
    const result = getRangeBars({ bars, range: "1y" });
    expect(result.map((bar) => bar.tradeDate)).toEqual(["2023-06-15", "2024-06-15"]);
  });

  it("3y 裁剪三年", () => {
    const result = getRangeBars({ bars, range: "3y" });
    expect(result.map((bar) => bar.tradeDate)).toEqual(["2022-06-15", "2023-06-15", "2024-06-15"]);
  });

  it("5y / 10y 范围内数据不足时保留全部", () => {
    expect(getRangeBars({ bars, range: "5y" })).toHaveLength(4);
    expect(getRangeBars({ bars, range: "10y" })).toHaveLength(4);
  });

  it("all 原样返回输入", () => {
    expect(getRangeBars({ bars, range: "all" })).toBe(bars);
  });

  it("空数组原样返回", () => {
    const empty: ChartBar[] = [];
    expect(getRangeBars({ bars: empty, range: "1y" })).toBe(empty);
  });
});

describe("parseMaPeriods", () => {
  it("支持英文逗号分隔", () => {
    expect(parseMaPeriods("5,10,20")).toEqual([5, 10, 20]);
  });

  it("支持空格、中文逗号、顿号分隔", () => {
    expect(parseMaPeriods("5 10 20")).toEqual([5, 10, 20]);
    expect(parseMaPeriods("5，10、20")).toEqual([5, 10, 20]);
  });

  it("去重且保持首次出现顺序", () => {
    expect(parseMaPeriods("10,5,10,20,5")).toEqual([10, 5, 20]);
  });

  it("过滤非正数与超出 1-999 范围的值", () => {
    expect(parseMaPeriods("0,5,-3,1000,999,1")).toEqual([5, 999, 1]);
  });

  it("过滤无法解析为整数的片段", () => {
    expect(parseMaPeriods("abc,5,ma,10")).toEqual([5, 10]);
  });

  it("空字符串返回空数组", () => {
    expect(parseMaPeriods("")).toEqual([]);
  });
});

describe("calculateMaSeries", () => {
  const bars = [10, 20, 30, 40, 50].map((close, index) =>
    makeChartBar(`2024-01-0${index + 1}`, { close }),
  );

  it("前 period-1 个点为 null，之后为滚动窗口均值", () => {
    const [ma2] = calculateMaSeries({ bars, periods: [2] });
    expect(ma2?.values).toEqual([null, 15, 25, 35, 45]);
  });

  it("不同周期各自形成完整窗口后才开始产出均值", () => {
    const [ma3] = calculateMaSeries({ bars, periods: [3] });
    expect(ma3?.values).toEqual([null, null, 20, 30, 40]);
  });

  it("颜色按周期顺序从 MA_COLORS 取值", () => {
    const [ma2, ma3] = calculateMaSeries({ bars, periods: [2, 3] });
    expect(ma2?.period).toBe(2);
    expect(ma2?.color).toBe("#235fd6");
    expect(ma3?.period).toBe(3);
    expect(ma3?.color).toBe("#d58a1f");
  });

  it("周期数超过 MA_COLORS 长度时颜色循环复用", () => {
    const series = calculateMaSeries({ bars, periods: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(series).toHaveLength(9);
    expect(series[8]?.color).toBe(MA_COLORS[0]);
    expect(series[8]?.color).toBe(series[0]?.color);
  });
});

describe("calculateVirtualMaSeries", () => {
  const bars = [10, 20, 30, 40, 50].map((close, index) =>
    makeChartBar(`2024-01-0${index + 1}`, { close }),
  );

  it("逐点求值：每个索引取各 MA 值代入表达式", () => {
    const expression = parseVirtualMaExpression("MA2 + MA3") as VirtualMaExpression;
    // MA2 = [null,15,25,35,45]，MA3 = [null,null,20,30,40]
    expect(calculateVirtualMaSeries({ bars, expression })).toEqual([null, null, 45, 65, 85]);
  });

  it("引用的 MA 尚未形成的点上结果为 null", () => {
    const expression = parseVirtualMaExpression("MA5 * 2") as VirtualMaExpression;
    expect(calculateVirtualMaSeries({ bars, expression })).toEqual([null, null, null, null, 60]);
  });

  it("某点除零时该点结果为 null，其余点照常", () => {
    const expression = parseVirtualMaExpression("MA2 / (MA3 - MA3)") as VirtualMaExpression;
    expect(calculateVirtualMaSeries({ bars, expression })).toEqual([null, null, null, null, null]);
  });

  it("纯常量表达式产出常数序列", () => {
    const expression = parseVirtualMaExpression("7") as VirtualMaExpression;
    expect(calculateVirtualMaSeries({ bars, expression })).toEqual([7, 7, 7, 7, 7]);
  });
});
