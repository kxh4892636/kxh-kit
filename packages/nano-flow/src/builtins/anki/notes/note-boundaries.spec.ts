import { describe, expect, test } from "vitest";
import { JsonError } from "../errors";
import { scriptedPort, type Invocation } from "../testing/test-harness";
import { addNoteParamsSchema } from "./add-note-command";
import { addNotesParamsSchema } from "./add-notes-command";
import { deleteNotesParamsSchema, runDeleteNotes } from "./delete-notes-command";
import { findNotesParamsSchema, runFindNotes } from "./find-notes-command";
import { notesInfoParamsSchema, runNotesInfo } from "./notes-info-command";
import { runUpdateNoteFields, updateNoteFieldsParamsSchema } from "./update-note-fields-command";
import { portFor } from "./note-command-testing";

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
});

describe("note command boundaries", (): void => {
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
