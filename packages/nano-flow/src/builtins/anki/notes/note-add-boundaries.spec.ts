import { describe, expect, test } from "vitest";
import { ReadOnlyModeError } from "../errors";
import { scriptedPort, type Invocation } from "../testing/test-harness";
import { runAddNote } from "./add-note-command";
import { runAddNotes } from "./add-notes-command";
import { logger, portFor } from "./note-command-testing";

describe("note command boundaries", (): void => {
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
});
