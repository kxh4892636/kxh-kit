import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

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
