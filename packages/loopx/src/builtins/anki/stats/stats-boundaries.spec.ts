import { describe, expect, test } from "vitest";
import { JsonError } from "../errors";
import { scriptedPort } from "../testing/test-harness";
import { invokeAnki } from "../testing/test-harness";
import { collectionStats } from "./collection-stats";
import { reviewStats } from "./review-stats";

describe("statistics boundaries", (): void => {
  test("filters old collection reviews and defaults sparse review records", async (): Promise<void> => {
    const start = Date.parse("2026-08-01");
    const result = await reviewStats(
      scriptedPort((action: string): unknown => {
        if (action === "findCards") return [1];
        if (action === "getReviewsOfCards") {
          return {
            "1": [
              { id: start - 1, ease: 1 },
              { id: start + 1, ease: 3 },
            ],
          };
        }
        return [];
      }, []),
      "2026-08-01",
      "2026-08-31",
      undefined,
      new Date("2026-08-27T12:00:00Z"),
    );
    expect(result).toEqual({
      deck: "All Decks",
      period: { end: "2026-08-31", start: "2026-08-01" },
      retention: { by_rating: { again: 0, easy: 0, good: 1, hard: 0 }, overall: 1 },
      reviews_by_day: [{ count: 1, date: "2026-08-01" }],
      summary: {
        average_per_day: 1,
        days_studied: 1,
        max_day: { count: 1, date: "2026-08-01" },
        min_day: { count: 1, date: "2026-08-01" },
        streak: 0,
        total_reviews: 1,
      },
    });
  });

  test("sorts deck review days and enforces the inclusive end boundary", async (): Promise<void> => {
    const tuple = (date: string, ease: number): number[] => [
      Date.parse(date),
      1,
      0,
      ease,
      0,
      0,
      0,
      0,
      0,
    ];
    const result = await reviewStats(
      scriptedPort(
        (): number[][] => [
          tuple("2026-08-02T12:00:00Z", 2),
          tuple("2026-08-01T12:00:00Z", 1),
          tuple("2026-08-02T13:00:00Z", 3),
          tuple("2026-08-01T13:00:00Z", 4),
          tuple("2026-08-02T14:00:00Z", 3),
          tuple("2026-08-03T00:00:00Z", 1),
          tuple("2026-08-03T00:00:00.001Z", 4),
        ],
        [],
      ),
      "2026-08-01",
      "2026-08-02",
      "Work",
      new Date("2026-08-03T12:00:00Z"),
    );
    expect(result).toEqual({
      deck: "Work",
      period: { end: "2026-08-02", start: "2026-08-01" },
      retention: {
        by_rating: { again: 2, easy: 1, good: 2, hard: 1 },
        overall: 0.6666666666666667,
      },
      reviews_by_day: [
        { count: 2, date: "2026-08-01" },
        { count: 3, date: "2026-08-02" },
        { count: 1, date: "2026-08-03" },
      ],
      summary: {
        average_per_day: 2,
        days_studied: 3,
        max_day: { count: 3, date: "2026-08-02" },
        min_day: { count: 1, date: "2026-08-03" },
        streak: 3,
        total_reviews: 6,
      },
    });
  });

  test("preserves structured review failures and normalizes primitive failures", async (): Promise<void> => {
    const structured = new JsonError("structured", { action: "custom" });
    await expect(
      reviewStats(
        scriptedPort(async (): Promise<never> => Promise.reject(structured), []),
        "2026-08-01",
        "2026-08-31",
        undefined,
        new Date("2026-08-27T12:00:00Z"),
      ),
    ).rejects.toBe(structured);
    await expect(
      reviewStats(
        scriptedPort(async (): Promise<never> => Promise.reject("offline"), []),
        "2026-08-01",
        "2026-08-31",
        undefined,
        new Date("2026-08-27T12:00:00Z"),
      ),
    ).rejects.toMatchObject({ action: "review_stats", message: "offline" });
  });
});

describe("statistics boundaries", (): void => {
  test("uses zero defaults for sparse deck stats and stops when the collection has no cards", async (): Promise<void> => {
    const result = await collectionStats(
      scriptedPort((action: string): unknown => {
        if (action === "deckNamesAndIds") return { Root: 1, "Root::Child": 2, Other: 3 };
        if (action === "getDeckStats") return { "1": { total_in_deck: 2 }, "2": {}, "3": {} };
        return [];
      }, []),
    );
    expect(result).toMatchObject({
      counts: { total: 2, new: 0, learning: 0, review: 0, other: 2 },
      states: { new: 0, learning: 0, review: 0, suspended: 0, buried: 0 },
      per_deck: [
        { deck: "Root", total: 2, other: 2 },
        { deck: "Root::Child", total: 0 },
        { deck: "Other", total: 0 },
      ],
    });
  });

  test("clamps negative other counts and discards non-positive ease and intervals", async (): Promise<void> => {
    const result = await collectionStats(
      scriptedPort((action: string, params): unknown => {
        if (action === "deckNamesAndIds") return { Root: 1 };
        if (action === "getDeckStats")
          return { "1": { total_in_deck: 1, new_count: 2, learn_count: 3, review_count: 4 } };
        if (action === "findCards") return params?.["query"] === "deck:*" ? [1] : [];
        if (action === "getEaseFactors") return [0, -1, 2500];
        if (action === "getIntervals") return [0, -1, 10];
        return [];
      }, []),
    );
    expect(result).toMatchObject({
      counts: { other: 0 },
      ease: { count: 1 },
      intervals: { count: 1 },
    });
  });

  test.each([new Error("offline"), "offline"])(
    "normalizes collection failures",
    async (failure: unknown): Promise<void> => {
      const port = scriptedPort(async (): Promise<never> => Promise.reject(failure), []);
      await expect(collectionStats(port)).rejects.toMatchObject({ action: "collection_stats" });
    },
  );

  test("preserves structured collection failures", async (): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(
      collectionStats(scriptedPort(async (): Promise<never> => Promise.reject(error), [])),
    ).rejects.toBe(error);
  });

  test.each(["", "0", "-1", "NaN", "1,Infinity", Array(21).fill("1").join(",")])(
    "rejects invalid bucket list %j",
    async (buckets: string): Promise<void> => {
      const result = await invokeAnki(["stats", "collection", "--ease-buckets", buckets]);
      expect([result.code, result.invocations.length]).toEqual([2, 0]);
    },
  );

  test("accepts custom collection buckets", async (): Promise<void> => {
    const result = await invokeAnki(
      ["stats", "collection", "--ease-buckets", "1, 2", "--interval-buckets", "3,4"],
      (): Record<string, number> => ({}),
    );
    expect(result.code).toBe(0);
  });

  test.each(["", "2026-1-01", "2026-00-01", "2026-13-01", "not-a-date"])(
    "rejects invalid review date %j",
    async (date: string): Promise<void> => {
      expect((await invokeAnki(["stats", "review", `--start=${date}`])).code).toBe(2);
    },
  );

  test("trims an empty deck scope to all decks and defaults the end date", async (): Promise<void> => {
    const result = await invokeAnki(
      ["stats", "review", "--start", "2026-08-27", "--deck", "  "],
      (action: string): unknown => (action === "findCards" ? [] : {}),
      { now: (): Date => new Date("2026-08-27T12:00:00Z") },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ deck: "All Decks" });
  });
});
