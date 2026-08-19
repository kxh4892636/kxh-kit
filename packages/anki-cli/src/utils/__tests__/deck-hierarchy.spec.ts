import { describe, expect, it } from "vitest";
import { getRootDeckNames, isDescendantOf, rollupDeckTotal } from "../deck-hierarchy";

describe("isDescendantOf", () => {
  it("识别任意深度子孙, 不误判同级", () => {
    expect(isDescendantOf("German::Verbs", "German")).toBe(true);
    expect(isDescendantOf("German::Verbs::Irr", "German")).toBe(true);
    expect(isDescendantOf("German2::Verbs", "German")).toBe(false);
    expect(isDescendantOf("German", "German")).toBe(false);
  });
});

describe("getRootDeckNames", () => {
  it("只保留不含 :: 的根牌组", () => {
    expect(getRootDeckNames(["German", "German::Verbs", "Spanish", "A::B::C"])).toEqual([
      "German",
      "Spanish",
    ]);
  });
});

describe("rollupDeckTotal", () => {
  it("自身 + 全部子孙的 total_in_deck", () => {
    const totals = new Map([
      ["German", 10],
      ["German::Verbs", 5],
      ["German::Verbs::Irr", 2],
      ["Spanish", 7],
    ]);

    expect(rollupDeckTotal("German", totals)).toBe(17);
    expect(rollupDeckTotal("German::Verbs", totals)).toBe(7);
    expect(rollupDeckTotal("Spanish", totals)).toBe(7);
  });
});
