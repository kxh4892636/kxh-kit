import { describe, expect, test, vi } from "vitest";
import { runGetDueCards } from "./cards/due-command";
import { runRateCard } from "./cards/rate-command";
import { JsonError } from "./errors";
import { type Logger } from "./logger";
import { distribution, retention, streak } from "./stats/stat-metrics";
import { invokeAnki, scriptedPort, type InvokeHandler } from "./testing/test-harness";

interface FailureCase {
  readonly argv: readonly string[];
  readonly name: string;
  readonly options?: Parameters<typeof invokeAnki>[2];
}

const cases: readonly FailureCase[] = [
  { name: "decks list", argv: ["decks", "list"] },
  { name: "decks stats", argv: ["decks", "stats", "--deck", "Work"] },
  { name: "decks create", argv: ["decks", "create", "--name", "Work"] },
  { name: "decks move", argv: ["decks", "move", "--card-id", "1", "--deck", "Work"] },
  { name: "decks delete", argv: ["decks", "delete", "--name", "Work", "--yes"] },
  { name: "cards due", argv: ["cards", "due"] },
  { name: "cards list", argv: ["cards", "list"] },
  { name: "cards present", argv: ["cards", "present", "--card-id", "1"] },
  { name: "cards rate", argv: ["cards", "rate", "--card-id", "1", "--rating", "3"] },
  { name: "tags list", argv: ["tags", "list"] },
  { name: "tags add", argv: ["tags", "add", "--note-id", "1", "--tag", "x"] },
  { name: "tags remove", argv: ["tags", "remove", "--note-id", "1", "--tag", "x"] },
  {
    name: "tags replace",
    argv: ["tags", "replace", "--note-id", "1", "--from", "x", "--to", "y"],
  },
  { name: "tags clear", argv: ["tags", "clear-unused", "--yes"] },
  { name: "media list", argv: ["media", "list"] },
  { name: "media get", argv: ["media", "get", "--filename", "a.mp3"] },
  {
    name: "media store",
    argv: ["media", "store", "--data", "eA==", "--filename", "a.png"],
  },
  { name: "media delete", argv: ["media", "delete", "--filename", "a.mp3", "--yes"] },
  { name: "models list", argv: ["models", "list"] },
  { name: "models fields", argv: ["models", "fields", "--name", "Basic"] },
  { name: "models styling", argv: ["models", "styling", "--name", "Basic"] },
  { name: "models templates", argv: ["models", "templates", "--name", "Basic"] },
  {
    name: "models create",
    argv: [
      "models",
      "create",
      "--name",
      "Custom",
      "--field",
      "Front",
      "--templates",
      '[{"Name":"Card 1","Front":"{{Front}}","Back":"{{Front}}"}]',
    ],
  },
  {
    name: "models update styling",
    argv: ["models", "update-styling", "--name", "Custom", "--css", ".card{}"],
    options: { readText: async (): Promise<string> => ".card{}" },
  },
  {
    name: "models update templates",
    argv: [
      "models",
      "update-templates",
      "--name",
      "Custom",
      "--templates",
      '{"Card 1":{"Front":"{{Front}}","Back":"{{Front}}"}}',
    ],
  },
  {
    name: "models field add",
    argv: ["models", "field-add", "--name", "Custom", "--field", "Extra"],
  },
  {
    name: "models field remove",
    argv: ["models", "field-remove", "--name", "Custom", "--field", "Extra", "--yes"],
  },
  {
    name: "models field rename",
    argv: [
      "models",
      "field-rename",
      "--name",
      "Custom",
      "--old-name",
      "Front",
      "--new-name",
      "Prompt",
    ],
  },
  {
    name: "models field reposition",
    argv: ["models", "field-reposition", "--name", "Custom", "--field", "Front", "--index", "0"],
  },
  {
    name: "notes add",
    argv: ["notes", "add", "--deck", "Work", "--model", "Basic", "--field", "Front=q"],
  },
  {
    name: "notes add batch",
    argv: ["notes", "add-batch", "--deck", "Work", "--model", "Basic", "--input", "notes.json"],
    options: { readText: async (): Promise<string> => '[{"fields":{"Front":"q"}}]' },
  },
  { name: "notes find", argv: ["notes", "find", "--query", "deck:Work"] },
  { name: "notes info", argv: ["notes", "info", "--note-id", "1"] },
  {
    name: "notes update",
    argv: ["notes", "update", "--id", "1", "--field", "Front=q"],
  },
  { name: "notes delete", argv: ["notes", "delete", "--note-id", "1", "--yes"] },
  { name: "stats collection", argv: ["stats", "collection"] },
  { name: "stats review", argv: ["stats", "review", "--start", "2020-01-01"] },
  { name: "gui browse", argv: ["gui", "browse", "--query", "deck:Work"] },
  { name: "gui select", argv: ["gui", "select", "--card-id", "1"] },
  { name: "gui selected notes", argv: ["gui", "selected-notes"] },
  {
    name: "gui add cards",
    argv: ["gui", "add-cards", "--deck", "Work", "--model", "Basic", "--field", "Front=q"],
  },
  { name: "gui edit", argv: ["gui", "edit", "--note-id", "1"] },
  { name: "gui deck overview", argv: ["gui", "deck-overview", "--deck", "Work"] },
  { name: "gui deck browser", argv: ["gui", "deck-browser"] },
  { name: "gui current card", argv: ["gui", "current-card"] },
  { name: "gui show question", argv: ["gui", "show-question"] },
  { name: "gui show answer", argv: ["gui", "show-answer"] },
  { name: "gui undo", argv: ["gui", "undo"] },
  { name: "sync", argv: ["sync"] },
];

const failures: readonly {
  readonly handler: InvokeHandler;
  readonly marker: string;
  readonly name: string;
}[] = [
  {
    name: "structured",
    marker: "structured failure",
    handler: (): JsonError => new JsonError("structured failure", { action: "boundary" }),
  },
  {
    name: "primitive",
    marker: "primitive failure",
    handler: async (): Promise<never> => Promise.reject("primitive failure"),
  },
];

describe("Anki operation failure boundaries", (): void => {
  test.each(
    cases.flatMap((item: FailureCase) =>
      failures.map((failure) => [item.name, failure.name, item, failure] as const),
    ),
  )(
    "%s preserves %s failures",
    async (
      _caseName: string,
      _failureName: string,
      item: FailureCase,
      failure: (typeof failures)[number],
    ): Promise<void> => {
      const result = await invokeAnki(item.argv, failure.handler, item.options);

      expect(result.code).toBe(1);
      expect(JSON.parse(result.stderr).error).toContain(failure.marker);
      expect(result.invocations.length).toBeGreaterThan(0);
    },
  );
});

const sparseCard = (): Record<string, unknown> => ({
  answer: "Q<hr id=answer>A",
  cardId: 1,
  deckName: "D",
  modelName: "M",
  note: 2,
  question: "Q",
  type: 0,
});
const logger = (): Logger => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() });

describe("due-card boundaries", (): void => {
  test.each([null, []])("returns no due cards for %j", async (ids): Promise<void> => {
    await expect(
      runGetDueCards(
        scriptedPort((): unknown => ids, []),
        {},
      ),
    ).resolves.toMatchObject({
      total: 0,
      cards: [],
    });
  });

  test("uses sparse card defaults without new-card classification", async (): Promise<void> => {
    const result = await runGetDueCards(
      scriptedPort(
        (action: string): unknown => (action === "findCards" ? [1] : [sparseCard()]),
        [],
      ),
      { includeLearning: false },
    );
    expect(result).toMatchObject({
      message: expect.stringContaining("1 due cards"),
      cards: [{ due: 0, interval: 0, factor: 2500 }],
    });
  });

  test.each([new Error("lookup failed"), "lookup failed"])(
    "logs %s from optional new-card classification",
    async (failure: unknown): Promise<void> => {
      let calls = 0;
      const log = logger();
      const result = await runGetDueCards(
        scriptedPort((action: string): unknown => {
          if (action === "findCards") return calls++ === 0 ? [1] : Promise.reject(failure);
          return [sparseCard()];
        }, []),
        { includeNew: true },
        log,
      );
      expect(result.total).toBe(1);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("lookup failed"));
    },
  );

  test("handles a nullable new-card result", async (): Promise<void> => {
    let calls = 0;
    const result = await runGetDueCards(
      scriptedPort((action: string): unknown => {
        if (action === "findCards") return calls++ === 0 ? [1] : null;
        return [sparseCard()];
      }, []),
      { includeNew: true },
    );
    expect(result.message).toContain("0 new, 1 due");
  });

  test("preserves structured due-card errors", async (): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(
      runGetDueCards(
        scriptedPort(async (): Promise<never> => Promise.reject(error), []),
        {},
      ),
    ).rejects.toBe(error);
  });
});

describe("rate-card boundaries", (): void => {
  test("rejects a false answer response", async (): Promise<void> => {
    await expect(
      runRateCard(
        scriptedPort(
          (action: string): unknown => (action === "cardsInfo" ? [{ cardId: 1 }] : false),
          [],
        ),
        { cardId: 1, rating: 1 },
      ),
    ).rejects.toMatchObject({ action: "rate_card" });
  });

  test("returns null when the updated schedule is absent", async (): Promise<void> => {
    let info = 0;
    const result = await runRateCard(
      scriptedPort((action: string): unknown => {
        if (action === "answerCards") return true;
        return info++ === 0 ? [{ cardId: 1 }] : [];
      }, []),
      { cardId: 1, rating: 2 },
    );
    expect(result.nextReview).toBeNull();
  });

  test("fills sparse schedule defaults", async (): Promise<void> => {
    let info = 0;
    const result = await runRateCard(
      scriptedPort((action: string): unknown => {
        if (action === "answerCards") return true;
        return info++ === 0 ? [{ cardId: 1 }] : [{ cardId: 1 }];
      }, []),
      { cardId: 1, rating: 4 },
    );
    expect(result.nextReview).toEqual({ interval: 0, due: 0, factor: 2500 });
  });
});

describe("statistics metric boundaries", (): void => {
  test("handles values without bucket boundaries", (): void => {
    expect(distribution([1], [])).toMatchObject({ count: 1, buckets: {} });
  });

  test("computes odd and even decimal distributions", (): void => {
    expect(distribution([1, 2, 3], [2.5])).toMatchObject({ median: 2, count: 3 });
    expect(distribution([1, 2], [1.5])).toMatchObject({ median: 1.5, count: 2 });
  });

  test("computes empty, categorized, and ignored retention ratings", (): void => {
    expect(retention([]).overall).toBe(0);
    expect(retention([0, 1, 2, 3, 4, 5])).toEqual({
      overall: 0.75,
      by_rating: { again: 1, hard: 1, good: 1, easy: 1 },
    });
  });

  test("counts a current streak and stops at the first gap", (): void => {
    const today = new Date("2026-08-27T12:00:00Z");
    expect(streak([], today)).toBe(0);
    expect(
      streak(
        [
          { date: "2026-08-27", count: 1 },
          { date: "2026-08-26", count: 2 },
          { date: "2026-08-25", count: 0 },
        ],
        today,
      ),
    ).toBe(2);
  });
});

describe("tag parser boundaries", (): void => {
  test.each(["0", "-1", "1.5", "not-a-number"])(
    "rejects invalid tag note id %j",
    async (id): Promise<void> => {
      expect((await invokeAnki(["tags", "add", "--note-id", id, "--tag", "x"])).code).toBe(2);
    },
  );

  test("rejects more than one thousand tag note ids", async (): Promise<void> => {
    const ids = Array.from({ length: 1001 }, (_, index: number): string => String(index + 1));
    expect((await invokeAnki(["tags", "add", "--note-id", ...ids, "--tag", "x"])).code).toBe(2);
  });

  test.each(["", "   "])("rejects empty tag %j", async (tag): Promise<void> => {
    expect((await invokeAnki(["tags", "add", "--note-id", "1", `--tag=${tag}`])).code).toBe(2);
  });

  test.each([
    ["", "new"],
    ["two words", "new"],
    ["old", ""],
    ["old", "two words"],
  ])("rejects invalid tag replacement %j -> %j", async (from, to): Promise<void> => {
    expect(
      (await invokeAnki(["tags", "replace", "--note-id", "1", `--from=${from}`, `--to=${to}`]))
        .code,
    ).toBe(2);
  });
});
