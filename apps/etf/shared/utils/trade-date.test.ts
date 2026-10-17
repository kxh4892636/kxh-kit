import { describe, expect, test } from "vite-plus/test";
import {
  addDays,
  dateRange,
  formatTradeDate,
  isValidTradeDate,
  isWeekday,
  parseTradeDate,
} from "./trade-date.ts";

describe("trade-date", () => {
  test("解析与格式化保持 UTC 日期", (): void => {
    expect(parseTradeDate("2026-05-29")).toEqual({
      year: 2026,
      month: 5,
      day: 29,
      dateMs: Date.UTC(2026, 4, 29),
    });
    expect(formatTradeDate(Date.UTC(2026, 4, 29))).toBe("2026-05-29");
  });
  test("校验严格日期", (): void => {
    expect(isValidTradeDate("2026-02-30")).toBe(false);
    expect(isValidTradeDate("2026-2-3")).toBe(false);
    expect(isValidTradeDate("2026-02-03")).toBe(true);
  });
  test("日期加减、区间与工作日", (): void => {
    expect(addDays("2026-05-30", 1)).toBe("2026-05-31");
    expect(dateRange("2026-05-29", "2026-05-31")).toEqual([
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
    ]);
    expect(isWeekday("2026-05-29")).toBe(true);
    expect(isWeekday("2026-05-30")).toBe(false);
  });
});
