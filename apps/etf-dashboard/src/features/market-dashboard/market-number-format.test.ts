import { describe, expect, it } from "vitest";

import { formatLargeNumber, formatNumber, formatPercent } from "./market-number-format";

describe("formatNumber", () => {
  it("非有限值返回占位符", () => {
    expect(formatNumber(Number.NaN)).toBe("-");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("-");
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe("-");
  });

  it("按 zh-CN 千分位分组，默认最多两位小数", () => {
    expect(formatNumber(1234567.891)).toBe("1,234,567.89");
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });

  it("整数不补小数位", () => {
    expect(formatNumber(5)).toBe("5");
    expect(formatNumber(0)).toBe("0");
  });

  it("负数带负号", () => {
    expect(formatNumber(-1234.5)).toBe("-1,234.5");
  });

  it("digits 控制最大小数位数", () => {
    expect(formatNumber(1234.567, 2)).toBe("1,234.57");
    expect(formatNumber(1234.567, 0)).toBe("1,235");
    expect(formatNumber(1.23456, 4)).toBe("1.2346");
  });
});

describe("formatPercent", () => {
  it("非负值带正号，保留两位小数并追加百分号", () => {
    expect(formatPercent(1.234)).toBe("+1.23%");
    expect(formatPercent(0)).toBe("+0%");
  });

  it("负值不带额外正号", () => {
    expect(formatPercent(-1.234)).toBe("-1.23%");
  });

  it("非有限值返回占位符", () => {
    expect(formatPercent(Number.NaN)).toBe("-");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("-");
  });
});

describe("formatLargeNumber", () => {
  it("非有限值返回占位符", () => {
    expect(formatLargeNumber(Number.NaN)).toBe("-");
    expect(formatLargeNumber(Number.POSITIVE_INFINITY)).toBe("-");
  });

  it("绝对值小于一万时直接格式化", () => {
    expect(formatLargeNumber(9999.99)).toBe("9,999.99");
    expect(formatLargeNumber(-9999)).toBe("-9,999");
  });

  it("一万整进入万单位", () => {
    expect(formatLargeNumber(10000)).toBe("1万");
  });

  it("一万到一亿之间换算为万", () => {
    expect(formatLargeNumber(12345)).toBe("1.23万");
    expect(formatLargeNumber(-12345)).toBe("-1.23万");
    expect(formatLargeNumber(50000000)).toBe("5,000万");
  });

  it("一亿整进入亿单位", () => {
    expect(formatLargeNumber(100000000)).toBe("1亿");
  });

  it("一亿及以上换算为亿，保留两位小数", () => {
    expect(formatLargeNumber(123456789)).toBe("1.23亿");
    expect(formatLargeNumber(-123456789)).toBe("-1.23亿");
  });
});
