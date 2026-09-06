import { describe, expect, it } from "vitest";

import { parseVirtualMaExpression } from "./virtual-ma-expression";

const maValues: Record<number, number | null> = { 5: 10, 8: 20, 13: 30 };
const getMaValue = (period: number): number | null => maValues[period] ?? null;

describe("parseVirtualMaExpression", () => {
  it("解析数字常量并求值", () => {
    const expression = parseVirtualMaExpression("42");
    expect(expression?.referencedPeriods).toEqual([]);
    expect(expression?.evaluate(getMaValue)).toBe(42);
  });

  it("引用 MA 周期并记录 referencedPeriods", () => {
    const expression = parseVirtualMaExpression("MA5 + MA8");
    expect(expression?.referencedPeriods).toEqual([5, 8]);
    expect(expression?.evaluate(getMaValue)).toBe(30);
  });

  it("乘除优先于加减", () => {
    const expression = parseVirtualMaExpression("MA5 + MA8 * 2");
    expect(expression?.evaluate(getMaValue)).toBe(50);
  });

  it("括号改变优先级", () => {
    const expression = parseVirtualMaExpression("(MA5 + MA8) / 2");
    expect(expression?.evaluate(getMaValue)).toBe(15);
  });

  it("标识符大小写不敏感、空白容忍", () => {
    const expression = parseVirtualMaExpression(" ma5* ma8 -ma13 ");
    expect(expression?.referencedPeriods).toEqual([5, 8, 13]);
    expect(expression?.evaluate(getMaValue)).toBe(10 * 20 - 30);
  });

  it("referencedPeriods 去重且保持首次出现顺序", () => {
    const expression = parseVirtualMaExpression("MA8 + MA5 - MA8");
    expect(expression?.referencedPeriods).toEqual([8, 5]);
  });

  it("空输入与纯空白返回 null", () => {
    expect(parseVirtualMaExpression("")).toBeNull();
    expect(parseVirtualMaExpression("   ")).toBeNull();
  });

  it("未知字符或标识符返回 null", () => {
    expect(parseVirtualMaExpression("MA5 & MA8")).toBeNull();
    expect(parseVirtualMaExpression("close + 1")).toBeNull();
    expect(parseVirtualMaExpression("MA + 1")).toBeNull();
  });

  it("括号不匹配或语法残缺返回 null", () => {
    expect(parseVirtualMaExpression("(MA5 + MA8")).toBeNull();
    expect(parseVirtualMaExpression("MA5 +")).toBeNull();
    expect(parseVirtualMaExpression("MA5 MA8")).toBeNull();
  });

  it("引用的 MA 在该点无值时结果为 null", () => {
    const expression = parseVirtualMaExpression("MA5 + MA21");
    expect(expression?.evaluate(getMaValue)).toBeNull();
  });

  it("除零时该点结果为 null", () => {
    expect(parseVirtualMaExpression("MA5 / 0")?.evaluate(getMaValue)).toBeNull();
    expect(parseVirtualMaExpression("MA5 / (MA8 - MA8)")?.evaluate(getMaValue)).toBeNull();
  });
});
