import { describe, expect, it } from "vitest";
import { computeDistribution, computeRetention, calculateStreak } from "../stats";

const localIso = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const daysAgo = (n: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return localIso(date);
};

describe("computeDistribution", () => {
  it("空数组返回全零与空桶", () => {
    expect(computeDistribution([], { boundaries: [2.0, 2.5, 3.0] })).toEqual({
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      count: 0,
      buckets: { "<2": 0, "2-2.5": 0, "2.5-3": 0, ">3": 0 },
    });
  });

  it("统计指标与桶分布", () => {
    const result = computeDistribution([2.1, 2.5, 3.0, 2.8], {
      boundaries: [2.0, 2.5, 3.0],
    });
    expect(result.count).toBe(4);
    expect(result.mean).toBeCloseTo(2.6);
    expect(result.median).toBeCloseTo(2.65);
    expect(result.min).toBe(2.1);
    expect(result.max).toBe(3.0);
    expect(result.buckets).toEqual({
      "<2": 0,
      "2-2.5": 1,
      "2.5-3": 2,
      ">3": 1,
    });
  });

  it("unitSuffix 附加到桶标签", () => {
    const result = computeDistribution([1, 10, 100], {
      boundaries: [7, 21],
      unitSuffix: "d",
    });
    expect(result.buckets).toEqual({ "<7d": 1, "7-21d": 1, ">21d": 1 });
  });
});

describe("computeRetention", () => {
  it("保留率 = 记住数/总数", () => {
    const result = computeRetention([3, 4, 2, 3, 1, 3]);
    expect(result.overall).toBeCloseTo(5 / 6);
    expect(result.by_rating).toEqual({ again: 1, hard: 1, good: 3, easy: 1 });
  });

  it("空数组保留率为 0", () => {
    expect(computeRetention([]).overall).toBe(0);
  });
});

describe("calculateStreak", () => {
  it("今天起连续天数, 遇空档停止", () => {
    const streak = calculateStreak([
      { date: daysAgo(0), count: 10 },
      { date: daysAgo(1), count: 5 },
      { date: daysAgo(3), count: 8 },
    ]);
    expect(streak).toBe(2);
  });

  it("今天无复习为 0", () => {
    expect(calculateStreak([{ date: daysAgo(1), count: 5 }])).toBe(0);
  });

  it("空列表为 0", () => {
    expect(calculateStreak([])).toBe(0);
  });
});
