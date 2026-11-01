import { describe, expect, it } from "vitest";
import { formatTime, formatWhen } from "./format.ts";

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

describe("formatWhen", () => {
  const noon = new Date(2026, 10, 1, 12, 0, 0).getTime();

  it("shows only the clock for today", () => {
    const today = new Date(2026, 10, 1, 20, 14, 0).getTime();
    expect(formatWhen(today, noon)).toBe("20:14");
  });

  it("adds the day for older entries", () => {
    const earlier = new Date(2026, 9, 31, 20, 14, 0).getTime();
    expect(formatWhen(earlier, noon)).toBe("10月31日 20:14");
  });
});
