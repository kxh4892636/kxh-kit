import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

describe("loopx anki notes", (): void => {
  test.each([
    ["notes", "--help"],
    ["notes", "add", "--help"],
    ["notes", "add-batch", "--help"],
    ["notes", "find", "--help"],
    ["notes", "info", "--help"],
    ["notes", "update", "--help"],
    ["notes", "delete", "--help"],
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
  });

  test("marks mandatory named options in leaf help", async (): Promise<void> => {
    const result = await invokeAnki(["notes", "add", "--help"]);
    expect(result.stdout).toContain("Target deck (required)");
    expect(result.stdout).toContain("Field as k=v (required)");
  });

  test("adds a note with fields, tags, and duplicate options", async (): Promise<void> => {
    const result = await invokeAnki(
      [
        "notes",
        "add",
        "--deck",
        "Work",
        "--model",
        "Basic",
        "--field",
        "Front=Q",
        "Back=A",
        "--tag",
        "x",
        "--duplicate-scope",
        "deck",
      ],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front", "Back"] : 101),
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      noteId: 101,
      details: { fieldsAdded: 2, tagsAdded: 1, duplicateCheckScope: "deck" },
    });
    expect(result.invocations).toEqual([
      { action: "modelFieldNames", params: { modelName: "Basic" } },
      {
        action: "addNote",
        params: {
          note: {
            deckName: "Work",
            modelName: "Basic",
            fields: { Front: "Q", Back: "A" },
            tags: ["x"],
            options: { duplicateScope: "deck" },
          },
        },
      },
    ]);
  });

  test("reads a batch through the injected input seam and preserves partial success", async (): Promise<void> => {
    let add = 0;
    const result = await invokeAnki(
      ["notes", "add-batch", "--deck", "Work", "--model", "Basic", "--input", "notes.json"],
      (action: string): unknown => {
        if (action === "modelFieldNames") return ["Front"];
        add += 1;
        if (add === 1) return 201;
        if (add === 2) return null;
        return new Error("bad field data");
      },
      {
        readText: async (source: string): Promise<string> => {
          expect(source).toBe("notes.json");
          return JSON.stringify([
            { fields: { Front: "A" }, tags: ["one"] },
            { fields: { Front: "B" } },
            { fields: { Front: "C" } },
          ]);
        },
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      totalRequested: 3,
      created: 1,
      skipped: 1,
      failed: 1,
      results: [
        { index: 0, status: "created", noteId: 201 },
        { index: 1, status: "skipped", reason: "duplicate" },
        { index: 2, status: "failed", error: "bad field data" },
      ],
    });
  });

  test("finds notes and returns note information using named options", async (): Promise<void> => {
    const found = await invokeAnki(["notes", "find", "--query", "deck:Work"], (): number[] => [
      1, 2,
    ]);
    expect(JSON.parse(found.stdout)).toMatchObject({ count: 2, noteIds: [1, 2] });
    expect(found.invocations).toEqual([{ action: "findNotes", params: { query: "deck:Work" } }]);

    const info = await invokeAnki(["notes", "info", "--note-id", "1", "2"], (): unknown[] => [
      {
        noteId: 1,
        modelName: "Basic",
        tags: ["x"],
        fields: { Front: { value: "Q", order: 0 } },
        cards: [11],
        mod: 1,
      },
      {},
    ]);
    expect(JSON.parse(info.stdout)).toMatchObject({ count: 1, notFound: 1, models: ["Basic"] });
  });

  test("updates and deletes notes with explicit named identifiers", async (): Promise<void> => {
    const updated = await invokeAnki(
      ["notes", "update", "--id", "1", "--field", "Front=New"],
      (action: string): unknown =>
        action === "notesInfo" ? [{ modelName: "Basic", fields: { Front: {} } }] : null,
    );
    expect(JSON.parse(updated.stdout)).toMatchObject({ noteId: 1, updatedFields: ["Front"] });
    expect(JSON.parse(updated.stdout).warning).toContain("browser");
    expect(updated.invocations.at(-1)).toEqual({
      action: "updateNoteFields",
      params: { note: { id: 1, fields: { Front: "New" } } },
    });

    const deleted = await invokeAnki(
      ["notes", "delete", "--note-id", "1", "2", "--yes"],
      (action: string): unknown =>
        action === "notesInfo" ? [{ noteId: 1, cards: [11, 12] }, {}] : null,
    );
    expect(JSON.parse(deleted.stdout)).toMatchObject({
      deletedCount: 1,
      cardsDeleted: 2,
      notFoundCount: 1,
    });
    expect(deleted.invocations.at(-1)).toEqual({ action: "deleteNotes", params: { notes: [1] } });
  });

  test("validates destructive confirmation and rejects old positional inputs", async (): Promise<void> => {
    expect((await invokeAnki(["notes", "delete", "--note-id", "1"])).code).toBe(2);
    expect((await invokeAnki(["notes", "find", "deck:Work"])).code).toBe(2);
    expect((await invokeAnki(["notes", "info", "1"])).code).toBe(2);
    expect((await invokeAnki(["notes", "update", "1", "--field", "Front=x"])).code).toBe(2);
    expect((await invokeAnki(["notes", "delete", "1", "--yes"])).code).toBe(2);
    expect((await invokeAnki(["notes", "add-batch", "--deck", "D", "--model", "M"])).code).toBe(2);
  });

  test("previews every write without connecting while still validating batch input", async (): Promise<void> => {
    const cases: Array<{ argv: string[]; action: string }> = [
      {
        argv: ["notes", "add", "--deck", "D", "--model", "M", "--field", "Front=x"],
        action: "addNote",
      },
      {
        argv: ["notes", "add-batch", "--deck", "D", "--model", "M", "--input", "-"],
        action: "addNotes",
      },
      {
        argv: ["notes", "update", "--id", "1", "--field", "Front=x"],
        action: "updateNoteFields",
      },
      { argv: ["notes", "delete", "--note-id", "1", "--yes"], action: "deleteNotes" },
    ];
    for (const item of cases) {
      const result = await invokeAnki([...item.argv, "--dry-run"], (): undefined => undefined, {
        readText: async (): Promise<string> => '[{"fields":{"Front":"x"}}]',
      });
      expect([result.code, result.invocations.length]).toEqual([0, 0]);
      expect(JSON.parse(result.stdout)).toMatchObject({
        dryRun: true,
        preview: { actions: [{ action: item.action }] },
      });
    }
  });

  test("keeps command action and hint for runtime errors", async (): Promise<void> => {
    const result = await invokeAnki(
      ["notes", "find", "--query", "deck:Work"],
      (): Error => new Error("offline"),
    );
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      action: "findNotes",
      hint: "Make sure Anki is running and the query syntax is valid",
    });
  });

  test("rejects clearly invalid mutations before dry-run output", async (): Promise<void> => {
    const invalid = [
      ["notes", "add", "--deck=", "--model", "M", "--field", "Front=x", "--dry-run"],
      [
        "notes",
        "update",
        "--id",
        "1",
        "--field",
        "Front=x",
        "--audio",
        '{"url":"","filename":"a.mp3","fields":["Front"]}',
        "--dry-run",
      ],
    ];
    for (const argv of invalid) {
      const result = await invokeAnki(argv);
      expect([result.code, result.invocations.length, result.stdout]).toEqual([2, 0, ""]);
    }
  });

  test.each([
    ["duplicate", "--allow-duplicate"],
    ["model not found", "models list"],
    ["deck not found", "decks list"],
    ["field mismatch", "models fields"],
  ])("classifies add failure %s", async (message: string, hint: string): Promise<void> => {
    const result = await invokeAnki(
      ["notes", "add", "--deck", "D", "--model", "M", "--field", "Front=x"],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front"] : new Error(message)),
    );
    expect(JSON.parse(result.stderr)).toMatchObject({ action: "addNote" });
    expect(JSON.parse(result.stderr).hint).toContain(hint);
  });

  test("preserves sort-field validation and rejects malformed Anki responses", async (): Promise<void> => {
    const sortField = await invokeAnki(
      ["notes", "add", "--deck", "D", "--model", "M", "--field", "Back=x"],
      (): string[] => ["Front", "Back"],
    );
    expect(JSON.parse(sortField.stderr).hint).toContain("sort field");

    const malformed = await invokeAnki(
      ["notes", "find", "--query", "deck:D"],
      (): { bad: boolean } => ({ bad: true }),
    );
    expect(JSON.parse(malformed.stderr)).toMatchObject({ action: "findNotes" });
    expect(malformed.stderr).toContain("Invalid AnkiConnect result");
  });
});
