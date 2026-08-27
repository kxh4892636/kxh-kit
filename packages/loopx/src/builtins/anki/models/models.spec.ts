import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";
import { type JsonValue } from "../../../cli/types";
import { type Logger } from "../logger";
import { type AnkiPort } from "../port";
import { createModelParamsSchema } from "./create-command";
import { addModelFieldParamsSchema, runAddModelField } from "./field-add-command";
import { removeModelFieldParamsSchema, runRemoveModelField } from "./field-remove-command";
import { renameModelFieldParamsSchema, runRenameModelField } from "./field-rename-command";
import {
  repositionModelFieldParamsSchema,
  runRepositionModelField,
} from "./field-reposition-command";
import { runUpdateModelStyling, updateModelStylingParamsSchema } from "./update-styling-command";
import { updateModelTemplatesParamsSchema } from "./update-templates-command";

const createTemplate = '[{"Name":"Card 1","Front":"{{Front}}","Back":"{{Back}}"}]';
const updateTemplate = '{"Card 1":{"Front":"{{Front}}","Back":"{{Back}}"}}';

describe("loopx anki models", (): void => {
  test.each([
    ["models", "--help"],
    ["models", "list", "--help"],
    ["models", "fields", "--help"],
    ["models", "styling", "--help"],
    ["models", "templates", "--help"],
    ["models", "create", "--help"],
    ["models", "update-styling", "--help"],
    ["models", "update-templates", "--help"],
    ["models", "field-add", "--help"],
    ["models", "field-remove", "--help"],
    ["models", "field-rename", "--help"],
    ["models", "field-reposition", "--help"],
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
  });

  test("marks mandatory named options in leaf help", async (): Promise<void> => {
    const result = await invokeAnki(["models", "field-rename", "--help"]);
    expect(result.stdout).toContain("Note type name (required)");
    expect(result.stdout).toContain("Current field name (required)");
    expect(result.stdout).toContain("New field name (required)");
  });

  test("runs all model queries with --name", async (): Promise<void> => {
    const listed = await invokeAnki(["models", "list"], (): string[] => ["Basic", "Cloze"]);
    expect(JSON.parse(listed.stdout)).toMatchObject({ total: 2, commonTypes: { basic: "Basic" } });

    const fieldNames = await invokeAnki(["models", "fields", "--name", "Basic"], (): string[] => [
      "Front",
      "Back",
    ]);
    expect(JSON.parse(fieldNames.stdout)).toMatchObject({
      modelName: "Basic",
      fieldNames: ["Front", "Back"],
      total: 2,
    });

    const styling = await invokeAnki(
      ["models", "styling", "--name", "Basic"],
      (): { css: string } => ({ css: ".card{}.front{}" }),
    );
    expect(JSON.parse(styling.stdout)).toMatchObject({
      modelName: "Basic",
      cssInfo: { hasCardStyling: true, hasFrontStyling: true },
    });

    const templateResult = await invokeAnki(
      ["models", "templates", "--name", "Basic"],
      (): unknown => ({ "Card 1": { Front: "{{Front}}", Back: "{{Back}}" } }),
    );
    expect(JSON.parse(templateResult.stdout)).toMatchObject({
      modelName: "Basic",
      templates: { "Card 1": { Front: "{{Front}}" } },
    });
  });

  test("creates and updates model styling and templates", async (): Promise<void> => {
    const created = await invokeAnki(
      [
        "models",
        "create",
        "--name",
        "Custom",
        "--field",
        "Front",
        "Back",
        "--templates",
        createTemplate,
        "--css",
        "style.css",
      ],
      (): { id: number } => ({ id: 42 }),
      { readText: async (): Promise<string> => ".card{}" },
    );
    expect(JSON.parse(created.stdout)).toMatchObject({
      modelId: 42,
      fields: ["Front", "Back"],
      templateCount: 1,
      hasCss: true,
    });
    expect(created.invocations).toEqual([
      {
        action: "createModel",
        params: {
          modelName: "Custom",
          inOrderFields: ["Front", "Back"],
          cardTemplates: [{ Name: "Card 1", Front: "{{Front}}", Back: "{{Back}}" }],
          css: ".card{}",
          isCloze: false,
        },
      },
    ]);

    const styling = await invokeAnki(
      ["models", "update-styling", "--name", "Custom", "--css", "-"],
      (action: string): unknown => (action === "modelStyling" ? { css: "old" } : null),
      { readText: async (): Promise<string> => ".card{color:red}" },
    );
    expect(JSON.parse(styling.stdout)).toMatchObject({ oldCssLength: 3, cssLengthChange: 13 });
    expect(styling.invocations.at(-1)).toEqual({
      action: "updateModelStyling",
      params: { model: { name: "Custom", css: ".card{color:red}" } },
    });

    const updatedTemplates = await invokeAnki(
      ["models", "update-templates", "--name", "Custom", "--templates", updateTemplate],
      (action: string): unknown =>
        action === "modelTemplates" ? { "Card 1": { Front: "old", Back: "old" } } : null,
    );
    expect(JSON.parse(updatedTemplates.stdout)).toMatchObject({ templateCount: 1 });
    expect(updatedTemplates.invocations.at(-1)?.action).toBe("updateModelTemplates");
  });
});

describe("loopx anki models", (): void => {
  test("adds, removes, renames, and repositions model fields", async (): Promise<void> => {
    const added = await invokeAnki(
      ["models", "field-add", "--name", "Custom", "--field", "Extra", "--index", "1"],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front", "Back"] : null),
    );
    expect(JSON.parse(added.stdout)).toMatchObject({ fieldName: "Extra", index: 1 });
    expect(added.invocations.at(-1)).toEqual({
      action: "modelFieldAdd",
      params: { modelName: "Custom", fieldName: "Extra", index: 1 },
    });

    const removed = await invokeAnki(
      ["models", "field-remove", "--name", "Custom", "--field", "Extra", "--yes"],
      (): null => null,
    );
    expect(JSON.parse(removed.stdout)).toMatchObject({ fieldName: "Extra", success: true });

    const renamed = await invokeAnki(
      ["models", "field-rename", "--name", "Custom", "--old-name", "Front", "--new-name", "Prompt"],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front", "Back"] : null),
    );
    expect(JSON.parse(renamed.stdout)).toMatchObject({
      oldFieldName: "Front",
      newFieldName: "Prompt",
    });

    const repositioned = await invokeAnki(
      ["models", "field-reposition", "--name", "Custom", "--field", "Back", "--index", "0"],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front", "Back"] : null),
    );
    expect(JSON.parse(repositioned.stdout)).toMatchObject({ fieldName: "Back", newIndex: 0 });
  });

  test("requires confirmation and rejects every former positional model input", async (): Promise<void> => {
    expect((await invokeAnki(["models", "field-remove", "--name", "M", "--field", "F"])).code).toBe(
      2,
    );
    const oldForms = [
      ["models", "fields", "Basic"],
      ["models", "styling", "Basic"],
      ["models", "templates", "Basic"],
      ["models", "create", "Custom", "--field", "Front", "--templates", createTemplate],
      ["models", "update-styling", "Basic", "--css", "-"],
      ["models", "update-templates", "Basic", "--templates", updateTemplate],
      ["models", "field-add", "Basic", "Extra"],
      ["models", "field-remove", "Basic", "Extra", "--yes"],
      ["models", "field-rename", "Basic", "Front", "Prompt"],
      ["models", "field-reposition", "Basic", "Back", "0"],
    ];
    for (const argv of oldForms) expect((await invokeAnki(argv)).code).toBe(2);
  });

  test("previews all model writes with zero Anki calls", async (): Promise<void> => {
    const cases: Array<{ action: string; argv: string[] }> = [
      {
        action: "createModel",
        argv: [
          "models",
          "create",
          "--name",
          "M",
          "--field",
          "Front",
          "--templates",
          '[{"Name":"C","Front":"{{Front}}","Back":"x"}]',
        ],
      },
      {
        action: "updateModelStyling",
        argv: ["models", "update-styling", "--name", "M", "--css", "-"],
      },
      {
        action: "updateModelTemplates",
        argv: ["models", "update-templates", "--name", "M", "--templates", updateTemplate],
      },
      { action: "modelFieldAdd", argv: ["models", "field-add", "--name", "M", "--field", "F"] },
      {
        action: "modelFieldRemove",
        argv: ["models", "field-remove", "--name", "M", "--field", "F", "--yes"],
      },
      {
        action: "modelFieldRename",
        argv: ["models", "field-rename", "--name", "M", "--old-name", "F", "--new-name", "G"],
      },
      {
        action: "modelFieldReposition",
        argv: ["models", "field-reposition", "--name", "M", "--field", "F", "--index", "0"],
      },
    ];
    for (const item of cases) {
      const result = await invokeAnki([...item.argv, "--dry-run"], (): undefined => undefined, {
        readText: async (): Promise<string> => ".card{}",
      });
      expect([result.code, result.invocations.length]).toEqual([0, 0]);
      expect(JSON.parse(result.stdout)).toMatchObject({
        dryRun: true,
        preview: { actions: [{ action: item.action }] },
      });
    }
  });
});

describe("loopx anki models", (): void => {
  test("rejects empty model mutations before dry-run output", async (): Promise<void> => {
    const cases = [
      [
        "models",
        "create",
        "--name=",
        "--field",
        "Front",
        "--templates",
        createTemplate,
        "--dry-run",
      ],
      ["models", "create", "--name", "M", "--field=", "--templates", createTemplate, "--dry-run"],
      [
        "models",
        "create",
        "--name",
        "M",
        "--field",
        "Front",
        "--templates",
        '[{"Name":"","Front":"x","Back":"y"}]',
        "--dry-run",
      ],
    ];
    for (const argv of cases) {
      const result = await invokeAnki(argv);
      expect([result.code, result.invocations.length, result.stdout]).toEqual([2, 0, ""]);
    }
  });

  test("preserves model conflict, bounds, and template-name diagnostics", async (): Promise<void> => {
    const duplicateCreate = await invokeAnki(
      ["models", "create", "--name", "M", "--field", "Front", "--templates", createTemplate],
      (): Error => new Error("model already exists"),
    );
    expect(JSON.parse(duplicateCreate.stderr).hint).toContain("already exists");

    const collision = await invokeAnki(
      ["models", "field-add", "--name", "M", "--field", "front"],
      (): string[] => ["Front"],
    );
    expect(JSON.parse(collision.stderr).hint).toContain("differs from existing field");

    const outOfRange = await invokeAnki(
      ["models", "field-add", "--name", "M", "--field", "Extra", "--index", "3"],
      (): string[] => ["Front"],
    );
    expect(outOfRange.stderr).toContain("out of range");

    const caseSensitive = await invokeAnki(
      [
        "models",
        "update-templates",
        "--name",
        "M",
        "--templates",
        '{"card 1":{"Front":"x","Back":"y"}}',
      ],
      (): unknown => ({ "Card 1": { Front: "x", Back: "y" } }),
    );
    expect(JSON.parse(caseSensitive.stderr).hint).toContain("case-sensitive");
  });

  test("rejects malformed model results at the adapter boundary", async (): Promise<void> => {
    const result = await invokeAnki(["models", "list"], (): { bad: boolean } => ({ bad: true }));
    expect(JSON.parse(result.stderr)).toMatchObject({ action: "modelNames" });
    expect(result.stderr).toContain("Invalid AnkiConnect result");
  });

  test("preserves null sentinels for model-not-found diagnostics", async (): Promise<void> => {
    const result = await invokeAnki(["models", "fields", "--name", "Missing"], (): null => null);
    expect(JSON.parse(result.stderr)).toMatchObject({ action: "modelFieldNames" });
    expect(JSON.parse(result.stderr).hint).toContain("models list");
  });
});

const createBoundaryTemplate = (front: string = "{{Front}}", back: string = "{{Back}}"): string =>
  JSON.stringify([{ Name: "Card 1", Front: front, Back: back }]);

const directPort = (
  handler: (action: string, params?: Readonly<Record<string, JsonValue>>) => unknown,
): AnkiPort => ({
  invoke: async <Result>(
    action: string,
    params?: Readonly<Record<string, JsonValue>>,
  ): Promise<Result> => {
    const result = handler(action, params);
    if (result instanceof Error) {
      throw result;
    }
    return result as Result;
  },
});

describe("model query boundaries", (): void => {
  test("distinguishes empty and common note type catalogs", async (): Promise<void> => {
    const empty = await invokeAnki(["models", "list"], (): readonly string[] => []);
    expect(JSON.parse(empty.stdout)).toMatchObject({
      message: "No note types found in Anki",
      modelNames: [],
      total: 0,
      commonTypes: { basic: null, basicReversed: null, cloze: null },
    });

    const basic = await invokeAnki(["models", "list"], (): readonly string[] => ["Basic"]);
    expect(JSON.parse(basic.stdout)).toMatchObject({
      total: 1,
      commonTypes: { basic: "Basic", basicReversed: null, cloze: null },
    });

    const reversed = await invokeAnki(["models", "list"], (): readonly string[] => [
      "Basic (and reversed card)",
      "Cloze",
    ]);
    expect(JSON.parse(reversed.stdout).commonTypes).toEqual({
      basic: null,
      basicReversed: "Basic (and reversed card)",
      cloze: "Cloze",
    });
  });

  test.each([
    ["Basic", ["Front"], true],
    ["Basic and Reversed", ["Front", "Back"], true],
    ["Cloze", ["Text"], true],
    ["Custom", ["Only"], false],
  ])(
    "classifies %s fields",
    async (name: string, fields: readonly string[], hasExample: boolean): Promise<void> => {
      const result = await invokeAnki(
        ["models", "fields", "--name", name],
        (): readonly string[] => fields,
      );
      const output = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        total: fields.length,
        message: `Model "${name}" has ${fields.length} field${fields.length === 1 ? "" : "s"}`,
      });
      expect(output.example !== undefined).toBe(hasExample);
    },
  );

  test("rejects empty fields, styling, and templates", async (): Promise<void> => {
    expect(
      JSON.parse(
        (await invokeAnki(["models", "fields", "--name", "Empty"], (): never[] => [])).stdout,
      ).message,
    ).toContain("has no fields");
    for (const [styling, message] of [
      [null, "not found or has no styling"],
      [{}, "Invalid AnkiConnect result"],
      [{ css: "" }, "not found or has no styling"],
    ] as const) {
      const result = await invokeAnki(
        ["models", "styling", "--name", "Empty"],
        (): unknown => styling,
      );
      expect(JSON.parse(result.stderr).error).toContain(message);
    }
    for (const templates of [null, {}]) {
      const result = await invokeAnki(
        ["models", "templates", "--name", "Empty"],
        (): unknown => templates,
      );
      expect(JSON.parse(result.stderr).error).toContain("not found or has no card templates");
    }
  });

  test("reports sparse styling flags", async (): Promise<void> => {
    const result = await invokeAnki(
      ["models", "styling", "--name", "Plain"],
      (): { css: string } => ({ css: "body { color: red; }" }),
    );
    expect(JSON.parse(result.stdout).cssInfo).toEqual({
      length: 20,
      hasCardStyling: false,
      hasFrontStyling: false,
      hasBackStyling: false,
      hasClozeStyling: false,
    });
  });
});

describe("model mutation boundaries", (): void => {
  test("enforces direct create-model schema boundaries", (): void => {
    const valid = {
      modelName: "M",
      inOrderFields: ["Front"],
      cardTemplates: [{ Name: "Card", Front: "{{Front}}", Back: "answer" }],
    };
    expect(createModelParamsSchema.safeParse(valid).success).toBe(true);
    for (const value of [
      { ...valid, modelName: "" },
      { ...valid, inOrderFields: [] },
      { ...valid, inOrderFields: [""] },
      { ...valid, cardTemplates: [] },
      { ...valid, cardTemplates: [{ Name: "", Front: "x", Back: "y" }] },
      { ...valid, cardTemplates: [{ Name: "Card", Front: "", Back: "y" }] },
      { ...valid, cardTemplates: [{ Name: "Card", Front: "x", Back: "" }] },
      { ...valid, css: 1 },
      { ...valid, isCloze: "yes" },
    ]) {
      expect(createModelParamsSchema.safeParse(value).success).toBe(false);
    }
  });

  test("enforces direct update schema boundaries", (): void => {
    expect(
      updateModelStylingParamsSchema.safeParse({ modelName: "M", css: ".card{}" }).success,
    ).toBe(true);
    expect(
      updateModelStylingParamsSchema.safeParse({ modelName: "", css: ".card{}" }).success,
    ).toBe(false);
    expect(updateModelStylingParamsSchema.safeParse({ modelName: "M", css: "" }).success).toBe(
      false,
    );

    const validTemplates = { modelName: "M", templates: { Card: { Front: "x", Back: "y" } } };
    expect(updateModelTemplatesParamsSchema.safeParse(validTemplates).success).toBe(true);
    for (const value of [
      { ...validTemplates, modelName: "" },
      { ...validTemplates, templates: {} },
      { ...validTemplates, templates: { Card: { Front: "", Back: "y" } } },
      { ...validTemplates, templates: { Card: { Front: "x", Back: "" } } },
    ]) {
      expect(updateModelTemplatesParamsSchema.safeParse(value).success).toBe(false);
    }
  });

  test("reports every styling flag when the existing CSS lookup fails", async (): Promise<void> => {
    const css = "direction:rtl;.card{}.front{}.back{}.cloze{}";
    const warnings: string[] = [];
    const logger = {
      debug: (): void => undefined,
      info: (): void => undefined,
      warn: (message: string): void => void warnings.push(message),
    } satisfies Logger;
    const result = await runUpdateModelStyling(
      directPort((action: string): unknown =>
        action === "modelStyling" ? new Error("read failed") : null,
      ),
      { modelName: "M", css },
      logger,
    );
    expect(result).toStrictEqual({
      success: true,
      modelName: "M",
      cssLength: css.length,
      cssInfo: {
        hasRtlSupport: true,
        hasCardStyling: true,
        hasFrontStyling: true,
        hasBackStyling: true,
        hasClozeStyling: true,
      },
      message: 'Successfully updated CSS styling for model "M"',
    });
    expect(warnings).toStrictEqual(["Unable to read existing styling before update: read failed"]);
  });

  test("reports old CSS lengths and spaced RTL syntax exactly", async (): Promise<void> => {
    const css = "direction: rtl";
    const result = await runUpdateModelStyling(
      directPort((action: string): unknown => (action === "modelStyling" ? { css: "old" } : null)),
      { modelName: "M", css },
    );
    expect(result).toStrictEqual({
      success: true,
      modelName: "M",
      cssLength: css.length,
      cssInfo: {
        hasRtlSupport: true,
        hasCardStyling: false,
        hasFrontStyling: false,
        hasBackStyling: false,
        hasClozeStyling: false,
      },
      message: 'Successfully updated CSS styling for model "M"',
      oldCssLength: 3,
      cssLengthChange: css.length - 3,
    });
  });

  test.each([
    ["not found", "Model not found. Use models list to see available models."],
    ["does not exist", "Model not found. Use models list to see available models."],
    ["offline", "Make sure Anki is running and the model name is correct."],
  ])("classifies styling update failure %j", async (message, hint): Promise<void> => {
    await expect(
      runUpdateModelStyling(
        directPort((action: string): unknown =>
          action === "modelStyling" ? { css: "old" } : new Error(message),
        ),
        { modelName: "M", css: ".card{}" },
      ),
    ).rejects.toMatchObject({
      message,
      action: "updateModelStyling",
      details: { modelName: "M" },
      hint,
    });
  });
});

describe("model mutation boundaries", (): void => {
  test("keeps every field mutation parameter schema mandatory", (): void => {
    for (const schema of [
      addModelFieldParamsSchema,
      removeModelFieldParamsSchema,
      renameModelFieldParamsSchema,
      repositionModelFieldParamsSchema,
    ]) {
      expect(schema.safeParse({}).success).toBe(false);
    }
  });

  test("defensively requires confirmation inside the field removal operation", async (): Promise<void> => {
    await expect(
      runRemoveModelField(
        directPort((): never => expect.unreachable()),
        {
          modelName: "M",
          fieldName: "Front",
          confirmDeletion: false,
        },
      ),
    ).rejects.toMatchObject({
      name: "JsonError",
      message: "Deletion not confirmed",
      action: "removeModelField",
      details: { modelName: "M", fieldName: "Front" },
      hint: "Set --yes to confirm you want to permanently delete this field and all its data.",
    });
  });

  test("enforces direct field-add index boundaries and preserves zero", async (): Promise<void> => {
    const invocationParams: Array<Readonly<Record<string, JsonValue>> | undefined> = [];
    const port = directPort((action, params): unknown => {
      invocationParams.push(params);
      return action === "modelFieldNames" ? ["Front"] : null;
    });

    await expect(
      runAddModelField(port, { modelName: "M", fieldName: "Extra", index: -1 }),
    ).rejects.toMatchObject({
      message:
        'Index -1 is out of range for model "M". Valid range is 0-1 (1 appends at the end). AnkiConnect would silently clamp the index instead of erroring.',
      details: { modelName: "M", fieldName: "Extra", index: -1 },
    });
    await expect(
      runAddModelField(port, { modelName: "M", fieldName: "Extra", index: 2 }),
    ).rejects.toMatchObject({
      message:
        'Index 2 is out of range for model "M". Valid range is 0-1 (1 appends at the end). AnkiConnect would silently clamp the index instead of erroring.',
      details: { modelName: "M", fieldName: "Extra", index: 2 },
    });

    await expect(
      runAddModelField(port, { modelName: "M", fieldName: "Extra", index: 0 }),
    ).resolves.toStrictEqual({
      success: true,
      modelName: "M",
      fieldName: "Extra",
      index: 0,
      message: 'Successfully added field "Extra" to model "M" at position 0',
    });
    await expect(
      runAddModelField(port, { modelName: "M", fieldName: "Extra", index: 1 }),
    ).resolves.toMatchObject({ index: 1 });
    expect(invocationParams.at(-2)).toStrictEqual({ modelName: "M" });
    expect(invocationParams.at(-1)).toStrictEqual({ modelName: "M", fieldName: "Extra", index: 1 });
  });

  test("rejects a rename target that is another field's case variant", async (): Promise<void> => {
    await expect(
      runRenameModelField(
        directPort((): readonly string[] => ["Front", "prompt"]),
        {
          modelName: "M",
          oldFieldName: "Front",
          newFieldName: "Prompt",
        },
      ),
    ).rejects.toMatchObject({
      message:
        'Field "Prompt" collides with existing field "prompt" in model "M" (names differ only in case)',
      action: "renameModelField",
      details: { modelName: "M", oldFieldName: "Front", newFieldName: "Prompt" },
      hint: 'Field names are case-sensitive, but "Prompt" differs from existing field "prompt" only in case. Pick a distinct name.',
    });
  });
});

describe("model mutation boundaries", (): void => {
  test.each([
    [
      "field add",
      (): Promise<unknown> =>
        runAddModelField(
          directPort((action): unknown => (action === "modelFieldNames" ? ["Front"] : {})),
          { modelName: "M", fieldName: "Extra" },
        ),
      "modelFieldAdd",
    ],
    [
      "field remove",
      (): Promise<unknown> =>
        runRemoveModelField(
          directPort((): Record<string, never> => ({})),
          {
            modelName: "M",
            fieldName: "Front",
            confirmDeletion: true,
          },
        ),
      "modelFieldRemove",
    ],
    [
      "field rename",
      (): Promise<unknown> =>
        runRenameModelField(
          directPort((action): unknown => (action === "modelFieldNames" ? ["Front"] : {})),
          { modelName: "M", oldFieldName: "Front", newFieldName: "Prompt" },
        ),
      "modelFieldRename",
    ],
    [
      "field reposition",
      (): Promise<unknown> =>
        runRepositionModelField(
          directPort((action): unknown => (action === "modelFieldNames" ? ["Front"] : {})),
          { modelName: "M", fieldName: "Front", index: 0 },
        ),
      "modelFieldReposition",
    ],
  ])("names malformed %s responses exactly", async (_name, operation, responseAction) => {
    await expect(operation()).rejects.toThrow(
      new RegExp(`^Invalid AnkiConnect result for ${responseAction}:`, "u"),
    );
  });

  test.each([
    ["field-add", ["--name", "M", "--field", "F", "--index", "-1"]],
    ["field-add", ["--name", "M", "--field", "F", "--index", "1.5"]],
    ["field-reposition", ["--name", "M", "--field", "F", "--index", "NaN"]],
  ])("rejects invalid numeric options for %s", async (command, args): Promise<void> => {
    const result = await invokeAnki(["models", command, ...args]);
    expect([result.code, result.invocations.length]).toEqual([2, 0]);
  });

  test.each([
    "null",
    "{}",
    "[]",
    "[null]",
    '[{"Name":"","Front":"x","Back":"y"}]',
    '[{"Name":"Card","Front":"","Back":"y"}]',
    '[{"Name":"Card","Front":"x","Back":""}]',
  ])("rejects malformed create templates %s", async (value: string): Promise<void> => {
    const result = await invokeAnki([
      "models",
      "create",
      "--name",
      "M",
      "--field",
      "Front",
      "--templates",
      value,
    ]);
    expect([result.code, result.invocations.length]).toEqual([2, 0]);
  });

  test.each([
    "null",
    "[]",
    "{}",
    '{"Card":null}',
    '{"Card":{"Front":1,"Back":"y"}}',
    '{"Card":{"Front":"x","Back":""}}',
  ])("rejects malformed update templates %s", async (value: string): Promise<void> => {
    const result = await invokeAnki([
      "models",
      "update-templates",
      "--name",
      "M",
      "--templates",
      value,
    ]);
    expect([result.code, result.invocations.length]).toEqual([2, 0]);
  });

  test("creates cloze models with special fields and reports missing field references", async (): Promise<void> => {
    const result = await invokeAnki(
      [
        "models",
        "create",
        "--name",
        "Cloze Custom",
        "--field",
        "Text",
        "--templates",
        createBoundaryTemplate("{{cloze:Text}} {{FrontSide}} {{Missing}}", "{{Text}}"),
        "--cloze",
      ],
      (): Record<string, never> => ({}),
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      modelId: null,
      isCloze: true,
      templateCount: 1,
      warnings: ['Template "Card 1" references field "{{Missing}}" which is not in inOrderFields'],
    });
  });
});

describe("model mutation boundaries", (): void => {
  test("creates a model without warnings or optional CSS", async (): Promise<void> => {
    const result = await invokeAnki(
      [
        "models",
        "create",
        "--name",
        "Basic Custom",
        "--field",
        "Front",
        "Back",
        "--templates",
        createBoundaryTemplate(),
      ],
      (): { id: number } => ({ id: 7 }),
    );
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      modelId: 7,
      isCloze: false,
      hasCss: false,
    });
    expect(output.warnings).toBeUndefined();
  });

  test.each(["duplicate model", "already exists"])(
    "classifies create conflict: %s",
    async (message: string): Promise<void> => {
      const result = await invokeAnki(
        [
          "models",
          "create",
          "--name",
          "M",
          "--field",
          "Front",
          "--templates",
          createBoundaryTemplate(),
        ],
        (): Error => new Error(message),
      );
      expect(JSON.parse(result.stderr).hint).toContain("different name");
    },
  );

  test("validates field-add catalogs, exact collisions, and omitted indexes", async (): Promise<void> => {
    for (const fields of [null, []]) {
      const missing = await invokeAnki(
        ["models", "field-add", "--name", "Missing", "--field", "Extra"],
        (): unknown => fields,
      );
      expect(JSON.parse(missing.stderr).error).toContain("has no fields or does not exist");
    }

    const exact = await invokeAnki(
      ["models", "field-add", "--name", "M", "--field", "Front"],
      (): readonly string[] => ["Front"],
    );
    expect(JSON.parse(exact.stderr).error).toContain("already exists");

    const added = await invokeAnki(
      ["models", "field-add", "--name", "M", "--field", "Extra"],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front"] : null),
    );
    expect(JSON.parse(added.stdout)).toMatchObject({ index: null, success: true });
  });

  test("validates every field-rename state including a case-only rename", async (): Promise<void> => {
    const same = await invokeAnki([
      "models",
      "field-rename",
      "--name",
      "M",
      "--old-name",
      "Front",
      "--new-name",
      "Front",
    ]);
    expect(JSON.parse(same.stderr).error).toContain("nothing to rename");

    for (const [fields, oldName, newName, message] of [
      [[], "Front", "Prompt", "has no fields or does not exist"],
      [["Front"], "Missing", "Prompt", "does not exist"],
      [["Front", "Prompt"], "Front", "Prompt", "already exists"],
    ] as const) {
      const result = await invokeAnki(
        ["models", "field-rename", "--name", "M", "--old-name", oldName, "--new-name", newName],
        (): readonly string[] => fields,
      );
      expect(JSON.parse(result.stderr).error).toContain(message);
    }

    const caseOnly = await invokeAnki(
      ["models", "field-rename", "--name", "M", "--old-name", "Front", "--new-name", "front"],
      (action: string): unknown => (action === "modelFieldNames" ? ["Front"] : null),
    );
    expect(JSON.parse(caseOnly.stdout)).toMatchObject({
      oldFieldName: "Front",
      newFieldName: "front",
      warning: expect.stringContaining("{{Front}}"),
    });
  });

  test("validates field reposition catalogs and bounds", async (): Promise<void> => {
    for (const [fields, field, index, message] of [
      [[], "Front", "0", "has no fields or does not exist"],
      [["Front"], "Missing", "0", "does not exist"],
      [["Front"], "Front", "1", "out of range"],
    ] as const) {
      const result = await invokeAnki(
        ["models", "field-reposition", "--name", "M", "--field", field, "--index", index],
        (): readonly string[] => fields,
      );
      expect(JSON.parse(result.stderr).error).toContain(message);
    }
  });
});

describe("model mutation boundaries", (): void => {
  test.each([
    {
      command: "field-add",
      args: ["--name", "M", "--field", "Extra"],
      writeAction: "modelFieldAdd",
      details: { modelName: "M", fieldName: "Extra" },
      action: "addModelField",
      notFoundHint: "Model not found. Use models list to see available models.",
      fallbackHint: "Make sure Anki is running and the model name is correct.",
    },
    {
      command: "field-remove",
      args: ["--name", "M", "--field", "Front", "--yes"],
      writeAction: "modelFieldRemove",
      details: { modelName: "M", fieldName: "Front" },
      action: "removeModelField",
      notFoundHint: "Model or field not found. Use models list and models fields to verify names.",
      fallbackHint: "Make sure Anki is running and the model and field names are correct.",
    },
    {
      command: "field-rename",
      args: ["--name", "M", "--old-name", "Front", "--new-name", "Prompt"],
      writeAction: "modelFieldRename",
      details: { modelName: "M", oldFieldName: "Front", newFieldName: "Prompt" },
      action: "renameModelField",
      notFoundHint: "Model or field not found. Use models list and models fields to verify names.",
      fallbackHint: "Make sure Anki is running and the model and field names are correct.",
    },
    {
      command: "field-reposition",
      args: ["--name", "M", "--field", "Front", "--index", "0"],
      writeAction: "modelFieldReposition",
      details: { modelName: "M", fieldName: "Front", index: 0 },
      action: "repositionModelField",
      notFoundHint: "Model or field not found. Use models list and models fields to verify names.",
      fallbackHint: "Make sure Anki is running and the model and field names are correct.",
    },
  ])(
    "preserves $command upstream failure diagnostics",
    async ({ command, args, writeAction, details, action, notFoundHint, fallbackHint }) => {
      for (const [message, hint] of [
        ["model not found", notFoundHint],
        ["Anki unavailable", fallbackHint],
      ] as const) {
        const result = await invokeAnki(
          ["models", command, ...args],
          (invokedAction: string): unknown => {
            if (invokedAction === "modelFieldNames") {
              return ["Front"];
            }
            if (invokedAction === writeAction) {
              return new Error(message);
            }
            throw new Error(`Unexpected action: ${invokedAction}`);
          },
        );
        expect(result.code).toBe(1);
        expect(JSON.parse(result.stderr)).toStrictEqual({
          success: false,
          error: message,
          action,
          ...details,
          hint,
        });
      }
    },
  );

  test("requires existing templates and preserves update not-found diagnostics", async (): Promise<void> => {
    const empty = await invokeAnki(
      [
        "models",
        "update-templates",
        "--name",
        "M",
        "--templates",
        '{"Card 1":{"Front":"x","Back":"y"}}',
      ],
      (): Record<string, never> => ({}),
    );
    expect(JSON.parse(empty.stderr).error).toContain("has no templates or does not exist");

    for (const [command, args, initialAction] of [
      ["update-styling", ["--css", "style.css"], "modelStyling"],
      [
        "update-templates",
        ["--templates", '{"Card 1":{"Front":"x","Back":"y"}}'],
        "modelTemplates",
      ],
    ] as const) {
      const result = await invokeAnki(
        ["models", command, "--name", "Missing", ...args],
        (action: string): unknown => {
          if (action === initialAction) {
            return action === "modelStyling"
              ? { css: "old" }
              : { "Card 1": { Front: "old", Back: "old" } };
          }
          return new Error("model not found");
        },
        { readText: async (): Promise<string> => ".card{}" },
      );
      expect(JSON.parse(result.stderr).hint).toContain("models list");
    }
  });
});
