import { command, group, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import type {
  CommandGroup,
  InvocationContext,
  JsonOutput,
  JsonValue,
  OptionValue,
  OptionValues,
  PreparedMutation,
} from "../../../cli/types";
import { addNoteParamsSchema, runAddNote } from "./add-note-command";
import { addNotesParamsSchema, runAddNotes } from "./add-notes-command";
import { deleteNotesParamsSchema, runDeleteNotes } from "./delete-notes-command";
import { runFindNotes } from "./find-notes-command";
import { runNotesInfo } from "./notes-info-command";
import { runUpdateNoteFields, updateNoteFieldsParamsSchema } from "./update-note-fields-command";
import { AnkiOperationError } from "../errors";
import { readTextInput } from "../input";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { connection, loggerFor, mutation, toJson, type AnkiDependencies } from "../runtime";
import {
  getMediaUrlConfigFromEnv,
  sanitizeMediaFilename,
  validateMediaUrl,
} from "./media-validation";

type MediaItem = { url: string; filename: string; fields: string[] };
type BatchNote = { fields: Record<string, string>; tags?: string[] };

const strings = (value: OptionValue): readonly string[] =>
  Array.isArray(value) ? value : typeof value === "string" ? [value] : [];

const fields = (value: OptionValue): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const pair of strings(value)) {
    const separator = pair.indexOf("=");
    if (separator <= 0) throw new CliUsageError(`--field requires k=v: "${pair}"`);
    result[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return result;
};

const ids = (value: OptionValue, flag: string): number[] => {
  const values = strings(value).map(Number);
  if (
    values.length === 0 ||
    values.length > 100 ||
    values.some((id: number): boolean => !Number.isInteger(id) || id <= 0)
  ) {
    throw new CliUsageError(`${flag} requires one to one hundred positive integers`);
  }
  return values;
};

const duplicateScope = (value: OptionValue): "collection" | "deck" | undefined => {
  if (value === undefined) return undefined;
  if (value !== "deck" && value !== "collection") {
    throw new CliUsageError("--duplicate-scope must be deck or collection");
  }
  return value;
};

const media = (value: OptionValue, flag: string): MediaItem[] | undefined => {
  const raw = strings(value);
  if (raw.length === 0) return undefined;
  return raw.map((entry: string): MediaItem => {
    try {
      const parsed: unknown = JSON.parse(entry);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("url" in parsed) ||
        typeof parsed.url !== "string" ||
        !("filename" in parsed) ||
        typeof parsed.filename !== "string" ||
        !("fields" in parsed) ||
        !Array.isArray(parsed.fields) ||
        !parsed.fields.every((field: unknown): field is string => typeof field === "string")
      ) {
        throw new Error("shape");
      }
      if (parsed.url.length === 0 || parsed.filename.length === 0 || parsed.fields.length === 0) {
        throw new Error("empty");
      }
      return { url: parsed.url, filename: parsed.filename, fields: parsed.fields };
    } catch {
      throw new CliUsageError(
        `${flag} requires JSON: {"url":"..","filename":"..","fields":["Front"]}`,
      );
    }
  });
};

const prepareMedia = async (
  value: OptionValue,
  flag: string,
  context: InvocationContext,
  logger: Logger,
): Promise<MediaItem[] | undefined> => {
  const items = media(value, flag);
  if (items === undefined) return undefined;
  const config = getMediaUrlConfigFromEnv(context.env);
  for (const item of items) {
    await validateMediaUrl(item.url, config, logger);
    item.filename = sanitizeMediaFilename(item.filename);
  }
  return items;
};

const assertValid = (result: { readonly success: boolean; readonly error?: Error }): void => {
  if (!result.success) throw new CliUsageError(result.error?.message ?? "Invalid command input");
};

const parseBatch = (text: string): BatchNote[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AnkiOperationError("Input is not valid JSON", "addNotes");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.length > 100 ||
    !parsed.every(
      (note: unknown): note is BatchNote =>
        typeof note === "object" &&
        note !== null &&
        "fields" in note &&
        typeof note.fields === "object" &&
        note.fields !== null &&
        !Array.isArray(note.fields) &&
        Object.values(note.fields).every(
          (field: unknown): field is string => typeof field === "string",
        ) &&
        (!("tags" in note) ||
          (Array.isArray(note.tags) &&
            note.tags.every((tag: unknown): tag is string => typeof tag === "string"))),
    )
  ) {
    throw new AnkiOperationError("Input must contain an array of 1-100 valid notes", "addNotes");
  }
  return parsed;
};

const addOptions = [
  option.string("deck", "Target deck", { required: true }),
  option.string("model", "Note type", { required: true }),
  option.string("field", "Field as k=v", { required: true, multiple: true }),
  option.string("tag", "Tag", { multiple: true }),
  option.boolean("allow-duplicate", "Allow duplicate notes", {}),
  option.string("duplicate-scope", "Duplicate scope: deck|collection", {}),
  option.string("dup-scope-deck", "Deck used for duplicate checking", {}),
  option.boolean("dup-check-children", "Check child decks", {}),
  option.boolean("dup-check-all-models", "Check every note type", {}),
] as const;

const batchOptions = [
  option.string("deck", "Target deck", { required: true }),
  option.string("model", "Note type", { required: true }),
  option.string("input", "JSON file or - for stdin", { required: true }),
  option.string("tag", "Shared tag", { multiple: true }),
  option.boolean("allow-duplicate", "Allow duplicate notes", {}),
  option.string("duplicate-scope", "Duplicate scope: deck|collection", {}),
] as const;

const infoOptions = [
  option.string("note-id", "Note IDs", { required: true, multiple: true }),
] as const;

const updateOptions = [
  option.string("id", "Note ID", { required: true }),
  option.string("field", "Field as k=v", { required: true, multiple: true }),
  option.string("audio", "Audio attachment JSON", { multiple: true }),
  option.string("picture", "Picture attachment JSON", { multiple: true }),
] as const;

const deleteOptions = [
  option.string("note-id", "Note IDs", { required: true, multiple: true }),
  option.boolean("yes", "Confirm permanent deletion", { required: true }),
] as const;

const addParams = (options: OptionValues): Record<string, unknown> => {
  const tags = strings(options["tag"]);
  const hasScopeOptions =
    options["dup-scope-deck"] !== undefined ||
    options["dup-check-children"] === true ||
    options["dup-check-all-models"] === true;
  return {
    deckName: options["deck"] as string,
    modelName: options["model"] as string,
    fields: fields(options["field"]),
    ...(tags.length === 0 ? {} : { tags }),
    ...(options["allow-duplicate"] === true ? { allowDuplicate: true } : {}),
    ...(options["duplicate-scope"] === undefined
      ? {}
      : { duplicateScope: duplicateScope(options["duplicate-scope"]) }),
    ...(hasScopeOptions
      ? {
          duplicateScopeOptions: {
            ...(typeof options["dup-scope-deck"] === "string"
              ? { deckName: options["dup-scope-deck"] }
              : {}),
            checkChildren: options["dup-check-children"] === true,
            checkAllModels: options["dup-check-all-models"] === true,
          },
        }
      : {}),
  };
};

export const createNotesGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("notes", "Manage notes", [
    command("add", "Add a note", addOptions, {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const params = addParams(options);
        assertValid(addNoteParamsSchema.safeParse(params));
        return mutation(
          "addNote",
          options,
          context,
          dependencies,
          { note: params as unknown as JsonValue },
          async (port: AnkiPort): Promise<JsonOutput> =>
            toJson(runAddNote(port, params as Parameters<typeof runAddNote>[1])),
        );
      },
    }),
    command("add-batch", "Add up to 100 notes", batchOptions, {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const input = options["input"] as string;
        const logger = loggerFor(options, context);
        const notes = parseBatch(
          (await readTextInput(input, context, dependencies, logger)).trim(),
        );
        const tags = strings(options["tag"]);
        const params = {
          deckName: options["deck"] as string,
          modelName: options["model"] as string,
          notes,
          ...(tags.length === 0 ? {} : { tags: [...tags] }),
          ...(options["allow-duplicate"] === true ? { allowDuplicate: true } : {}),
          ...(options["duplicate-scope"] === undefined
            ? {}
            : { duplicateScope: duplicateScope(options["duplicate-scope"]) }),
        };
        assertValid(addNotesParamsSchema.safeParse(params));
        return mutation(
          "addNotes",
          options,
          context,
          dependencies,
          { source: input, total: notes.length },
          async (port: AnkiPort, commitLogger: Logger): Promise<JsonOutput> =>
            toJson(runAddNotes(port, params, commitLogger)),
        );
      },
    }),
    command(
      "find",
      "Find notes by Anki query",
      [option.string("query", "Anki query", { required: true })],
      {
        kind: "query",
        run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
          toJson(
            runFindNotes(connection(dependencies, options, context).port, {
              query: options["query"] as string,
            }),
          ),
      },
    ),
    command("info", "Show note information", infoOptions, {
      kind: "query",
      run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
        toJson(
          runNotesInfo(connection(dependencies, options, context).port, {
            notes: ids(options["note-id"], "--note-id"),
          }),
        ),
    }),
    command("update", "Update note fields", updateOptions, {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const noteIds = ids(options["id"], "--id");
        const logger = loggerFor(options, context);
        const audio = await prepareMedia(options["audio"], "--audio", context, logger);
        const picture = await prepareMedia(options["picture"], "--picture", context, logger);
        const note = {
          id: noteIds[0] as number,
          fields: fields(options["field"]),
          ...(audio === undefined ? {} : { audio }),
          ...(picture === undefined ? {} : { picture }),
        };
        const params = { note };
        assertValid(updateNoteFieldsParamsSchema.safeParse(params));
        return mutation(
          "updateNoteFields",
          options,
          context,
          dependencies,
          { note: note as unknown as JsonValue },
          async (port: AnkiPort, commitLogger: Logger): Promise<JsonOutput> =>
            toJson(runUpdateNoteFields(port, params, context.env, commitLogger)),
        );
      },
    }),
    command("delete", "Permanently delete notes", deleteOptions, {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const notes = ids(options["note-id"], "--note-id");
        const params = { notes, confirmDeletion: true };
        assertValid(deleteNotesParamsSchema.safeParse(params));
        return mutation(
          "deleteNotes",
          options,
          context,
          dependencies,
          { notes },
          async (port: AnkiPort): Promise<JsonOutput> => toJson(runDeleteNotes(port, params)),
        );
      },
    }),
  ]);
