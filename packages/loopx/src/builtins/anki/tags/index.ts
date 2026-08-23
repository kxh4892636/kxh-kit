import { command, group, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import type {
  CommandGroup,
  CommandNode,
  InvocationContext,
  JsonOutput,
  OptionValue,
  OptionValues,
  PreparedMutation,
} from "../../../cli/types";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { connection, mutation, toJson, type AnkiDependencies } from "../runtime";
import { changeTags, clearUnusedTags, listTags, replaceTag } from "./tag-operations";

const values = (value: OptionValue): readonly string[] =>
  Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
const noteIds = (value: OptionValue): readonly number[] => {
  const result = values(value).map((entry: string): number => Number(entry));
  if (
    result.length === 0 ||
    result.length > 1000 ||
    result.some((id: number): boolean => !Number.isInteger(id) || id <= 0)
  ) {
    throw new CliUsageError("--note-id requires one to one thousand positive integers");
  }
  return result;
};
const tags = (value: OptionValue): readonly string[] => {
  const result = values(value).map((tag: string): string => tag.trim());
  if (result.length === 0 || result.some((tag: string): boolean => tag === "")) {
    throw new CliUsageError("--tag requires one or more non-empty tags");
  }
  return result;
};
const singleTag = (value: OptionValue, flag: string): string => {
  const result = typeof value === "string" ? value.trim() : "";
  if (result === "" || /\s/u.test(result)) throw new CliUsageError(`${flag} requires one tag`);
  return result;
};

const changeOptions = [
  option.string("note-id", "Note IDs", { required: true, multiple: true }),
  option.string("tag", "Tags", { required: true, multiple: true }),
] as const;
const replaceOptions = [
  option.string("note-id", "Note IDs", { required: true, multiple: true }),
  option.string("from", "Existing tag", { required: true }),
  option.string("to", "Replacement tag", { required: true }),
] as const;

export const createTagsGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("tags", "Manage note tags", [
    command("list", "List tags", [option.string("pattern", "Filter text", {})], {
      kind: "query",
      run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
        toJson(
          listTags(
            connection(dependencies, options, context).port,
            typeof options["pattern"] === "string" ? options["pattern"] : undefined,
          ),
        ),
    }),
    ...(["addTags", "removeTags"] as const).map(
      (action: "addTags" | "removeTags"): CommandNode =>
        command(action === "addTags" ? "add" : "remove", `${action} on notes`, changeOptions, {
          kind: "mutation",
          prepare: async (
            options: OptionValues,
            context: InvocationContext,
          ): Promise<PreparedMutation> => {
            const params = { notes: noteIds(options["note-id"]), tags: tags(options["tag"]) };
            return mutation(
              action,
              options,
              context,
              dependencies,
              { notes: params.notes, tags: params.tags.join(" ") },
              async (port: AnkiPort, _logger: Logger): Promise<JsonOutput> =>
                toJson(changeTags(port, action, params)),
            );
          },
        }),
    ),
    command("replace", "Replace one tag", replaceOptions, {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const notes = noteIds(options["note-id"]);
        const from = singleTag(options["from"], "--from");
        const to = singleTag(options["to"], "--to");
        return mutation(
          "replaceTags",
          options,
          context,
          dependencies,
          { notes, tag_to_replace: from, replace_with_tag: to },
          async (port: AnkiPort, _logger: Logger): Promise<JsonOutput> =>
            toJson(replaceTag(port, notes, from, to)),
        );
      },
    }),
    command(
      "clear-unused",
      "Clear orphaned tags",
      [option.boolean("yes", "Confirm permanent cleanup", { required: true })],
      {
        kind: "mutation",
        prepare: async (
          options: OptionValues,
          context: InvocationContext,
        ): Promise<PreparedMutation> =>
          mutation(
            "clearUnusedTags",
            options,
            context,
            dependencies,
            {},
            async (port: AnkiPort, _logger: Logger): Promise<JsonOutput> =>
              toJson(clearUnusedTags(port)),
          ),
      },
    ),
  ]);
