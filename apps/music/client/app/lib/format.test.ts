import { describe, expect, it } from "vitest";
import { formatClock, formatDayLabel, formatTime, groupByDay } from "./format.ts";

const at = (year: number, month: number, day: number, hour = 12): number =>
  new Date(year, month - 1, day, hour).getTime();

const now = at(2026, 11, 3, 22);

describe("formatDayLabel", () => {
  it("names today and yesterday", () => {
    expect(formatDayLabel(at(2026, 11, 3, 9), now)).toBe("今天");
    expect(formatDayLabel(at(2026, 11, 2, 23), now)).toBe("昨天");
  });

  it("falls back to month and day, adding the year when it differs", () => {
    expect(formatDayLabel(at(2026, 11, 1, 9), now)).toBe("11月1日");
    expect(formatDayLabel(at(2025, 12, 31, 9), now)).toBe("2025年12月31日");
  });
});

describe("groupByDay", () => {
  it("groups consecutive entries from the same day", () => {
    const groups = groupByDay(
      [
        { id: "a", at: at(2026, 11, 3, 22) },
        { id: "b", at: at(2026, 11, 3, 20) },
        { id: "c", at: at(2026, 11, 2, 23) },
        { id: "d", at: at(2026, 11, 1, 10) },
      ],
      now,
    );
    expect(groups.map((group) => group.label)).toEqual(["今天", "昨天", "11月1日"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[2]?.items.map((item) => item.id)).toEqual(["d"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe("formatTime", () => {
  it("pads seconds and keeps minutes whole", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(59)).toBe("0:59");
    expect(formatTime(60)).toBe("1:00");
    expect(formatTime(292.4)).toBe("4:52");
  });

  it("falls back to zero for unusable values", () => {
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(-3)).toBe("0:00");
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("formatClock", () => {
  it("keeps only the clock, whatever the day", () => {
    expect(formatClock(at(2026, 11, 3, 20))).toBe("20:00");
    expect(formatClock(new Date(2026, 10, 1, 8, 5).getTime())).toBe("08:05");
  });
});
