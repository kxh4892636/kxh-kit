import { describe, expect, test, vi } from "vitest";
import { AnkiOperationError } from "../errors";
import type { Logger } from "../logger";
import { scriptedPort, type Invocation } from "../testing/test-harness";
import { computeDistribution, deckScopeQuery } from "./deck-metrics";
import { deckStats } from "./deck-stats";
import { createDeck, deleteDeck, listDecks, moveCards, validateDeckName } from "./decks";

const log = (): Logger => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() });

describe("deck metric boundaries", (): void => {
  test("returns no buckets when boundaries are empty", (): void => {
    expect(computeDistribution([1], [])).toEqual({
      buckets: {},
      count: 1,
      max: 1,
      mean: 1,
      median: 1,
      min: 1,
    });
  });

  test("handles a single decimal boundary and even medians", (): void => {
    expect(computeDistribution([3, 1], [2.5], "x")).toEqual({
      buckets: { "<2.5x": 1, ">2.5x": 1 },
      count: 2,
      max: 3,
      mean: 2,
      median: 2,
      min: 1,
    });
  });

  test("places every exact interval boundary and reports empty statistics", (): void => {
    expect(computeDistribution([31, 10, 30, 9, 29, 20, 19], [10, 20, 30])).toEqual({
      buckets: { "<10": 1, "10-20": 2, "20-30": 2, ">30": 2 },
      count: 7,
      max: 31,
      mean: 148 / 7,
      median: 20,
      min: 9,
    });
    expect(computeDistribution([], [10, 20])).toEqual({
      buckets: { "<10": 0, "10-20": 0, ">20": 0 },
      count: 0,
      max: 0,
      mean: 0,
      median: 0,
      min: 0,
    });
  });

  test("skips sparse boundary positions defensively", (): void => {
    const missingFirst = Array(3) as number[];
    missingFirst[1] = 2;
    missingFirst[2] = 3;
    const missingLast = [1, 2] as number[];
    missingLast.length = 3;
    const expected = { buckets: {}, count: 2, max: 3, mean: 2, median: 2, min: 1 };
    expect(computeDistribution([1, 3], missingFirst)).toEqual(expected);
    expect(computeDistribution([1, 3], missingLast)).toEqual(expected);
  });

  test("escapes every Anki deck search metacharacter", (): void => {
    expect(deckScopeQuery('A"*_\\B')).toBe('"deck:A\\"\\*\\_\\\\B"');
  });
});

describe("deck operation boundaries", (): void => {
  test.each(["::Child", "Parent::", "Parent::::Child"])(
    "rejects an empty deck name part in %j",
    (name: string): void => {
      expect(() => validateDeckName(name)).toThrow("cannot be empty");
    },
  );

  test("lists names without requesting statistics", async (): Promise<void> => {
    await expect(
      listDecks(
        scriptedPort((): string[] => ["One"], []),
        false,
      ),
    ).resolves.toMatchObject({
      decks: [{ name: "One" }],
      total: 1,
    });
  });

  test("preserves structured details and primitive list failures", async (): Promise<void> => {
    const structured = new AnkiOperationError("bad", "source", { details: { source: "x" } });
    await expect(
      listDecks(
        scriptedPort(async (): Promise<never> => Promise.reject(structured), []),
        true,
      ),
    ).rejects.toMatchObject({ action: "listDecks", details: { source: "x" } });
    await expect(
      listDecks(
        scriptedPort(async (): Promise<never> => Promise.reject("offline"), []),
        true,
      ),
    ).rejects.toMatchObject({ action: "listDecks", message: "offline" });
  });

  test("creates a nested existing deck when parent lookup failed", async (): Promise<void> => {
    let names = 0;
    const result = await createDeck(
      scriptedPort((action: string): unknown => {
        if (action === "deckNames") return names++ === 0 ? new Error("lookup") : ["P::C"];
        return null;
      }, []),
      "P::C",
      log(),
    );
    expect(result).toMatchObject({ created: false, parentDeck: "P", childDeck: "C" });
    expect(result).not.toHaveProperty("parentExisted");
  });

  test("normalizes primitive create failures", async (): Promise<void> => {
    await expect(
      createDeck(
        scriptedPort(async (): Promise<never> => Promise.reject("offline"), []),
        "D",
        log(),
      ),
    ).rejects.toMatchObject({ action: "createDeck", message: "offline" });
  });

  test("moves a valid card batch after trimming the deck", async (): Promise<void> => {
    const result = await moveCards(
      scriptedPort(
        (action: string): unknown => (action === "cardsInfo" ? [{ cardId: 1 }] : null),
        [],
      ),
      " D ",
      [1],
    );
    expect(result).toMatchObject({ cardsAffected: 1, targetDeck: "D" });
  });

  test("rejects an empty target and preserves invalid-card details", async (): Promise<void> => {
    await expect(
      moveCards(
        scriptedPort((): never => undefined as never, []),
        "  ",
        [1],
      ),
    ).rejects.toMatchObject({
      action: "changeDeck",
    });
    const result = moveCards(
      scriptedPort((): unknown[] => [null], []),
      "D",
      [1],
    );
    await expect(result).rejects.toMatchObject({ details: { invalidIds: [1], totalRequested: 1 } });
  });
});

describe("deck operation boundaries", (): void => {
  test.each([
    [
      "deck ids primitive",
      "deckNamesAndIds",
      "bad",
      "Invalid deckNamesAndIds response: expected object",
    ],
    ["deck ids null", "deckNamesAndIds", null, "Invalid deckNamesAndIds response: expected object"],
    ["deck ids array", "deckNamesAndIds", [], "Invalid deckNamesAndIds response: expected object"],
    ["stats primitive", "getDeckStats", "bad", "Invalid getDeckStats response: expected object"],
    ["stats null", "getDeckStats", null, "Invalid getDeckStats response: expected object"],
    ["stats array", "getDeckStats", [], "Invalid getDeckStats response: expected object"],
    ["root stats array", "root", { 1: [] }, 'Deck "Work" not found in statistics response'],
    [
      "find cards string",
      "findCards",
      ["bad"],
      "Invalid findCards response: expected number array",
    ],
    [
      "find cards infinite",
      "findCards",
      [Number.POSITIVE_INFINITY],
      "Invalid findCards response: expected number array",
    ],
  ])(
    "rejects malformed deck statistics: %s",
    async (_name, source, malformed, message): Promise<void> => {
      const port = scriptedPort((action: string): unknown => {
        if (action === "deckNamesAndIds") return source === action ? malformed : { Work: 1 };
        if (action === "getDeckStats") {
          if (source === action || source === "root") return malformed;
          return { 1: {} };
        }
        if (action === "findCards") return source === action ? malformed : [];
        return [];
      }, []);
      await expect(deckStats(port, "Work")).rejects.toMatchObject({
        action: "deckStats",
        hint: "Make sure Anki is running and the deck name is valid",
        message,
      });
    },
  );

  test.each(["getEaseFactors", "getIntervals"])(
    "rejects malformed %s arrays",
    async (source: string): Promise<void> => {
      let findCalls = 0;
      const port = scriptedPort((action: string): unknown => {
        if (action === "deckNamesAndIds") return { Work: 1 };
        if (action === "getDeckStats") return { 1: {} };
        if (action === "findCards") return findCalls++ === 0 ? [1] : [];
        if (action === source) return ["bad"];
        return [];
      }, []);
      await expect(deckStats(port, "Work")).rejects.toMatchObject({
        action: "deckStats",
        hint: "Make sure Anki is running and the deck name is valid",
        message: `Invalid ${source} response: expected number array`,
      });
    },
  );

  test("normalizes primitive deck stats failures", async (): Promise<void> => {
    await expect(
      deckStats(
        scriptedPort(async (): Promise<never> => Promise.reject("offline"), []),
        "Work",
      ),
    ).rejects.toMatchObject({
      action: "deckStats",
      hint: "Make sure Anki is running and the deck name is valid",
      message: "offline",
    });
  });

  test("reports exact missing-deck and malformed numeric-field errors", async (): Promise<void> => {
    await expect(
      deckStats(
        scriptedPort((action: string): unknown => {
          if (action === "deckNamesAndIds") return { Other: 1, Work: "not-an-id" };
          return {};
        }, []),
        "Work",
      ),
    ).rejects.toMatchObject({
      action: "deckStats",
      message: 'Deck "Work" not found',
    });

    for (const field of ["new_count", "learn_count", "review_count", "total_in_deck"]) {
      for (const value of ["1", Number.POSITIVE_INFINITY]) {
        await expect(
          deckStats(
            scriptedPort((action: string): unknown => {
              if (action === "deckNamesAndIds") return { Work: 1 };
              if (action === "getDeckStats") return { 1: { [field]: value } };
              return [];
            }, []),
            "Work",
          ),
        ).rejects.toMatchObject({
          action: "deckStats",
          message: `Invalid getDeckStats field: ${field}`,
        });
      }
    }
  });
});

describe("deck operation boundaries", (): void => {
  test("uses zero for malformed child statistics and preserves structured details", async (): Promise<void> => {
    const sparse = await deckStats(
      scriptedPort((action: string, params): unknown => {
        if (action === "deckNamesAndIds") return { Work: 1, "Work::Child": 2 };
        if (action === "getDeckStats") return { 1: {}, 2: null };
        if (action === "findCards" && params?.["query"] === '"deck:Work"') return [];
        return [];
      }, []),
      "Work",
    );
    expect(sparse).toMatchObject({ counts: { total: 0, new: 0, learning: 0, review: 0 } });

    const structured = new AnkiOperationError("bad stats", "getDeckStats", {
      details: { field: "total" },
    });
    await expect(
      deckStats(
        scriptedPort(async (): Promise<never> => Promise.reject(structured), []),
        "Work",
      ),
    ).rejects.toMatchObject({
      action: "deckStats",
      details: { field: "total" },
    });
  });
});

describe("deck deletion boundaries", (): void => {
  const actions = (invocations: readonly Invocation[]): readonly string[] =>
    invocations.map((entry: Invocation): string => entry.action);

  test("deletes the target subtree and reports its scope", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    let nameCalls = 0;
    const result = await deleteDeck(
      scriptedPort((action: string): unknown => {
        if (action === "deckNames") {
          nameCalls += 1;
          return nameCalls === 1 ? ["D", "D::A", "D::A::B", "D2", "D2::A"] : ["D2", "D2::A"];
        }
        if (action === "findCards") return [1, 2, 3];
        return null;
      }, invocations),
      "D",
    );

    expect(result).toMatchObject({
      success: true,
      deckName: "D",
      deletedDecks: ["D", "D::A", "D::A::B"],
      deletedChildDecks: ["D::A", "D::A::B"],
      cardsDeleted: 3,
    });
    expect(actions(invocations)).toEqual(["deckNames", "findCards", "deleteDecks", "deckNames"]);
    expect(invocations[1]?.params).toEqual({ query: '"deck:D"' });
    expect(invocations[2]?.params).toEqual({ decks: ["D"], cardsToo: true });
  });

  test("reports a childless deck and tolerates a null findCards result", async (): Promise<void> => {
    let nameCalls = 0;
    const result = await deleteDeck(
      scriptedPort((action: string): unknown => {
        if (action === "deckNames") {
          nameCalls += 1;
          return nameCalls === 1 ? ["D"] : [];
        }
        if (action === "findCards") return null;
        return null;
      }, []),
      "D",
    );
    expect(result).toMatchObject({
      success: true,
      deletedDecks: ["D"],
      deletedChildDecks: [],
      cardsDeleted: 0,
      message: 'Successfully deleted deck "D" and 0 card(s)',
    });
  });

  test("fails loudly when the verification deck list is missing", async (): Promise<void> => {
    let nameCalls = 0;
    await expect(
      deleteDeck(
        scriptedPort((action: string): unknown => {
          if (action === "deckNames") {
            nameCalls += 1;
            return nameCalls === 1 ? ["D"] : null;
          }
          if (action === "findCards") return [];
          return null;
        }, []),
        "D",
      ),
    ).rejects.toMatchObject({
      action: "deleteDecks",
      message: "Deck deletion could not be verified: Anki returned no deck list",
      hint: "Run nnf anki decks list to confirm the deck is gone",
    });
  });

  test("rejects a missing deck before deleting anything", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    await expect(
      deleteDeck(
        scriptedPort(
          (action: string): unknown => (action === "deckNames" ? ["Other"] : null),
          invocations,
        ),
        "D",
      ),
    ).rejects.toMatchObject({
      action: "deleteDecks",
      message: 'Deck "D" not found',
      hint: "Run nnf anki decks list to see the existing deck names",
    });
    expect(actions(invocations)).toEqual(["deckNames"]);
  });

  test("reports decks that survive the deletion", async (): Promise<void> => {
    await expect(
      deleteDeck(
        scriptedPort((action: string): unknown => {
          if (action === "deckNames") return ["D", "D::A"];
          if (action === "findCards") return [];
          return null;
        }, []),
        "D",
      ),
    ).rejects.toMatchObject({
      action: "deleteDecks",
      message: "Deck deletion did not remove: D, D::A",
      details: { remainingDecks: ["D", "D::A"] },
    });
  });

  test.each([
    ["deckNames", "bad", "Invalid AnkiConnect result for deckNames"],
    ["findCards", ["bad"], "Invalid AnkiConnect result for findCards"],
    ["deleteDecks", 42, "Invalid AnkiConnect result for deleteDecks"],
  ])("rejects malformed %s responses", async (source, malformed, message): Promise<void> => {
    const failure = await deleteDeck(
      scriptedPort((action: string): unknown => {
        if (action === source) return malformed;
        if (action === "deckNames") return ["D"];
        if (action === "findCards") return [];
        return null;
      }, []),
      "D",
    ).catch((error: unknown): unknown => error);

    expect(failure).toBeInstanceOf(AnkiOperationError);
    expect((failure as AnkiOperationError).action).toBe("deleteDecks");
    expect((failure as AnkiOperationError).message).toContain(message);
  });

  test("normalizes primitive failures with a connection hint", async (): Promise<void> => {
    await expect(
      deleteDeck(
        scriptedPort(async (): Promise<never> => Promise.reject("offline"), []),
        "D",
      ),
    ).rejects.toMatchObject({
      action: "deleteDecks",
      message: "offline",
      hint: "Make sure Anki is running and the deck name is valid",
    });
  });
});
