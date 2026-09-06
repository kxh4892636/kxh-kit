import type { DailyBar } from "@/libs/api/client";

import type { VirtualMaExpression } from "./virtual-ma-expression";

export type ChartPeriod = "day" | "week" | "month" | "quarter" | "year";
export type ChartRange = "1y" | "3y" | "5y" | "10y" | "all";

export interface ChartBar extends DailyBar {
  dateMs: number;
  year: number;
  month: number;
  day: number;
  startDate: string;
  endDate: string;
  label: string;
}

export interface MaSeries {
  period: number;
  color: string;
  values: Array<number | null>;
}

export interface VirtualMaSeries {
  color: string;
  values: Array<number | null>;
}

// 亮金黄虚线，与 MA_COLORS 实线调色板区分；画布为白底，不可用白色。
export const VIRTUAL_MA_COLOR = "#eab308";

interface DateParts {
  year: number;
  month: number;
  day: number;
  dateMs: number;
}

interface ChartGroup {
  key: string;
  records: ChartBar[];
}

interface RangeOption {
  label: string;
  value: ChartRange;
  years: number | null;
}

export const PERIOD_OPTIONS: Array<{ label: string; value: ChartPeriod }> = [
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
  { value: "quarter", label: "季" },
  { value: "year", label: "年" },
];

export const RANGE_OPTIONS: RangeOption[] = [
  { value: "1y", label: "近一年", years: 1 },
  { value: "3y", label: "近三年", years: 3 },
  { value: "5y", label: "近五年", years: 5 },
  { value: "10y", label: "近十年", years: 10 },
  { value: "all", label: "全部", years: null },
];

export const MA_COLORS: readonly string[] = [
  "#235fd6",
  "#d58a1f",
  "#7b50b6",
  "#00858a",
  "#c94d8c",
  "#56687a",
  "#7a7d1c",
  "#0d70a6",
];

const parseDateParts = (dateText: string): DateParts => {
  const [yearText, monthText, dayText] = dateText.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return { year, month, day, dateMs: Date.UTC(year, month - 1, day) };
};

const formatDateMs = (dateMs: number): string => {
  const date = new Date(dateMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getWeekKey = (record: ChartBar): string => {
  const date = new Date(record.dateMs);
  const day = date.getUTCDay();
  // 以自然周一划分边界，保证跨周末或跨年的交易周完整。
  const offset = day === 0 ? -6 : 1 - day;
  return formatDateMs(record.dateMs + offset * 86_400_000);
};

const getPeriodKey = (record: ChartBar, period: ChartPeriod): string => {
  if (period === "week") return getWeekKey(record);
  if (period === "month") return `${record.year}-${String(record.month).padStart(2, "0")}`;
  if (period === "quarter") return `${record.year}-Q${Math.floor((record.month - 1) / 3) + 1}`;
  if (period === "year") return `${record.year}`;
  return record.tradeDate;
};

export const normalizeBars = (bars: DailyBar[]): ChartBar[] =>
  bars
    .filter((bar: DailyBar): boolean => Boolean(bar?.tradeDate))
    .map(
      (bar: DailyBar): ChartBar => ({
        ...bar,
        ...parseDateParts(bar.tradeDate),
        startDate: bar.tradeDate,
        endDate: bar.tradeDate,
        label: bar.tradeDate,
      }),
    );

export const aggregateBars = (params: { bars: DailyBar[]; period: ChartPeriod }): ChartBar[] => {
  const normalized = normalizeBars(params.bars);
  if (params.period === "day") return normalized;

  const groups: ChartGroup[] = [];
  for (const record of normalized) {
    const key = getPeriodKey(record, params.period);
    const current = groups.at(-1);
    if (!current || current.key !== key) {
      groups.push({ key, records: [record] });
    } else {
      current.records.push(record);
    }
  }

  return groups.map((group: ChartGroup, index: number): ChartBar => {
    const first = group.records[0] as ChartBar;
    const last = group.records.at(-1) as ChartBar;
    const high = Math.max(...group.records.map((record: ChartBar): number => record.high));
    const low = Math.min(...group.records.map((record: ChartBar): number => record.low));
    const volume = group.records.reduce(
      (sum: number, record: ChartBar): number => sum + record.volume,
      0,
    );
    const amount = group.records.reduce(
      (sum: number, record: ChartBar): number => sum + record.amount,
      0,
    );
    const previousClose = groups[index - 1]?.records.at(-1)?.close;
    // 聚合涨跌基于前一周期收盘价，首组回退到本组开盘价。
    const baseClose = previousClose ?? first.open;
    const changeAmount = last.close - baseClose;
    const changePercent = baseClose === 0 ? 0 : (changeAmount / baseClose) * 100;
    return {
      ...last,
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
      amount,
      changeAmount,
      changePercent,
      startDate: first.tradeDate,
      endDate: last.tradeDate,
      label: group.key,
    };
  });
};

export const getRangeBars = (params: { bars: ChartBar[]; range: ChartRange }): ChartBar[] => {
  const option = RANGE_OPTIONS.find((item: RangeOption): boolean => item.value === params.range);
  if (!option?.years || params.bars.length === 0) return params.bars;

  const last = params.bars.at(-1) as ChartBar;
  const date = new Date(last.dateMs);
  const startMs = Date.UTC(
    date.getUTCFullYear() - option.years,
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return params.bars.filter((bar: ChartBar): boolean => bar.dateMs >= startMs);
};

export const parseMaPeriods = (text: string): number[] => {
  const result: number[] = [];
  const seen = new Set<number>();
  for (const part of text.split(/[,\s，、]+/)) {
    const value = Number.parseInt(part, 10);
    if (Number.isInteger(value) && value > 0 && value <= 999 && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

export const calculateMaSeries = (params: { bars: ChartBar[]; periods: number[] }): MaSeries[] =>
  params.periods.map((period: number, periodIndex: number): MaSeries => {
    const values: Array<number | null> = [];
    let rollingSum = 0;
    // 窗口形成完整均线前，前 period - 1 个点留空。
    params.bars.forEach((record: ChartBar, index: number): void => {
      rollingSum += record.close;
      if (index >= period) rollingSum -= params.bars[index - period]?.close ?? 0;
      values.push(index >= period - 1 ? rollingSum / period : null);
    });
    return {
      period,
      color: MA_COLORS[periodIndex % MA_COLORS.length] ?? "#235fd6",
      values,
    };
  });

// 虚拟均线表达式自包含：引用周期在这里独立计算，不依赖工具栏可见的 MA 配置。
export const calculateVirtualMaSeries = (params: {
  bars: ChartBar[];
  expression: VirtualMaExpression;
}): Array<number | null> => {
  const sourceSeries = calculateMaSeries({
    bars: params.bars,
    periods: [...params.expression.referencedPeriods],
  });
  const valuesByPeriod = new Map<number, Array<number | null>>(
    sourceSeries.map((series: MaSeries): [number, Array<number | null>] => [
      series.period,
      series.values,
    ]),
  );
  return params.bars.map((_: ChartBar, index: number): number | null =>
    params.expression.evaluate(
      (period: number): number | null => valuesByPeriod.get(period)?.[index] ?? null,
    ),
  );
};
