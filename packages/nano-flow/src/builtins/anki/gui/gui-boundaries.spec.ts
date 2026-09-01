import { describe, expect, test } from "vitest";
import { JsonError } from "../errors";
import { invokeAnki, scriptedPort } from "../testing/test-harness";
import { guiBrowse, guiSelectCard, guiSelectedNotes } from "./browse-commands";
import {
  guiAddCards,
  guiDeckBrowser,
  guiDeckOverview,
  guiEditNote,
  type GuiNote,
} from "./dialog-commands";
import { guiCurrentCard, guiShowSide, guiUndo } from "./view-commands";

const rejectPort = (failure: unknown) =>
  scriptedPort(async (): Promise<never> => Promise.reject(failure), []);
const note: GuiNote = { deckName: "D", modelName: "M", fields: { Front: "Q" } };

describe("GUI operation boundaries", (): void => {
  test.each([
    [["gui", "select", "--card-id", "0"], "--card-id must be a positive integer"],
    [["gui", "select", "--card-id", "-1"], "--card-id must be a positive integer"],
    [["gui", "edit", "--note-id", "1.5"], "--note-id must be a positive integer"],
    [["gui", "browse", "--query", "deck:D", "--order", "sideways"], "--order must be asc or desc"],
    [
      ["gui", "browse", "--query", "deck:D", "--column", "   "],
      "--column requires a non-empty value",
    ],
    [
      ["gui", "add-cards", "--deck", "D", "--model", "M", "--field", "=value"],
      '--field requires k=v: "=value"',
    ],
    [
      ["gui", "add-cards", "--deck", "D", "--model", "M", "--field", "broken"],
      '--field requires k=v: "broken"',
    ],
  ] as const)("rejects the exact invalid GUI boundary for %j", async (argv, message) => {
    const result = await invokeAnki(argv);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error).toBe(message);
    expect(result.invocations).toEqual([]);
  });

  test.each([
    [["gui", "browse", "--query", "  deck:D  "], { query: "deck:D" }],
    [
      ["gui", "browse", "--query", "deck:D", "--order", "asc"],
      { query: "deck:D", reorderCards: { order: "ascending", columnId: "noteFld" } },
    ],
    [
      ["gui", "browse", "--query", "deck:D", "--column", "cardDue"],
      { query: "deck:D", reorderCards: { order: "ascending", columnId: "cardDue" } },
    ],
  ] as const)("prepares the exact browser parameters for %j", async (argv, params) => {
    const result = await invokeAnki(argv, (): number[] => []);
    expect(result.code).toBe(0);
    expect(result.invocations).toEqual([{ action: "guiBrowse", params }]);
  });

  test("omits empty tags and trims dialog text", async (): Promise<void> => {
    const result = await invokeAnki(
      ["gui", "add-cards", "--deck", "  D  ", "--model", "  M  ", "--field", "Front=q"],
      (): number => 1,
    );
    expect(result.invocations).toEqual([
      {
        action: "guiAddCards",
        params: { note: { deckName: "D", modelName: "M", fields: { Front: "q" } } },
      },
    ]);
  });

  test("browses an empty result without reorder options", async (): Promise<void> => {
    await expect(
      guiBrowse(
        scriptedPort((): number[] => [], []),
        "x",
      ),
    ).resolves.toMatchObject({
      cardCount: 0,
      hint: expect.stringContaining("No cards found"),
    });
  });

  test.each([
    [new Error("bad query syntax"), "Invalid search query"],
    ["offline", "Make sure Anki is running"],
  ])("classifies browse failures", async (failure, hint): Promise<void> => {
    await expect(guiBrowse(rejectPort(failure), "x")).rejects.toMatchObject({
      action: "guiBrowse",
      hint: expect.stringContaining(hint),
    });
  });

  test.each([
    [new Error("card not found"), "Card ID not found"],
    ["offline", "Make sure Anki is running"],
  ])("classifies select failures", async (failure, hint): Promise<void> => {
    await expect(guiSelectCard(rejectPort(failure), 1)).rejects.toMatchObject({
      action: "guiSelectCard",
      hint: expect.stringContaining(hint),
    });
  });

  test("describes empty and populated selected notes", async (): Promise<void> => {
    await expect(guiSelectedNotes(scriptedPort((): number[] => [], []))).resolves.toMatchObject({
      noteCount: 0,
      message: expect.stringContaining("No notes"),
    });
    await expect(guiSelectedNotes(scriptedPort((): number[] => [1], []))).resolves.toMatchObject({
      noteCount: 1,
      message: expect.stringContaining("Retrieved"),
    });
  });

  test.each([
    [new Error("browser not open"), "Card Browser is not open"],
    ["offline", "Make sure Anki is running"],
  ])("classifies selected-note failures", async (failure, hint): Promise<void> => {
    await expect(guiSelectedNotes(rejectPort(failure))).rejects.toMatchObject({
      action: "guiSelectedNotes",
      hint: expect.stringContaining(hint),
    });
  });

  test.each([
    [new Error("field mismatch"), "Field mismatch"],
    [new Error("model missing"), "Model not found"],
    [new Error("deck missing"), "Deck not found"],
    ["offline", "Make sure Anki is running"],
  ])("classifies add-card failures", async (failure, hint): Promise<void> => {
    await expect(guiAddCards(rejectPort(failure), note)).rejects.toMatchObject({
      action: "guiAddCards",
      hint: expect.stringContaining(hint),
    });
  });
});

describe("GUI operation boundaries", (): void => {
  test.each([
    [new Error("note not found"), "Note not found"],
    ["offline", "Make sure Anki is running"],
  ])("classifies edit failures", async (failure, hint): Promise<void> => {
    await expect(guiEditNote(rejectPort(failure), 1)).rejects.toMatchObject({
      action: "guiEditNote",
      hint: expect.stringContaining(hint),
    });
  });

  test.each([
    [new Error("deck not found"), "Deck not found"],
    ["offline", "Make sure Anki is running"],
  ])("classifies overview failures", async (failure, hint): Promise<void> => {
    await expect(guiDeckOverview(rejectPort(failure), "D")).rejects.toMatchObject({
      action: "guiDeckOverview",
      hint: expect.stringContaining(hint),
    });
  });

  test("preserves structured dialog errors", async (): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(guiDeckBrowser(rejectPort(error))).rejects.toBe(error);
  });

  test("returns a populated current card", async (): Promise<void> => {
    await expect(
      guiCurrentCard(
        scriptedPort(
          (): Record<string, unknown> => ({
            answer: "A",
            question: "Q",
            deckName: "D",
            modelName: "M",
            cardId: 1,
            buttons: [1],
            nextReviews: ["1m"],
          }),
          [],
        ),
      ),
    ).resolves.toMatchObject({ inReview: true, message: expect.stringContaining("Current card") });
  });

  test("covers both show-side outcomes", async (): Promise<void> => {
    await expect(
      guiShowSide(
        scriptedPort((): boolean => false, []),
        "guiShowQuestion",
      ),
    ).resolves.toMatchObject({
      inReview: false,
      message: expect.stringContaining("question"),
    });
    await expect(
      guiShowSide(
        scriptedPort((): boolean => true, []),
        "guiShowAnswer",
      ),
    ).resolves.toMatchObject({
      inReview: true,
      message: expect.stringContaining("Answer"),
    });
  });

  test("reports a successful undo", async (): Promise<void> => {
    await expect(guiUndo(scriptedPort((): boolean => true, []))).resolves.toMatchObject({
      undone: true,
    });
  });
});
