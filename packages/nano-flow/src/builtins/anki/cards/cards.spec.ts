import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

const card = (id: number, answer: string = "Q<hr id=answer>A"): Record<string, unknown> => ({
  cardId: id,
  question: "<b>Q</b>",
  answer,
  deckName: "Work",
  modelName: "Basic",
  note: id + 100,
  type: 2,
  interval: 3,
  factor: 2500,
  reps: 2,
  lapses: 1,
  tags: ["x"],
});

describe("nf anki cards", (): void => {
  test.each([
    ["cards", "--help"],
    ["cards", "due", "--help"],
    ["cards", "list", "--help"],
    ["cards", "present", "--help"],
    ["cards", "rate", "--help"],
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
  });

  test("queries due cards with escaped deck scope and honest new count", async (): Promise<void> => {
    const result = await invokeAnki(
      ["cards", "due", "--deck", 'A"*_\\B', "--limit", "2", "--include-new"],
      (action: string, params: Readonly<Record<string, unknown>> | undefined): unknown => {
        if (action === "cardsInfo") return [card(1), card(2)];
        return String(params?.["query"]).includes("(is:new)") ? [2] : [1, 2, 3];
      },
    );
    expect(result.invocations[0]?.params?.["query"]).toBe(
      '"deck:A\\"\\*\\_\\\\B" -is:suspended (is:due OR is:learn OR is:new)',
    );
    expect(JSON.parse(result.stdout)).toMatchObject({ total: 3, returned: 2 });
    expect(JSON.parse(result.stdout).message).toContain("1 new, 2 due");
  });

  test("supports state filtering and --no-learning", async (): Promise<void> => {
    const listed = await invokeAnki(
      ["cards", "list", "--state", "suspended"],
      (action: string): unknown => (action === "findCards" ? [] : undefined),
    );
    expect(listed.invocations[0]?.params).toEqual({ query: "is:suspended" });

    const due = await invokeAnki(["cards", "due", "--no-learning"], (): number[] => []);
    expect(due.invocations[0]?.params).toEqual({ query: "-is:suspended (is:due)" });
  });

  test("renders front/back from the answer separator and preserves no-separator answers", async (): Promise<void> => {
    const separated = await invokeAnki(
      ["cards", "present", "--card-id", "1", "--answer"],
      (): readonly unknown[] => [card(1)],
    );
    expect(JSON.parse(separated.stdout).card).toMatchObject({ front: "Q", back: "A" });

    const plain = await invokeAnki(
      ["cards", "present", "--card-id", "2", "--answer"],
      (): readonly unknown[] => [card(2, "<div>Whole answer</div>")],
    );
    expect(JSON.parse(plain.stdout).card.back).toBe("Whole answer");
  });

  test("rates existing cards and reports the next schedule", async (): Promise<void> => {
    let cardsInfo = 0;
    const result = await invokeAnki(
      ["cards", "rate", "--card-id", "1", "--rating", "3"],
      (action: string): unknown => {
        if (action === "answerCards") return true;
        cardsInfo += 1;
        return cardsInfo === 1
          ? [{ cardId: 1 }]
          : [{ cardId: 1, interval: 5, due: 10, factor: 2600 }];
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      ratingDescription: "Good (recalled with some effort)",
      nextReview: { interval: 5, due: 10, factor: 2600 },
    });
  });

  test("validates rating, missing cards, dry-run, and former positional forms", async (): Promise<void> => {
    expect((await invokeAnki(["cards", "rate", "--card-id", "1", "--rating", "5"])).code).toBe(2);
    const missing = await invokeAnki(
      ["cards", "rate", "--card-id", "1", "--rating", "2"],
      (): readonly unknown[] => [],
    );
    expect(JSON.parse(missing.stderr).hint).toContain("Verify the card ID");
    const dry = await invokeAnki(["cards", "rate", "--card-id", "1", "--rating", "2", "--dry-run"]);
    expect([dry.code, dry.invocations.length]).toEqual([0, 0]);
    expect(JSON.parse(dry.stdout)).toMatchObject({ dryRun: true });
    expect((await invokeAnki(["cards", "present", "1"])).code).toBe(2);
    expect((await invokeAnki(["cards", "rate", "1", "3"])).code).toBe(2);
  });

  test("preserves read-only access to scheduling actions", async (): Promise<void> => {
    let cardsInfo = 0;
    const result = await invokeAnki(
      ["cards", "rate", "--card-id", "1", "--rating", "3", "--read-only"],
      (action: string): unknown => {
        if (action === "answerCards") return true;
        cardsInfo += 1;
        return cardsInfo === 1 ? [{ cardId: 1 }] : [{ cardId: 1 }];
      },
    );
    expect(result.code).toBe(0);
    expect(
      result.invocations.map(
        (invocation: (typeof result.invocations)[number]): string => invocation.action,
      ),
    ).toContain("answerCards");
  });
});
