import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

describe("loopx anki gui", (): void => {
  test.each([
    ["gui", "--help"],
    ...[
      "browse",
      "select",
      "selected-notes",
      "add-cards",
      "edit",
      "deck-overview",
      "deck-browser",
      "current-card",
      "show-question",
      "show-answer",
      "undo",
    ].map((name: string): string[] => ["gui", name, "--help"]),
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
    expect(result.stdout).toContain("editing/creation workflows");
    expect(result.stdout).toContain("not for review sessions");
  });

  test("opens a reordered browser and selects an existing card", async (): Promise<void> => {
    const browsed = await invokeAnki(
      ["gui", "browse", "--query", "deck:X", "--order", "desc", "--column", "cardDue"],
      (): number[] => [1, 2],
    );
    expect(browsed.invocations[0]).toEqual({
      action: "guiBrowse",
      params: { query: "deck:X", reorderCards: { order: "descending", columnId: "cardDue" } },
    });
    expect(JSON.parse(browsed.stdout)).toMatchObject({ cardIds: [1, 2], cardCount: 2 });

    const selected = await invokeAnki(["gui", "select", "--card-id", "5"], (): boolean => true);
    expect(selected.invocations[0]).toEqual({ action: "guiSelectCard", params: { card: 5 } });
    expect(JSON.parse(selected.stdout)).toMatchObject({ cardId: 5, browserOpen: true });
  });

  test("queries selected notes and current review card", async (): Promise<void> => {
    const notes = await invokeAnki(["gui", "selected-notes", "--dry-run"], (): number[] => [9]);
    expect(notes.invocations[0]?.action).toBe("guiSelectedNotes");
    expect(JSON.parse(notes.stdout)).toMatchObject({ noteIds: [9], noteCount: 1 });

    const current = await invokeAnki(["gui", "current-card", "--dry-run"], (): null => null);
    expect(current.invocations[0]?.action).toBe("guiCurrentCard");
    expect(JSON.parse(current.stdout)).toMatchObject({ inReview: false, cardInfo: null });
  });

  test("prefills add-cards and opens edit/deck dialogs", async (): Promise<void> => {
    const added = await invokeAnki(
      [
        "gui",
        "add-cards",
        "--deck",
        "D",
        "--model",
        "Basic",
        "--field",
        "Front=q",
        "--field",
        "Back=a",
        "--tag",
        "x",
      ],
      (): number => 42,
    );
    expect(added.invocations[0]).toEqual({
      action: "guiAddCards",
      params: {
        note: { deckName: "D", modelName: "Basic", fields: { Front: "q", Back: "a" }, tags: ["x"] },
      },
    });
    expect(JSON.parse(added.stdout).noteId).toBe(42);

    const edit = await invokeAnki(["gui", "edit", "--note-id", "7"], (): null => null);
    expect(edit.invocations[0]).toEqual({ action: "guiEditNote", params: { note: 7 } });
    expect(JSON.parse(edit.stdout)).toMatchObject({ success: true, noteId: 7 });
    const overview = await invokeAnki(["gui", "deck-overview", "--deck", "D"], (): boolean => true);
    expect(overview.invocations[0]).toEqual({ action: "guiDeckOverview", params: { name: "D" } });
    expect(JSON.parse(overview.stdout)).toMatchObject({ success: true, deckName: "D" });
    const browser = await invokeAnki(["gui", "deck-browser"], (): null => null);
    expect(browser.invocations[0]?.action).toBe("guiDeckBrowser");
    expect(JSON.parse(browser.stdout)).toMatchObject({ success: true });
  });

  test("drives review-side display and undo with existing result shapes", async (): Promise<void> => {
    const question = await invokeAnki(["gui", "show-question"], (): boolean => true);
    expect(question.invocations[0]).toEqual({ action: "guiShowQuestion", params: undefined });
    expect(JSON.parse(question.stdout)).toMatchObject({ inReview: true });
    const answer = await invokeAnki(["gui", "show-answer"], (): boolean => false);
    expect(answer.invocations[0]).toEqual({ action: "guiShowAnswer", params: undefined });
    expect(JSON.parse(answer.stdout)).toMatchObject({ inReview: false });
    const undone = await invokeAnki(["gui", "undo"], (): boolean => false);
    expect(undone.invocations[0]).toEqual({ action: "guiUndo", params: undefined });
    expect(JSON.parse(undone.stdout)).toMatchObject({ undone: false });
  });

  test("preserves GUI state errors and validates named input before connecting", async (): Promise<void> => {
    const closed = await invokeAnki(["gui", "select", "--card-id", "5"], (): boolean => false);
    expect(JSON.parse(closed.stderr)).toMatchObject({ action: "guiSelectCard" });
    expect(JSON.parse(closed.stderr).hint).toContain("gui browse");
    const missing = await invokeAnki(
      ["gui", "deck-overview", "--deck", "Missing"],
      (): boolean => false,
    );
    expect(JSON.parse(missing.stderr)).toMatchObject({ action: "guiDeckOverview" });
    expect((await invokeAnki(["gui", "browse", "--query", "", "--order", "sideways"])).code).toBe(
      2,
    );
    expect(
      (
        await invokeAnki([
          "gui",
          "add-cards",
          "--deck",
          "D",
          "--model",
          "Basic",
          "--field",
          "broken",
        ])
      ).code,
    ).toBe(2);
    const empty = await invokeAnki([
      "gui",
      "add-cards",
      "--deck",
      "D",
      "--model",
      "Basic",
      "--field",
      "Front=",
    ]);
    expect(JSON.parse(empty.stderr)).toMatchObject({
      action: "guiAddCards",
      emptyFields: ["Front"],
    });
  });

  test.each([
    [["gui", "browse", "--query", "deck:X"], "guiBrowse"],
    [["gui", "select", "--card-id", "1"], "guiSelectCard"],
    [["gui", "selected-notes"], "guiSelectedNotes"],
    [["gui", "add-cards", "--deck", "D", "--model", "Basic", "--field", "Front=q"], "guiAddCards"],
    [["gui", "edit", "--note-id", "1"], "guiEditNote"],
    [["gui", "deck-overview", "--deck", "D"], "guiDeckOverview"],
    [["gui", "deck-browser"], "guiDeckBrowser"],
    [["gui", "current-card"], "guiCurrentCard"],
    [["gui", "show-question"], "guiShowQuestion"],
    [["gui", "show-answer"], "guiShowAnswer"],
    [["gui", "undo"], "guiUndo"],
  ] as const)(
    "keeps structured GUI-unavailable errors for %s",
    async (argv: readonly string[], action: string): Promise<void> => {
      const result = await invokeAnki(argv, (): Error => new Error("GUI is not available"));
      expect(JSON.parse(result.stderr)).toMatchObject({ action });
      expect(JSON.parse(result.stderr).hint).toBeTypeOf("string");
    },
  );

  test("previews every GUI mutation without invoking Anki", async (): Promise<void> => {
    const commands = [
      ["browse", "--query", "deck:X"],
      ["select", "--card-id", "1"],
      ["add-cards", "--deck", "D", "--model", "Basic", "--field", "Front=q"],
      ["edit", "--note-id", "1"],
      ["deck-overview", "--deck", "D"],
      ["deck-browser"],
      ["show-question"],
      ["show-answer"],
      ["undo"],
    ];
    for (const command of commands) {
      const result = await invokeAnki(["gui", ...command, "--dry-run"]);
      expect([result.code, result.invocations.length, JSON.parse(result.stdout).dryRun]).toEqual([
        0,
        0,
        true,
      ]);
    }
  });

  test("rejects every former positional GUI input", async (): Promise<void> => {
    for (const argv of [
      ["gui", "browse", "deck:X"],
      ["gui", "select", "1"],
      ["gui", "edit", "1"],
      ["gui", "deck-overview", "D"],
    ])
      expect((await invokeAnki(argv)).code).toBe(2);
  });
});
