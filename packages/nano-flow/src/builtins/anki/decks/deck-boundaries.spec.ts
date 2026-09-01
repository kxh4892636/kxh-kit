import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

describe("deck response boundaries", (): void => {
  test("reports an empty collection without requesting statistics", async (): Promise<void> => {
    const result = await invokeAnki(["decks", "list"], (): readonly string[] => []);

    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      decks: [],
      total: 0,
      message: "No decks found in Anki",
    });
    expect(result.invocations).toHaveLength(1);
  });

  test("normalizes sparse per-deck statistics and counts root queues only once", async (): Promise<void> => {
    const result = await invokeAnki(["decks", "list", "--stats"], (action: string): unknown => {
      if (action === "deckNames") return ["Work", "Work::Child", "Missing"];
      if (action === "deckNamesAndIds") return { Work: 1, "Work::Child": 2 };
      return {
        1: {},
        2: { deck_id: "invalid", total_in_deck: 3, new_count: 2 },
      };
    });

    expect(JSON.parse(result.stdout)).toMatchObject({
      decks: [
        {
          name: "Work",
          stats: {
            deck_id: 0,
            new_count: 0,
            learn_count: 0,
            review_count: 0,
            total_new: 0,
            total_cards: 0,
          },
        },
        {
          name: "Work::Child",
          stats: { deck_id: 0, new_count: 2, total_new: 2, total_cards: 3 },
        },
        { name: "Missing" },
      ],
      summary: { total_cards: 3, new_cards: 0, learning_cards: 0, review_cards: 0 },
    });
  });

  test.each([
    ["deckNames", null],
    ["deckNames", [1]],
    ["deckNamesAndIds", null],
    ["deckNamesAndIds", []],
    ["getDeckStats", null],
    ["getDeckStats", []],
    ["nested getDeckStats", { 1: [] }],
  ])(
    "rejects malformed %s responses",
    async (source: string, malformed: unknown): Promise<void> => {
      const result = await invokeAnki(["decks", "list", "--stats"], (action: string): unknown => {
        if (action === "deckNames") return source === "deckNames" ? malformed : ["Work"];
        if (action === "deckNamesAndIds") {
          return source === "deckNamesAndIds" ? malformed : { Work: 1 };
        }
        return source.includes("getDeckStats") ? malformed : { 1: {} };
      });

      expect(result.code).toBe(1);
      expect(JSON.parse(result.stderr)).toMatchObject({ action: "listDecks" });
      expect(JSON.parse(result.stderr).hint).toBe("Make sure Anki is running");
    },
  );

  test("creates simple and nested decks with every parent-state message", async (): Promise<void> => {
    const simple = await invokeAnki(["decks", "create", "--name", "Simple"], (): number => 1);
    expect(JSON.parse(simple.stdout)).toMatchObject({
      deckId: 1,
      deckName: "Simple",
      created: true,
      message: 'Successfully created deck "Simple"',
    });

    for (const [existing, expected] of [
      [["Parent"], 'Found existing parent deck "Parent"; created child deck "Child"'],
      [[], 'Created parent deck "Parent" and child deck "Child"'],
    ] as const) {
      const nested = await invokeAnki(
        ["decks", "create", "--name", "Parent::Child"],
        (action: string): unknown => (action === "deckNames" ? existing : 2),
      );
      expect(JSON.parse(nested.stdout).message).toBe(expected);
    }

    const warning = await invokeAnki(
      ["decks", "create", "--name", "Parent::Child"],
      (action: string): unknown => (action === "deckNames" ? new Error("lookup failed") : 3),
    );
    expect(JSON.parse(warning.stdout)).toMatchObject({
      created: true,
      message: 'Created child deck "Child" under parent "Parent"',
    });
  });
});

describe("deck response boundaries", (): void => {
  test("distinguishes existing, invalid, and failed createDeck responses", async (): Promise<void> => {
    let calls = 0;
    const existing = await invokeAnki(
      ["decks", "create", "--name", "Parent::Child"],
      (action: string): unknown => {
        if (action === "createDeck") return null;
        calls += 1;
        return calls === 1 ? ["Parent"] : ["Parent", "Parent::Child"];
      },
    );
    expect(JSON.parse(existing.stdout)).toMatchObject({
      created: false,
      exists: true,
      parentDeck: "Parent",
      childDeck: "Child",
      parentExisted: true,
    });

    const invalid = await invokeAnki(
      ["decks", "create", "--name", "Work"],
      (): string => "invalid",
    );
    expect(JSON.parse(invalid.stderr)).toMatchObject({ action: "createDeck" });

    let missingCalls = 0;
    const missing = await invokeAnki(["decks", "create", "--name", "Work"], (): unknown =>
      missingCalls++ === 0 ? null : [],
    );
    expect(JSON.parse(missing.stderr).error).toContain("Failed to create deck");
  });

  test("reports every invalid card atomically and abbreviates long batches", async (): Promise<void> => {
    const ids = Array.from({ length: 12 }, (_value: unknown, index: number): string =>
      String(index + 1),
    );
    const result = await invokeAnki(
      ["decks", "move", "--card-id", ...ids, "--deck", " Work "],
      (): unknown[] => [null, {}, { cardId: "x" }, ...Array.from({ length: 9 }, (): null => null)],
    );
    const error = JSON.parse(result.stderr);

    expect(error).toMatchObject({
      action: "changeDeck",
      invalidIds: Array.from({ length: 12 }, (_value: unknown, index: number): number => index + 1),
      totalRequested: 12,
    });
    expect(error.error).toContain("and 2 more");
    expect(result.invocations.map((invocation) => invocation.action)).toEqual(["cardsInfo"]);

    const malformed = await invokeAnki(
      ["decks", "move", "--card-id", "1", "--deck", "Work"],
      (): Record<string, never> => ({}),
    );
    expect(JSON.parse(malformed.stderr).error).toContain("expected array");
  });

  test("returns empty and populated deck distributions with stable bucket boundaries", async (): Promise<void> => {
    const empty = await invokeAnki(
      ["decks", "stats", "--deck", "Work"],
      (action: string): unknown => {
        if (action === "deckNamesAndIds") return { Work: 1, "Work::Child": 2, Ignored: "x" };
        if (action === "getDeckStats") return { 1: {}, 2: { total_in_deck: 2 } };
        return [];
      },
    );
    expect(JSON.parse(empty.stdout)).toMatchObject({
      counts: { total: 2, new: 0, learning: 0, review: 0, other: 2 },
      ease: { count: 0, mean: 0, median: 0, min: 0, max: 0 },
      intervals: { count: 0 },
    });

    const populated = await invokeAnki(
      ["decks", "stats", "--deck", "Work"],
      (
        action: string,
        _params: Readonly<Record<string, unknown>> | undefined,
        invocation: number,
      ): unknown => {
        if (action === "deckNamesAndIds") return { Work: 1 };
        if (action === "getDeckStats") {
          return { 1: { new_count: 1, learn_count: 1, review_count: 1, total_in_deck: 6 } };
        }
        if (action === "findCards") return invocation === 2 ? [1, 2, 3, 4, 5, 6] : [1];
        if (action === "getEaseFactors") return [1500, 2000, 2500, 3000, 3500, 0];
        if (action === "getIntervals") return [1, 7, 20, 90, 120, 0];
        return [];
      },
    );
    expect(JSON.parse(populated.stdout)).toMatchObject({
      counts: { total: 6, new: 1, learning: 1, review: 1, other: 3 },
      ease: {
        count: 5,
        median: 2.5,
        min: 1.5,
        max: 3.5,
        buckets: { "<2": 1, "2-2.5": 1, "2.5-3": 1, ">3": 2 },
      },
      intervals: {
        count: 5,
        median: 20,
        buckets: { "<7d": 1, "7-21d": 2, "21-90d": 0, ">90d": 2 },
      },
    });
  });
});

describe("deck response boundaries", (): void => {
  test.each([
    ["missing deck", { ids: {}, stats: {}, expected: "not found" }],
    ["missing root stats", { ids: { Work: 1 }, stats: {}, expected: "not found in statistics" }],
    [
      "invalid numeric field",
      {
        ids: { Work: 1 },
        stats: { 1: { new_count: "x" } },
        expected: "Invalid getDeckStats field",
      },
    ],
  ])("reports %s from deck stats", async (_name: string, fixture): Promise<void> => {
    const result = await invokeAnki(
      ["decks", "stats", "--deck", "Work"],
      (action: string): unknown => (action === "deckNamesAndIds" ? fixture.ids : fixture.stats),
    );

    expect(JSON.parse(result.stderr)).toMatchObject({ action: "deckStats" });
    expect(JSON.parse(result.stderr).error).toContain(fixture.expected);
  });
});
