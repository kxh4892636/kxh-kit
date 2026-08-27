import { describe, expect, test } from "vitest";
import { JsonError } from "../errors";
import { scriptedPort, type Invocation } from "../testing/test-harness";
import { invokeAnki } from "../testing/test-harness";
import { runGetCards, type CardState } from "./list-command";
import { runPresentCard } from "./present-command";

const sparseCard = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  answer: "Question<hr id=answer>Answer",
  cardId: 1,
  deckName: "D",
  modelName: "M",
  note: 2,
  question: "Question",
  type: 0,
  ...overrides,
});

describe("card boundaries", (): void => {
  test("accepts the inclusive card limit and preserves due defaults", async (): Promise<void> => {
    const result = await invokeAnki(
      ["cards", "due", "--deck", "D", "--limit", "50"],
      (action: string): number[] => (action === "findCards" ? [] : []),
    );
    expect(result.code).toBe(0);
    expect(result.invocations).toEqual([
      {
        action: "findCards",
        params: { query: '"deck:D" -is:suspended (is:due OR is:learn)' },
      },
    ]);
  });

  test("preserves list deck and limit parameters", async (): Promise<void> => {
    const result = await invokeAnki(
      ["cards", "list", "--deck", "D", "--limit", "50"],
      (): number[] => [],
    );
    expect(result.code).toBe(0);
    expect(result.invocations).toEqual([
      { action: "findCards", params: { query: '"deck:D" -is:suspended is:due' } },
    ]);
  });

  test("preserves present defaults", async (): Promise<void> => {
    const result = await invokeAnki(
      ["cards", "present", "--card-id", "1"],
      (): Record<string, unknown>[] => [sparseCard()],
    );
    expect(result.code).toBe(0);
    expect(result.invocations).toEqual([{ action: "cardsInfo", params: { cards: [1] } }]);
    expect(JSON.parse(result.stdout).card).not.toHaveProperty("back");
  });

  test.each([
    [undefined, "-is:suspended is:due"],
    ["due", "-is:suspended is:due"],
    ["new", "-is:suspended is:new"],
    ["learning", "-is:suspended is:learn"],
    ["suspended", "is:suspended"],
    ["buried", "-is:suspended is:buried"],
  ])("builds the %s state query", async (state, query): Promise<void> => {
    const invocations: Invocation[] = [];
    await runGetCards(
      scriptedPort((): number[] => [], invocations),
      state === undefined ? {} : { cardState: state as CardState },
    );
    expect(invocations[0]?.params).toEqual({ query });
  });

  test.each([null, []])(
    "returns an empty list for %j card identifiers",
    async (ids): Promise<void> => {
      await expect(
        runGetCards(
          scriptedPort((): unknown => ids, []),
          {},
        ),
      ).resolves.toMatchObject({
        cards: [],
        total: 0,
        message: "No due cards found",
      });
    },
  );

  test("limits identifiers and fills sparse scheduling defaults", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const result = await runGetCards(
      scriptedPort(
        (action: string): unknown => (action === "findCards" ? [1, 2, 3] : [sparseCard()]),
        invocations,
      ),
      { deckName: "Deck", limit: 1 },
    );
    expect(invocations[1]?.params).toEqual({ cards: [1] });
    expect(result).toMatchObject({
      total: 3,
      returned: 1,
      cards: [{ due: 0, interval: 0, factor: 2500 }],
    });
  });

  test.each([new Error("offline"), "offline"])(
    "normalizes list failures",
    async (failure: unknown): Promise<void> => {
      await expect(
        runGetCards(
          scriptedPort(async (): Promise<never> => Promise.reject(failure), []),
          {},
        ),
      ).rejects.toMatchObject({ action: "get_cards" });
    },
  );

  test("preserves structured list errors", async (): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(
      runGetCards(
        scriptedPort(async (): Promise<never> => Promise.reject(error), []),
        {},
      ),
    ).rejects.toBe(error);
  });
});

describe("card boundaries", (): void => {
  test("presents sparse cards without an answer", async (): Promise<void> => {
    const result = await runPresentCard(
      scriptedPort((): unknown[] => [sparseCard()], []),
      {
        cardId: 1,
      },
    );
    expect(result.card).toMatchObject({
      tags: [],
      currentInterval: 0,
      easeFactor: 2500,
      reviews: 0,
      lapses: 0,
    });
    expect(result.card).not.toHaveProperty("back");
    expect(result.instruction).toContain("Question shown");
  });

  test("presents an answer when requested", async (): Promise<void> => {
    const result = await runPresentCard(
      scriptedPort((): unknown[] => [sparseCard()], []),
      {
        cardId: 1,
        showAnswer: true,
      },
    );
    expect(result.card).toMatchObject({ back: "Answer" });
    expect(result.instruction).toContain("Answer revealed");
  });

  test.each([new Error("offline"), "offline"])(
    "normalizes presentation failures",
    async (failure: unknown): Promise<void> => {
      await expect(
        runPresentCard(
          scriptedPort(async (): Promise<never> => Promise.reject(failure), []),
          {
            cardId: 1,
          },
        ),
      ).rejects.toMatchObject({ action: "present_card", details: { cardId: 1 } });
    },
  );

  test("preserves structured presentation errors", async (): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(
      runPresentCard(
        scriptedPort(async (): Promise<never> => Promise.reject(error), []),
        {
          cardId: 1,
        },
      ),
    ).rejects.toBe(error);
  });

  test.each([
    ["cards", "present", "--card-id", "0"],
    ["cards", "present", "--card-id", "1.5"],
    ["cards", "present", "--card-id", "not-a-number"],
    ["cards", "list", "--limit", "51"],
    ["cards", "due", "--limit", "0"],
    ["cards", "list", "--state", "invalid"],
  ])("rejects invalid card options", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([2, 0]);
  });
});
