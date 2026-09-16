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
import { runUpdateModelStyling, updateModelStylingParamsSchema } from "./styling-commands";
import { updateModelTemplatesParamsSchema } from "./update-templates-command";

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
