import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

describe("nf anki stats", (): void => {
  test.each([
    ["stats", "--help"],
    ["stats", "collection", "--help"],
    ["stats", "review", "--help"],
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
  });

  test("rolls child totals into root collection counts", async (): Promise<void> => {
    const result = await invokeAnki(
      ["stats", "collection"],
      (action: string, params: Readonly<Record<string, unknown>> | undefined): unknown => {
        if (action === "deckNamesAndIds") return { German: 1, "German::Verbs": 2 };
        if (action === "getDeckStats")
          return {
            "1": { new_count: 2, learn_count: 1, review_count: 3, total_in_deck: 10 },
            "2": { new_count: 1, learn_count: 0, review_count: 2, total_in_deck: 5 },
          };
        if (action === "findCards") {
          const query = String(params?.["query"]);
          if (query.includes("is:new")) return [1];
          if (query.includes("is:")) return [];
          return [1, 2, 3];
        }
        if (action === "getEaseFactors") return [2100, 2500, 3000];
        if (action === "getIntervals") return [7, 100];
        return undefined;
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      total_decks: 2,
      counts: { total: 15, new: 2, learning: 1, review: 3, other: 9 },
      states: { new: 1, learning: 0, review: 0, suspended: 0, buried: 0 },
      ease: { count: 3 },
      intervals: { count: 2 },
      per_deck: [
        { deck: "German", total: 15 },
        { deck: "German::Verbs", total: 5 },
      ],
    });
  });

  test("returns the complete empty collection shape", async (): Promise<void> => {
    const result = await invokeAnki(["stats", "collection"], (): Record<string, number> => ({}));
    expect(JSON.parse(result.stdout)).toMatchObject({
      total_decks: 0,
      counts: { total: 0, new: 0, learning: 0, review: 0, other: 0 },
      states: { new: 0, learning: 0, review: 0, suspended: 0, buried: 0 },
      per_deck: [],
    });
  });

  test("aggregates review history, retention, and current streak", async (): Promise<void> => {
    const result = await invokeAnki(
      ["stats", "review", "--start", "2026-08-21", "--end", "2026-08-23"],
      (action: string): unknown => {
        if (action === "findCards") return [1];
        return {
          "1": [
            { id: Date.parse("2026-08-22T12:00:00Z"), ease: 1 },
            { id: Date.parse("2026-08-23T12:00:00Z"), ease: 3 },
          ],
        };
      },
      { now: (): Date => new Date("2026-08-23T15:00:00Z") },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      period: { start: "2026-08-21", end: "2026-08-23" },
      deck: "All Decks",
      reviews_by_day: [
        { date: "2026-08-22", count: 1 },
        { date: "2026-08-23", count: 1 },
      ],
      summary: { total_reviews: 2, average_per_day: 1, days_studied: 2, streak: 2 },
      retention: { overall: 0.5, by_rating: { again: 1, hard: 0, good: 1, easy: 0 } },
    });
  });

  test("uses cardReviews for an exact deck scope", async (): Promise<void> => {
    const result = await invokeAnki(
      ["stats", "review", "--start", "2026-08-23", "--deck", "Work"],
      (): readonly unknown[] => [],
      { now: (): Date => new Date("2026-08-23T15:00:00Z") },
    );
    expect(result.invocations[0]).toEqual({
      action: "cardReviews",
      params: { startID: Date.parse("2026-08-23"), deck: "Work" },
    });
    expect(JSON.parse(result.stdout).deck).toBe("Work");
  });

  test("rejects invalid dates and former positional forms before connecting", async (): Promise<void> => {
    expect(
      (await invokeAnki(["stats", "review", "--start", "2026-08-24", "--end", "2026-08-23"])).code,
    ).toBe(2);
    expect((await invokeAnki(["stats", "review", "--start", "2026-02-31"])).code).toBe(2);
    expect((await invokeAnki(["stats", "review", "2026-08-21"])).code).toBe(2);
  });
});
