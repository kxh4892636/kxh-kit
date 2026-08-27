import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";
import { ids } from "./index";

const batch = async (text: string) =>
  invokeAnki(
    ["notes", "add-batch", "--deck", "D", "--model", "M", "--input", "-", "--dry-run"],
    (): undefined => undefined,
    { readText: async (): Promise<string> => text },
  );

describe("note option parsing boundaries", (): void => {
  test.each(["bad", "=value"])("rejects malformed field pair %j", async (field): Promise<void> => {
    const result = await invokeAnki([
      "notes",
      "add",
      "--deck",
      "D",
      "--model",
      "M",
      "--field",
      field,
      "--dry-run",
    ]);
    expect([result.code, result.invocations.length]).toEqual([2, 0]);
  });

  test.each(["0", "-1", "1.5", "not-a-number"])(
    "rejects invalid note identifier %j",
    async (id): Promise<void> => {
      expect((await invokeAnki(["notes", "info", "--note-id", id])).code).toBe(2);
    },
  );

  test("rejects more than one hundred note identifiers", async (): Promise<void> => {
    const ids = Array.from({ length: 101 }, (_, index: number): string => String(index + 1));
    expect((await invokeAnki(["notes", "info", "--note-id", ...ids])).code).toBe(2);
  });

  test("accepts exactly one hundred identifiers and rejects a mixed invalid list", (): void => {
    const values = Array.from({ length: 100 }, (_, index: number): string => String(index + 1));
    expect(ids(values, "--note-id")).toStrictEqual(
      Array.from({ length: 100 }, (_, index: number): number => index + 1),
    );
    expect(() => ids([...values, "101"], "--note-id")).toThrow(
      "--note-id requires one to one hundred positive integers",
    );
    expect(() => ids(["1", "not-a-number"], "--note-id")).toThrow(
      "--note-id requires one to one hundred positive integers",
    );
  });

  test("rejects an invalid duplicate scope", async (): Promise<void> => {
    const result = await invokeAnki([
      "notes",
      "add",
      "--deck",
      "D",
      "--model",
      "M",
      "--field",
      "Front=x",
      "--duplicate-scope",
      "invalid",
      "--dry-run",
    ]);
    expect(result.code).toBe(2);
  });

  test("previews all optional single-note duplicate controls", async (): Promise<void> => {
    const result = await invokeAnki([
      "notes",
      "add",
      "--deck",
      "D",
      "--model",
      "M",
      "--field",
      "Front=x",
      "--tag",
      "one",
      "--allow-duplicate",
      "--duplicate-scope",
      "collection",
      "--dup-scope-deck",
      "Scope",
      "--dup-check-children",
      "--dup-check-all-models",
      "--dry-run",
    ]);
    expect(JSON.parse(result.stdout).preview.actions[0].params.note).toStrictEqual({
      deckName: "D",
      modelName: "M",
      fields: { Front: "x" },
      tags: ["one"],
      allowDuplicate: true,
      duplicateScope: "collection",
      duplicateScopeOptions: {
        deckName: "Scope",
        checkChildren: true,
        checkAllModels: true,
      },
    });
  });
});

describe("note option parsing boundaries", (): void => {
  test.each([
    [[], {}],
    [["--duplicate-scope", "deck"], { duplicateScope: "deck" }],
    [
      ["--dup-scope-deck", "Scope"],
      {
        duplicateScopeOptions: {
          deckName: "Scope",
          checkChildren: false,
          checkAllModels: false,
        },
      },
    ],
    [
      ["--dup-check-children"],
      { duplicateScopeOptions: { checkChildren: true, checkAllModels: false } },
    ],
    [
      ["--dup-check-all-models"],
      { duplicateScopeOptions: { checkChildren: false, checkAllModels: true } },
    ],
  ] as const)("previews isolated duplicate controls %j", async (args, optional) => {
    const result = await invokeAnki([
      "notes",
      "add",
      "--deck",
      "D",
      "--model",
      "M",
      "--field",
      "Front=x",
      ...args,
      "--dry-run",
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).preview.actions[0].params.note).toStrictEqual({
      deckName: "D",
      modelName: "M",
      fields: { Front: "x" },
      ...optional,
    });
  });

  test.each([
    "null",
    "{}",
    '{"url":1,"filename":"a.mp3","fields":["Front"]}',
    '{"url":"https://example.com/a","filename":1,"fields":["Front"]}',
    '{"url":"https://example.com/a","filename":"a.mp3","fields":"Front"}',
    '{"url":"https://example.com/a","filename":"a.mp3","fields":[1]}',
    '{"url":"","filename":"a.mp3","fields":["Front"]}',
    '{"url":"https://example.com/a","filename":"","fields":["Front"]}',
    '{"url":"https://example.com/a","filename":"a.mp3","fields":[]}',
    "not-json",
  ])("rejects malformed attachment %s", async (attachment): Promise<void> => {
    const result = await invokeAnki([
      "notes",
      "update",
      "--id",
      "1",
      "--field",
      "Front=x",
      "--audio",
      attachment,
      "--dry-run",
    ]);
    expect([result.code, result.invocations.length]).toEqual([2, 0]);
  });

  test("previews sanitized valid audio and picture attachments", async (): Promise<void> => {
    const result = await invokeAnki(
      [
        "notes",
        "update",
        "--id",
        "1",
        "--field",
        "Front=x",
        "--audio",
        '{"url":"https://example.com/a.mp3","filename":"../a.mp3","fields":["Front"]}',
        "--picture",
        '{"url":"https://example.com/p.png","filename":"../p.png","fields":["Front"]}',
        "--dry-run",
      ],
      (): undefined => undefined,
      { env: { MEDIA_ALLOWED_HOSTS: "example.com" } },
    );
    expect(JSON.parse(result.stdout).preview.actions[0].params.note).toStrictEqual({
      id: 1,
      fields: { Front: "x" },
      audio: [{ url: "https://example.com/a.mp3", filename: "a.mp3", fields: ["Front"] }],
      picture: [{ url: "https://example.com/p.png", filename: "p.png", fields: ["Front"] }],
    });
  });

  test.each([
    ["invalid JSON", "{"],
    ["object", "{}"],
    ["empty array", "[]"],
    ["null note", "[null]"],
    ["missing fields", "[{}]"],
    ["string fields", '[{"fields":"x"}]'],
    ["array fields", '[{"fields":[]} ]'],
    ["non-string field", '[{"fields":{"Front":1}}]'],
    ["string tags", '[{"fields":{"Front":"x"},"tags":"x"}]'],
    ["non-string tag", '[{"fields":{"Front":"x"},"tags":[1]}]'],
  ])("rejects malformed batch input: %s", async (_name, text): Promise<void> => {
    const result = await batch(text);
    expect([result.code, result.invocations.length]).toEqual([1, 0]);
  });

  test("rejects a batch over one hundred entries", async (): Promise<void> => {
    const text = JSON.stringify(
      Array.from({ length: 101 }, (): { fields: { Front: string } } => ({
        fields: { Front: "x" },
      })),
    );
    expect((await batch(text)).code).toBe(1);
  });
});

describe("note option parsing boundaries", (): void => {
  test("previews shared batch tags and duplicate controls", async (): Promise<void> => {
    const result = await invokeAnki(
      [
        "notes",
        "add-batch",
        "--deck",
        "D",
        "--model",
        "M",
        "--input",
        "-",
        "--tag",
        "shared",
        "--allow-duplicate",
        "--duplicate-scope",
        "deck",
        "--dry-run",
      ],
      (): undefined => undefined,
      { readText: async (): Promise<string> => '[{"fields":{"Front":"x"},"tags":["local"]}]' },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).preview.actions[0].params).toStrictEqual({
      source: "-",
      total: 1,
    });
  });

  test("commits shared batch tags and duplicate controls exactly", async (): Promise<void> => {
    const result = await invokeAnki(
      [
        "notes",
        "add-batch",
        "--deck",
        "D",
        "--model",
        "M",
        "--input",
        "-",
        "--tag",
        "shared",
        "--allow-duplicate",
        "--duplicate-scope",
        "deck",
      ],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front"] : 9),
      { readText: async (): Promise<string> => '  [{"fields":{"Front":"x"},"tags":["local"]}]  ' },
    );
    expect(result.code).toBe(0);
    expect(result.invocations).toStrictEqual([
      { action: "modelFieldNames", params: { modelName: "M" } },
      {
        action: "addNote",
        params: {
          note: {
            deckName: "D",
            modelName: "M",
            fields: { Front: "x" },
            tags: ["shared", "local"],
            options: { allowDuplicate: true, duplicateScope: "deck" },
          },
        },
      },
    ]);
    expect(JSON.parse(result.stdout)).toStrictEqual({
      success: true,
      deckName: "D",
      modelName: "M",
      totalRequested: 1,
      created: 1,
      skipped: 0,
      failed: 0,
      results: [{ index: 0, status: "created", noteId: 9 }],
    });
  });
});
