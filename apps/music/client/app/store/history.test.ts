import { describe, expect, it } from "vitest";
import { HISTORY_MAX, pushHistory, type HistoryEntry } from "./history.ts";

const entry = (id: string, at: number): HistoryEntry => ({ id, at });

describe("pushHistory", () => {
  it("puts the newest first", () => {
    const list = pushHistory([entry("a", 1)], "b", 2);
    expect(list).toEqual([entry("b", 2), entry("a", 1)]);
  });

  it("moves a replayed track to the top instead of duplicating it", () => {
    const list = pushHistory([entry("b", 2), entry("a", 1)], "a", 3);
    expect(list).toEqual([entry("a", 3), entry("b", 2)]);
  });

  it("keeps at most thirteen entries", () => {
    const list = Array.from({ length: HISTORY_MAX }, (_, index) => entry(`t${index}`, index));
    const next = pushHistory(list, "fresh", 99);
    expect(next).toHaveLength(HISTORY_MAX);
    expect(next[0]?.id).toBe("fresh");
    expect(next.at(-1)?.id).toBe(`t${HISTORY_MAX - 2}`);
  });

  it("accepts a custom cap", () => {
    const list = pushHistory([entry("a", 1), entry("b", 2)], "c", 3, 2);
    expect(list.map((item) => item.id)).toEqual(["c", "a"]);
  });
});
