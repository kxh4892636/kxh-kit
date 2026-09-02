import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

const card = (id: number): Record<string, unknown> => ({
  cardId: id,
  question: `Q${id}`,
  answer: `Q${id}<hr id=answer>A${id}`,
  deckName: "Work",
  modelName: "Basic",
  note: id + 100,
  type: 2,
});

const events = (stdout: string): readonly Record<string, unknown>[] =>
  stdout
    .trim()
    .split("\n")
    .filter((line: string): boolean => line.length > 0)
    .map((line: string): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>);

describe("nnf anki review", (): void => {
  test("renders help without connecting", async (): Promise<void> => {
    const result = await invokeAnki(["review", "--help"]);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
  });

  test("runs sync, question, rating, quit, and summary as JSON events", async (): Promise<void> => {
    let cardsInfo = 0;
    const result = await invokeAnki(
      ["review", "--deck", "Work", "--limit", "2"],
      (action: string): unknown => {
        if (action === "sync") return null;
        if (action === "findCards") return [1, 2];
        if (action === "answerCards") return true;
        cardsInfo += 1;
        if (cardsInfo === 1) return [card(1), card(2)];
        if (cardsInfo === 2) return [{ cardId: 1 }];
        return [{ cardId: 1, interval: 4, due: 9, factor: 2500 }];
      },
      {
        lines: ["3", "q"],
        now: (): Date => new Date("2026-08-23T00:00:00.000Z"),
      },
    );
    const output = events(result.stdout);
    expect(output[0]).toMatchObject({ timestamp: "2026-08-23T00:00:00.000Z" });
    expect(output[2]).toMatchObject({ type: "question", cardId: 1, front: "Q1" });
    expect(output[3]).toMatchObject({ cardId: 1, rating: 3 });
    expect(output.at(-1)).toMatchObject({ reviewed: 1, skipped: 0 });
  });

  test("emits deterministic invalid-rating and per-card failure events", async (): Promise<void> => {
    let cardsInfo = 0;
    const result = await invokeAnki(
      ["review", "--no-sync"],
      (action: string): unknown => {
        if (action === "findCards") return [1, 2];
        cardsInfo += 1;
        return cardsInfo === 1 ? [card(1), card(2)] : [];
      },
      { lines: ["bad", "2"] },
    );
    const output = events(result.stdout);
    expect(
      result.invocations.some(
        (invocation: (typeof result.invocations)[number]): boolean => invocation.action === "sync",
      ),
    ).toBe(false);
    expect(output).toContainEqual(expect.objectContaining({ success: false, received: "bad" }));
    expect(output).toContainEqual(expect.objectContaining({ success: false, cardId: 2 }));
    expect(output.at(-1)).toMatchObject({ reviewed: 0, skipped: 2 });
  });

  test("converges EOF and SIGINT to a final summary", async (): Promise<void> => {
    const handler = (action: string): unknown =>
      action === "findCards" ? [1] : action === "cardsInfo" ? [card(1)] : null;
    const eof = await invokeAnki(["review", "--no-sync"], handler);
    expect(events(eof.stdout).at(-1)).toMatchObject({ reviewed: 0, skipped: 0 });

    const controller = new AbortController();
    controller.abort();
    const interrupted = await invokeAnki(["review", "--no-sync"], handler, {
      signal: controller.signal,
    });
    expect(events(interrupted.stdout).at(-1)).toMatchObject({ reviewed: 0, skipped: 0 });

    const pendingController = new AbortController();
    const pending = await invokeAnki(["review", "--no-sync"], handler, {
      signal: pendingController.signal,
      readLine: async (): Promise<null> => {
        pendingController.abort();
        return null;
      },
    });
    const pendingEvents = events(pending.stdout);
    expect(pendingEvents).toContainEqual(expect.objectContaining({ type: "question", cardId: 1 }));
    expect(pendingEvents.at(-1)).toMatchObject({ reviewed: 0, skipped: 0 });
  });

  test("dry-run queries due cards but never syncs or rates", async (): Promise<void> => {
    const result = await invokeAnki(
      ["review", "--limit", "1", "--dry-run"],
      (action: string): unknown => (action === "findCards" ? [1] : [card(1)]),
    );
    expect(
      result.invocations.map(
        (invocation: (typeof result.invocations)[number]): string => invocation.action,
      ),
    ).toEqual(["findCards", "cardsInfo"]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dryRun: true,
      preview: { actions: [{ action: "review" }], cards: [{ cardId: 1 }] },
    });
  });

  test("rejects invalid limits and former positional review input", async (): Promise<void> => {
    expect((await invokeAnki(["review", "--limit", "0"])).code).toBe(2);
    expect((await invokeAnki(["review", "Work"])).code).toBe(2);
  });

  test("preserves read-only review scheduling and sync", async (): Promise<void> => {
    let cardsInfo = 0;
    const result = await invokeAnki(
      ["review", "--read-only"],
      (action: string): unknown => {
        if (action === "sync") return null;
        if (action === "findCards") return [1];
        if (action === "answerCards") return true;
        cardsInfo += 1;
        if (cardsInfo === 1) return [card(1)];
        if (cardsInfo === 2) return [{ cardId: 1 }];
        return [{ cardId: 1 }];
      },
      { lines: ["3"] },
    );
    expect(result.code).toBe(0);
    expect(
      result.invocations.map(
        (invocation: (typeof result.invocations)[number]): string => invocation.action,
      ),
    ).toEqual(["sync", "findCards", "cardsInfo", "cardsInfo", "answerCards", "cardsInfo"]);
  });
});
