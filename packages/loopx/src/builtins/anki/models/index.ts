import { command, group, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import { z } from "zod";
import type {
  CommandGroup,
  CommandNode,
  InvocationContext,
  JsonOutput,
  JsonValue,
  OptionValue,
  OptionValues,
  PreparedMutation,
} from "../../../cli/types";
import { createModelParamsSchema, runCreateModel } from "./create-command";
import { addModelFieldParamsSchema, runAddModelField } from "./field-add-command";
import { removeModelFieldParamsSchema, runRemoveModelField } from "./field-remove-command";
import { renameModelFieldParamsSchema, runRenameModelField } from "./field-rename-command";
import {
  repositionModelFieldParamsSchema,
  runRepositionModelField,
} from "./field-reposition-command";
import { runModelFieldNames } from "./fields-command";
import { runModelNames } from "./list-command";
import { runModelStyling } from "./styling-command";
import { runModelTemplates } from "./templates-command";
import { runUpdateModelStyling, updateModelStylingParamsSchema } from "./update-styling-command";
import {
  runUpdateModelTemplates,
  updateModelTemplatesParamsSchema,
} from "./update-templates-command";
import { readTextInput } from "../input";
import type { AnkiPort } from "../port";
import type { Logger } from "../logger";
import { connection, loggerFor, mutation, toJson, type AnkiDependencies } from "../runtime";

type Templates = Record<string, { Front: string; Back: string }>;
type CreateTemplate = { Name: string; Front: string; Back: string };

const templateSchema = z
  .object({ Front: z.string().min(1), Back: z.string().min(1) })
  .passthrough();
const templatesSchema = z
  .record(z.string(), templateSchema)
  .refine((value: Templates): boolean => Object.keys(value).length > 0);
const createTemplatesSchema = z
  .array(
    z
      .object({ Name: z.string().min(1), Front: z.string().min(1), Back: z.string().min(1) })
      .passthrough(),
  )
  .min(1);

export const strings = (value: OptionValue): readonly string[] =>
  Array.isArray(value) ? value : typeof value === "string" ? [value] : [];

export const nonNegative = (value: OptionValue, flag: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliUsageError(`${flag} requires a non-negative integer`);
  }
  return parsed;
};

export const templates = (value: OptionValue): Templates => {
  try {
    return templatesSchema.parse(JSON.parse(value as string));
  } catch {
    throw new CliUsageError('--templates requires JSON: {"Card 1":{"Front":"...","Back":"..."}}');
  }
};

export const createTemplates = (value: OptionValue): CreateTemplate[] => {
  try {
    return createTemplatesSchema.parse(JSON.parse(value as string));
  } catch {
    throw new CliUsageError(
      '--templates requires JSON: [{"Name":"Card 1","Front":"...","Back":"..."}]',
    );
  }
};

const nameOptions = [option.string("name", "Note type name", { required: true })] as const;
const createOptions = [
  ...nameOptions,
  option.string("field", "Field name in order", { required: true, multiple: true }),
  option.string("templates", "Card template array JSON", { required: true }),
  option.string("css", "CSS file or - for stdin", {}),
  option.boolean("cloze", "Create a cloze note type", {}),
] as const;
const stylingOptions = [
  ...nameOptions,
  option.string("css", "CSS file or - for stdin", { required: true }),
] as const;
const templateOptions = [
  ...nameOptions,
  option.string("templates", "Card template object JSON", { required: true }),
] as const;
const addFieldOptions = [
  ...nameOptions,
  option.string("field", "New field name", { required: true }),
  option.string("index", "Insertion index", {}),
] as const;
const removeFieldOptions = [
  ...nameOptions,
  option.string("field", "Field name", { required: true }),
  option.boolean("yes", "Confirm permanent deletion", { required: true }),
] as const;
const renameFieldOptions = [
  ...nameOptions,
  option.string("old-name", "Current field name", { required: true }),
  option.string("new-name", "New field name", { required: true }),
] as const;
const repositionFieldOptions = [
  ...nameOptions,
  option.string("field", "Field name", { required: true }),
  option.string("index", "New field index", { required: true }),
] as const;

const queryPort = (
  dependencies: AnkiDependencies,
  options: OptionValues,
  context: InvocationContext,
): AnkiPort => connection(dependencies, options, context).port;

const assertValid = (result: { readonly success: boolean; readonly error?: Error }): void => {
  if (!result.success) throw new CliUsageError(result.error?.message ?? "Invalid command input");
};

const queryCommands = (dependencies: AnkiDependencies): readonly CommandNode[] => [
  command("list", "List note types", [], {
    kind: "query",
    run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
      toJson(runModelNames(queryPort(dependencies, options, context))),
  }),
  command("fields", "List note type fields", nameOptions, {
    kind: "query",
    run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
      toJson(
        runModelFieldNames(queryPort(dependencies, options, context), {
          modelName: options["name"] as string,
        }),
      ),
  }),
  command("styling", "Show note type CSS", nameOptions, {
    kind: "query",
    run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
      toJson(
        runModelStyling(queryPort(dependencies, options, context), {
          modelName: options["name"] as string,
        }),
      ),
  }),
  command("templates", "Show card templates", nameOptions, {
    kind: "query",
    run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
      toJson(
        runModelTemplates(queryPort(dependencies, options, context), {
          modelName: options["name"] as string,
        }),
      ),
  }),
];

const contentMutationCommands = (dependencies: AnkiDependencies): readonly CommandNode[] => [
  command("create", "Create a note type", createOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const cssSource = options["css"];
      const css =
        typeof cssSource === "string"
          ? await readTextInput(cssSource, context, dependencies, loggerFor(options, context))
          : undefined;
      const params = {
        modelName: options["name"] as string,
        inOrderFields: [...strings(options["field"])],
        cardTemplates: createTemplates(options["templates"]),
        ...(css === undefined ? {} : { css }),
        isCloze: options["cloze"] === true,
      };
      assertValid(createModelParamsSchema.safeParse(params));
      return mutation(
        "createModel",
        options,
        context,
        dependencies,
        params as unknown as Readonly<Record<string, JsonValue>>,
        async (port: AnkiPort): Promise<JsonOutput> => toJson(runCreateModel(port, params)),
      );
    },
  }),
  command("update-styling", "Replace note type CSS", stylingOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const modelName = options["name"] as string;
      const css = await readTextInput(
        options["css"] as string,
        context,
        dependencies,
        loggerFor(options, context),
      );
      const params = { modelName, css };
      assertValid(updateModelStylingParamsSchema.safeParse(params));
      return mutation(
        "updateModelStyling",
        options,
        context,
        dependencies,
        { model: { name: modelName, css } },
        async (port: AnkiPort, logger: Logger): Promise<JsonOutput> =>
          toJson(runUpdateModelStyling(port, params, logger)),
      );
    },
  }),
  command("update-templates", "Replace card templates", templateOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const modelName = options["name"] as string;
      const parsed = templates(options["templates"]);
      const params = { modelName, templates: parsed };
      assertValid(updateModelTemplatesParamsSchema.safeParse(params));
      return mutation(
        "updateModelTemplates",
        options,
        context,
        dependencies,
        { model: { name: modelName, templates: parsed } },
        async (port: AnkiPort): Promise<JsonOutput> =>
          toJson(runUpdateModelTemplates(port, params)),
      );
    },
  }),
];

const fieldMutationCommands = (dependencies: AnkiDependencies): readonly CommandNode[] => [
  command("field-add", "Add a note type field", addFieldOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const modelName = options["name"] as string;
      const fieldName = options["field"] as string;
      const index =
        options["index"] === undefined ? undefined : nonNegative(options["index"], "--index");
      const params = { modelName, fieldName, ...(index === undefined ? {} : { index }) };
      assertValid(addModelFieldParamsSchema.safeParse(params));
      return mutation(
        "modelFieldAdd",
        options,
        context,
        dependencies,
        params,
        async (port: AnkiPort): Promise<JsonOutput> => toJson(runAddModelField(port, params)),
      );
    },
  }),
  command("field-remove", "Permanently remove a field", removeFieldOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const modelName = options["name"] as string;
      const fieldName = options["field"] as string;
      const params = { modelName, fieldName, confirmDeletion: true };
      assertValid(removeModelFieldParamsSchema.safeParse(params));
      return mutation(
        "modelFieldRemove",
        options,
        context,
        dependencies,
        { modelName, fieldName },
        async (port: AnkiPort): Promise<JsonOutput> => toJson(runRemoveModelField(port, params)),
      );
    },
  }),
  command("field-rename", "Rename a note type field", renameFieldOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const params = {
        modelName: options["name"] as string,
        oldFieldName: options["old-name"] as string,
        newFieldName: options["new-name"] as string,
      };
      assertValid(renameModelFieldParamsSchema.safeParse(params));
      return mutation(
        "modelFieldRename",
        options,
        context,
        dependencies,
        params,
        async (port: AnkiPort): Promise<JsonOutput> => toJson(runRenameModelField(port, params)),
      );
    },
  }),
  command("field-reposition", "Reposition a note type field", repositionFieldOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const params = {
        modelName: options["name"] as string,
        fieldName: options["field"] as string,
        index: nonNegative(options["index"], "--index"),
      };
      assertValid(repositionModelFieldParamsSchema.safeParse(params));
      return mutation(
        "modelFieldReposition",
        options,
        context,
        dependencies,
        params,
        async (port: AnkiPort): Promise<JsonOutput> =>
          toJson(runRepositionModelField(port, params)),
      );
    },
  }),
];

export const createModelsGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("models", "Manage note types", [
    ...queryCommands(dependencies),
    ...contentMutationCommands(dependencies),
    ...fieldMutationCommands(dependencies),
  ]);
