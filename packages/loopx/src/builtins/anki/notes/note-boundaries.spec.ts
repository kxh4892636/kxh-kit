import { describe, expect, test, vi } from "vitest";
import { JsonError, ReadOnlyModeError } from "../errors";
import type { Logger } from "../logger";
import { scriptedPort, type Invocation } from "../testing/test-harness";
import { addNoteParamsSchema, runAddNote } from "./add-note-command";
import { addNotesParamsSchema, runAddNotes } from "./add-notes-command";
import { deleteNotesParamsSchema, runDeleteNotes } from "./delete-notes-command";
import { findNotesParamsSchema, runFindNotes } from "./find-notes-command";
import { notesInfoParamsSchema, runNotesInfo } from "./notes-info-command";
import { runUpdateNoteFields, updateNoteFieldsParamsSchema } from "./update-note-fields-command";

const portFor = (
  handler: (action: string, invocation: number) => unknown,
): ReturnType<typeof scriptedPort> =>
  scriptedPort(
    (action: string, _params, invocation: number): unknown => handler(action, invocation),
    [],
  );

const logger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
});

describe("note command boundaries", (): void => {
  test("validates every operation schema and its nested object boundaries", (): void => {
    for (const schema of [
      addNoteParamsSchema,
      addNotesParamsSchema,
      deleteNotesParamsSchema,
      findNotesParamsSchema,
      notesInfoParamsSchema,
      updateNoteFieldsParamsSchema,
    ]) {
      expect(schema.safeParse({}).success).toBe(false);
    }
    expect(
      addNoteParamsSchema.safeParse({
        deckName: "D",
        modelName: "M",
        fields: { Front: "Q" },
        duplicateScopeOptions: { checkChildren: "no" },
      }).success,
    ).toBe(false);
    expect(
      addNotesParamsSchema.safeParse({ deckName: "D", modelName: "M", notes: [{}] }).success,
    ).toBe(false);
    expect(updateNoteFieldsParamsSchema.safeParse({ note: {} }).success).toBe(false);
    for (const attachment of ["audio", "picture"] as const) {
      expect(
        updateNoteFieldsParamsSchema.safeParse({
          note: { id: 1, fields: {}, [attachment]: [{}] },
        }).success,
      ).toBe(false);
    }
  });

  test("enforces collection and query schema size boundaries", (): void => {
    const hundredIds = Array.from({ length: 100 }, (_, index: number): number => index + 1);
    expect(findNotesParamsSchema.safeParse({ query: "ab" }).success).toBe(true);
    expect(notesInfoParamsSchema.safeParse({ notes: [1] }).success).toBe(true);
    expect(notesInfoParamsSchema.safeParse({ notes: hundredIds }).success).toBe(true);
    expect(notesInfoParamsSchema.safeParse({ notes: [...hundredIds, 101] }).success).toBe(false);
    expect(
      deleteNotesParamsSchema.safeParse({ notes: hundredIds, confirmDeletion: true }).success,
    ).toBe(true);
  });

  test("adds a minimal note and reports the default duplicate scope", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const port = scriptedPort(
      (action: string): unknown => (action === "modelFieldNames" ? ["Front"] : 7),
      invocations,
    );

    await expect(
      runAddNote(port, { deckName: "D", modelName: "M", fields: { Front: "Q" } }),
    ).resolves.toEqual({
      success: true,
      noteId: 7,
      deckName: "D",
      modelName: "M",
      message: 'Successfully created note in deck "D"',
      details: { fieldsAdded: 1, tagsAdded: 0, duplicateCheckScope: "default" },
    });
    expect(invocations[1]?.params).toEqual({
      note: { deckName: "D", modelName: "M", fields: { Front: "Q" } },
    });
  });

  test("forwards every duplicate option and disables duplicate checking", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const port = scriptedPort(
      (action: string): unknown => (action === "modelFieldNames" ? ["Front"] : 8),
      invocations,
    );

    const result = await runAddNote(port, {
      deckName: "D",
      modelName: "M",
      fields: { Front: "Q" },
      tags: [],
      allowDuplicate: true,
      duplicateScope: "collection",
      duplicateScopeOptions: {
        deckName: "Scope",
        checkChildren: false,
        checkAllModels: true,
      },
    });

    expect(result).toStrictEqual({
      success: true,
      noteId: 8,
      deckName: "D",
      modelName: "M",
      message: 'Successfully created note in deck "D"',
      details: { fieldsAdded: 1, tagsAdded: 0, duplicateCheckScope: "none" },
    });
    expect(invocations[1]?.params).toStrictEqual({
      note: {
        deckName: "D",
        modelName: "M",
        fields: { Front: "Q" },
        options: {
          allowDuplicate: true,
          duplicateScope: "collection",
          duplicateScopeOptions: {
            deckName: "Scope",
            checkChildren: false,
            checkAllModels: true,
          },
        },
      },
    });
  });
});

describe("note command boundaries", (): void => {
  test.each([undefined, []])(
    "rejects a missing model field catalog",
    async (fields): Promise<void> => {
      await expect(
        runAddNote(
          portFor((): unknown => fields),
          {
            deckName: "D",
            modelName: "Missing",
            fields: { Front: "Q" },
          },
        ),
      ).rejects.toMatchObject({
        name: "JsonError",
        message:
          fields === undefined
            ? expect.stringMatching(/^Invalid AnkiConnect result for modelFieldNames:/u)
            : 'Model "Missing" not found or has no fields',
        action: "addNote",
        details: { modelName: "Missing" },
        hint:
          fields === undefined
            ? "Model not found. Use models list to see available models."
            : "Use models list to see available models",
      });
    },
  );

  test.each([undefined, "", "   "])(
    "rejects an empty required sort field %#",
    async (value: string | undefined): Promise<void> => {
      await expect(
        runAddNote(
          portFor((): readonly string[] => ["Front"]),
          {
            deckName: "D",
            modelName: "M",
            fields: value === undefined ? { Back: "A" } : { Front: value },
          },
        ),
      ).rejects.toMatchObject({
        name: "JsonError",
        message:
          'The first field "Front" cannot be empty. Anki requires the sort field to have content.',
        action: "addNote",
        details: {
          modelName: "M",
          sortField: "Front",
          providedFields: value === undefined ? ["Back"] : ["Front"],
        },
        hint: 'The first field "Front" is the sort field and must contain non-empty content.',
      });
    },
  );

  test("classifies duplicate rejection differently when duplicates are allowed", async (): Promise<void> => {
    await expect(
      runAddNote(
        portFor((action: string): unknown => (action === "modelFieldNames" ? ["Front"] : null)),
        {
          deckName: "D",
          modelName: "M",
          fields: { Front: "Q" },
          allowDuplicate: true,
        },
      ),
    ).rejects.toMatchObject({
      action: "addNote",
      hint: "The note could not be created. Check if the model and deck names are correct.",
    });
  });

  test.each([
    ["network unavailable", "Make sure Anki is running"],
    [42, "Make sure Anki is running"],
  ])("normalizes an unclassified add error", async (failure, hint): Promise<void> => {
    await expect(
      runAddNote(
        portFor((action: string): unknown =>
          action === "modelFieldNames" ? ["Front"] : Promise.reject(failure),
        ),
        { deckName: "D", modelName: "M", fields: { Front: "Q" } },
      ),
    ).rejects.toMatchObject({ action: "addNote", hint: expect.stringContaining(hint) });
  });
});

describe("note command boundaries", (): void => {
  test("merges batch tags, options, created and duplicate outcomes", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const port = scriptedPort(
      (action: string, _params, invocation: number): unknown =>
        action === "modelFieldNames" ? ["Front"] : invocation === 1 ? 11 : null,
      invocations,
    );
    const result = await runAddNotes(port, {
      deckName: "D",
      modelName: "M",
      tags: ["shared", "same"],
      allowDuplicate: false,
      duplicateScope: "deck",
      notes: [{ fields: { Front: "A" }, tags: ["same", "local"] }, { fields: { Front: "B" } }],
    });

    expect(result).toEqual({
      created: 1,
      deckName: "D",
      failed: 0,
      modelName: "M",
      results: [
        { index: 0, noteId: 11, status: "created" },
        { index: 1, reason: "duplicate", status: "skipped" },
      ],
      skipped: 1,
      success: true,
      totalRequested: 2,
    });
    expect(invocations[1]?.params).toMatchObject({
      note: {
        tags: ["shared", "same", "local"],
        options: { allowDuplicate: false, duplicateScope: "deck" },
      },
    });
  });

  test("reports all batch failures and logs primitive errors", async (): Promise<void> => {
    const log = logger();
    const result = await runAddNotes(
      portFor((action: string): unknown =>
        action === "modelFieldNames" ? ["Front"] : Promise.reject("broken"),
      ),
      { deckName: "D", modelName: "M", notes: [{ fields: { Front: "A" } }] },
      log,
    );

    expect(result).toEqual({
      created: 0,
      deckName: "D",
      failed: 1,
      modelName: "M",
      results: [{ error: "broken", index: 0, status: "failed" }],
      skipped: 0,
      success: false,
      totalRequested: 1,
    });
    expect(log.warn).toHaveBeenCalledWith("Unable to add batch note 0: broken");
  });

  test.each(["duplicate", "cannot create note because it is a duplicate"])(
    "treats %s batch errors as skipped duplicates",
    async (message: string): Promise<void> => {
      const result = await runAddNotes(
        portFor((action: string): unknown =>
          action === "modelFieldNames" ? ["Front"] : new Error(message),
        ),
        { deckName: "D", modelName: "M", notes: [{ fields: { Front: "A" } }] },
      );
      expect(result).toEqual({
        created: 0,
        deckName: "D",
        failed: 0,
        modelName: "M",
        results: [{ index: 0, reason: "duplicate", status: "skipped" }],
        skipped: 1,
        success: true,
        totalRequested: 1,
      });
    },
  );

  test("preserves read-only batch failures", async (): Promise<void> => {
    await expect(
      runAddNotes(
        portFor((action: string): unknown =>
          action === "modelFieldNames" ? ["Front"] : new ReadOnlyModeError("addNote"),
        ),
        { deckName: "D", modelName: "M", notes: [{ fields: { Front: "A" } }] },
      ),
    ).rejects.toBeInstanceOf(ReadOnlyModeError);
  });

  test("rejects an absent batch model catalog", async (): Promise<void> => {
    await expect(
      runAddNotes(
        portFor((): unknown => []),
        {
          deckName: "D",
          modelName: "M",
          notes: [{ fields: { Front: "A" } }],
        },
      ),
    ).rejects.toThrow("not found or has no fields");
  });
});

describe("note command boundaries", (): void => {
  test("reports every empty batch sort field", async (): Promise<void> => {
    await expect(
      runAddNotes(
        portFor((): string[] => ["Front"]),
        {
          deckName: "D",
          modelName: "M",
          notes: [{ fields: {} }, { fields: { Front: "  " } }],
        },
      ),
    ).rejects.toMatchObject({
      action: "addNotes",
      details: { invalidNotes: [{ index: 0 }, { index: 1 }] },
    });
  });

  test("normalizes batch setup failures", async (): Promise<void> => {
    await expect(
      runAddNotes(
        portFor((): Promise<never> => Promise.reject("offline")),
        {
          deckName: "D",
          modelName: "M",
          notes: [{ fields: { Front: "A" } }],
        },
      ),
    ).rejects.toMatchObject({ action: "addNotes", message: "offline" });
  });

  test.each([[], null])("returns the empty find result for %j", async (ids): Promise<void> => {
    await expect(
      runFindNotes(
        portFor((): unknown => ids),
        { query: "deck:D" },
      ),
    ).resolves.toEqual({
      count: 0,
      hint: "Try a broader search query or check your deck/tag names",
      message: "No notes found matching the search criteria",
      noteIds: [],
      query: "deck:D",
      success: true,
    });
  });

  test.each([
    [[1], "Found 1 note matching"],
    [[1, 2], "Found 2 notes matching"],
    [Array.from({ length: 101 }, (_, index: number): number => index + 1), "Large result set"],
  ])("describes find result boundaries", async (ids, expected): Promise<void> => {
    const result = await runFindNotes(
      portFor((): number[] => ids as number[]),
      { query: "x" },
    );
    expect(`${result.message} ${result.hint}`).toContain(expected);
  });

  test.each([
    [new Error("bad query"), "Invalid query syntax"],
    ["offline", "Make sure Anki is running"],
  ])("classifies find errors", async (failure, hint): Promise<void> => {
    await expect(
      runFindNotes(
        portFor((): Promise<never> => Promise.reject(failure)),
        { query: "x" },
      ),
    ).rejects.toMatchObject({ action: "findNotes", hint: expect.stringContaining(hint) });
  });

  test("preserves JsonError instances from find", async (): Promise<void> => {
    const error = new JsonError("bad", { action: "custom" });
    await expect(
      runFindNotes(
        portFor((): Promise<never> => Promise.reject(error)),
        { query: "x" },
      ),
    ).rejects.toBe(error);
  });

  test("describes missing and complete note info results", async (): Promise<void> => {
    await expect(
      runNotesInfo(
        portFor((): unknown[] => []),
        { notes: [1] },
      ),
    ).rejects.toMatchObject({
      name: "JsonError",
      message: "No note information found",
      action: "notesInfo",
      details: { requestedNotes: [1] },
      hint: "The note IDs may be invalid or the notes may have been deleted",
    });
    await expect(
      runNotesInfo(
        portFor((): unknown[] => [
          { noteId: 1, modelName: "M", tags: [], fields: {}, cards: [], mod: 1 },
        ]),
        {
          notes: [1],
        },
      ),
    ).resolves.toEqual({
      count: 1,
      cssNote:
        "Each note model has its own CSS styling. Use models styling to get CSS for specific models.",
      hint: "Fields may contain HTML. Use notes update to modify content. Do not view notes in Anki browser while updating.",
      message: "Successfully retrieved information for 1 note(s)",
      models: ["M"],
      notes: [{ noteId: 1, modelName: "M", tags: [], fields: {}, cards: [], mod: 1 }],
      notFound: 0,
      requestedIds: [1],
      success: true,
    });
  });
});

describe("note command boundaries", (): void => {
  test.each([
    [new Error("note not found"), "One or more note IDs"],
    ["offline", "Make sure Anki is running"],
  ])("classifies note info errors", async (failure, hint): Promise<void> => {
    await expect(
      runNotesInfo(
        portFor((): Promise<never> => Promise.reject(failure)),
        { notes: [1] },
      ),
    ).rejects.toMatchObject({ action: "notesInfo", hint: expect.stringContaining(hint) });
  });

  test("requires deletion confirmation and handles all-missing notes", async (): Promise<void> => {
    await expect(
      runDeleteNotes(
        portFor((): never => undefined as never),
        { notes: [1], confirmDeletion: false },
      ),
    ).rejects.toMatchObject({
      name: "JsonError",
      message: "Deletion not confirmed",
      action: "deleteNotes",
      details: { requestedNotes: [1], noteCount: 1 },
      hint: "Set --yes to permanently delete these notes and all their cards",
    });
    await expect(
      runDeleteNotes(
        portFor((): unknown[] => [{}]),
        { notes: [1], confirmDeletion: true },
      ),
    ).resolves.toEqual({
      deletedCount: 0,
      hint: "The notes may have already been deleted or the IDs are invalid",
      message: "No notes were deleted (none of the provided IDs were valid)",
      notFoundCount: 1,
      requestedIds: [1],
      success: true,
    });
  });

  test("counts deleted notes with absent card lists", async (): Promise<void> => {
    const result = await runDeleteNotes(
      portFor((action: string): unknown => (action === "notesInfo" ? [{ noteId: 1 }] : null)),
      { notes: [1], confirmDeletion: true },
    );
    expect(result).toEqual({
      cardsDeleted: 0,
      deletedCount: 1,
      deletedNoteIds: [1],
      hint: "Consider syncing with AnkiWeb to propagate deletions to other devices",
      message: "Successfully deleted 1 note(s) and 0 card(s)",
      notFoundCount: 0,
      requestedIds: [1],
      success: true,
      warning: "These notes and cards have been permanently deleted",
    });
  });

  test.each([
    [new Error("permission denied"), "Permission denied"],
    ["offline", "Make sure Anki is running"],
  ])("classifies delete errors", async (failure, hint): Promise<void> => {
    await expect(
      runDeleteNotes(
        portFor((): Promise<never> => Promise.reject(failure)),
        {
          notes: [1],
          confirmDeletion: true,
        },
      ),
    ).rejects.toMatchObject({ action: "deleteNotes", hint: expect.stringContaining(hint) });
  });

  test("rejects empty updates before connecting", async (): Promise<void> => {
    await expect(
      runUpdateNoteFields(
        portFor((): never => undefined as never),
        { note: { id: 1, fields: {} } },
        {},
      ),
    ).rejects.toMatchObject({
      name: "JsonError",
      message: "No fields provided for update",
      action: "updateNoteFields",
      details: { noteId: 1 },
      hint: "Provide at least one field to update",
    });
  });
});

describe("note command boundaries", (): void => {
  test("forwards sanitized audio and picture attachments", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const port = scriptedPort(
      (action: string): unknown =>
        action === "notesInfo" ? [{ modelName: "M", fields: { Front: {} } }] : null,
      invocations,
    );
    const result = await runUpdateNoteFields(
      port,
      {
        note: {
          id: 1,
          fields: { Front: "Q" },
          audio: [{ url: "https://example.com/a.mp3", filename: "../a.mp3", fields: ["Front"] }],
          picture: [{ url: "https://example.com/p.png", filename: "../p.png", fields: ["Front"] }],
        },
      },
      { MEDIA_ALLOWED_HOSTS: "example.com" },
    );
    expect(result).toEqual({
      cssNote: "HTML content is preserved. Model CSS styling remains unchanged.",
      fieldCount: 1,
      hint: "Use notes info to verify the changes or notes find to locate other notes to update.",
      message: "Successfully updated 1 field in note",
      modelName: "M",
      noteId: 1,
      success: true,
      updatedFields: ["Front"],
      warning:
        "If changes don't appear, ensure the note wasn't open in Anki browser during update.",
    });
    expect(invocations.at(-1)?.params).toMatchObject({
      note: { audio: [{ filename: "a.mp3" }], picture: [{ filename: "p.png" }] },
    });
  });

  test("rejects a missing note update target", async (): Promise<void> => {
    await expect(
      runUpdateNoteFields(
        portFor((): unknown => []),
        { note: { id: 1, fields: { Front: "Q" } } },
        {},
      ),
    ).rejects.toMatchObject({
      name: "JsonError",
      message: "Note not found",
      action: "updateNoteFields",
      details: { noteId: 1 },
      hint: "The note ID is invalid or the note has been deleted. Use notes find to get valid note IDs.",
    });
  });

  test("rejects fields absent from the current model", async (): Promise<void> => {
    await expect(
      runUpdateNoteFields(
        portFor((): unknown[] => [{ modelName: "M", fields: {} }]),
        { note: { id: 1, fields: { Front: "Q" } } },
        {},
      ),
    ).rejects.toMatchObject({
      name: "JsonError",
      message: 'Invalid fields for model "M"',
      action: "updateNoteFields",
      details: {
        noteId: 1,
        modelName: "M",
        invalidFields: ["Front"],
        validFields: [],
      },
      hint: 'These fields don\'t exist in the "M" model. Use models fields to see valid fields.',
    });
  });

  test.each([
    [new Error("note not found upstream"), "Note not found"],
    [new Error("field rejected upstream"), "Check field names"],
    ["offline", "Make sure Anki is running"],
  ])("classifies update errors", async (failure, hint): Promise<void> => {
    await expect(
      runUpdateNoteFields(
        portFor((action: string): unknown =>
          action === "notesInfo"
            ? [{ modelName: "M", fields: { Front: {} } }]
            : Promise.reject(failure),
        ),
        { note: { id: 1, fields: { Front: "Q" } } },
        {},
      ),
    ).rejects.toMatchObject({ action: "updateNoteFields", hint: expect.stringContaining(hint) });
  });
});
