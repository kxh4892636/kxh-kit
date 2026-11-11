import { describe, expect, it } from "vitest";
import {
  formatRemaining,
  isAutoPlayActive,
  parseMinutes,
  remainingMinutes,
  remainingMs,
  type SleepTimer,
} from "./sleep-timer.ts";

const NOW = 1_700_000_000_000;
const until = (minutes: number): SleepTimer => ({
  kind: "until",
  endsAt: NOW + minutes * 60_000,
  totalMs: minutes * 60_000,
});

describe("sleep timer", () => {
  it("never auto-plays when off", () => {
    expect(isAutoPlayActive({ kind: "off" }, NOW)).toBe(false);
    expect(remainingMs({ kind: "off" }, NOW)).toBeNull();
    expect(remainingMinutes({ kind: "off" }, NOW)).toBeNull();
  });

  it("always auto-plays when endless", () => {
    expect(isAutoPlayActive({ kind: "endless" }, NOW)).toBe(true);
    expect(remainingMs({ kind: "endless" }, NOW)).toBeNull();
  });

  it("stops exactly at the deadline", () => {
    const timer = until(1);
    expect(isAutoPlayActive(timer, NOW)).toBe(true);
    expect(isAutoPlayActive(timer, NOW + 59_999)).toBe(true);
    expect(isAutoPlayActive(timer, NOW + 60_000)).toBe(false);
    expect(remainingMs(timer, NOW + 90_000)).toBe(0);
  });

  it("rounds remaining minutes up so a fresh timer never reads short", () => {
    const timer = until(30);
    expect(remainingMinutes(timer, NOW)).toBe(30);
    expect(remainingMinutes(timer, NOW + 1)).toBe(30);
    expect(remainingMinutes(timer, NOW + 60_001)).toBe(29);
  });

  it("formats under an hour and past it", () => {
    expect(formatRemaining(59_000)).toBe("00:59");
    expect(formatRemaining(60_000)).toBe("01:00");
    expect(formatRemaining(61_500)).toBe("01:02");
    expect(formatRemaining(3_600_000)).toBe("1:00:00");
    expect(formatRemaining(-5)).toBe("00:00");
  });

  it("accepts whole minutes from 1 to 1440 only", () => {
    expect(parseMinutes("30")).toBe(30);
    expect(parseMinutes(" 5 ")).toBe(5);
    expect(parseMinutes("1440")).toBe(1440);
    for (const bad of ["", "0", "-1", "1.5", "abc", "1e3", "1441", "10000"]) {
      expect(parseMinutes(bad)).toBeNull();
    }
  });
});
