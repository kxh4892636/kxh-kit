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
import { connection, mutation, type AnkiDependencies } from "../runtime";
import { guiBrowse, guiSelectCard, guiSelectedNotes } from "./browse-commands";
import {
  guiAddCards,
  guiDeckBrowser,
  guiDeckOverview,
  guiEditNote,
  type GuiNote,
  validateGuiNote,
} from "./dialog-commands";
import { guiCurrentCard, guiShowSide, guiUndo } from "./view-commands";

const warning = "For editing/creation workflows only; not for review sessions";
const values = (value: OptionValue): readonly string[] =>
  Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
const text = (value: OptionValue, flag: string): string => {
  const result = typeof value === "string" ? value.trim() : "";
  if (result === "") throw new CliUsageError(`${flag} requires a non-empty value`);
  return result;
};
const positiveId = (value: OptionValue, flag: string): number => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new CliUsageError(`${flag} must be a positive integer`);
  return id;
};
const fields = (value: OptionValue): Readonly<Record<string, string>> => {
  const parsed: Record<string, string> = {};
  for (const pair of values(value)) {
    const separator = pair.indexOf("=");
    if (separator <= 0) throw new CliUsageError(`--field requires k=v: "${pair}"`);
    const name = pair.slice(0, separator);
    const content = pair.slice(separator + 1);
    parsed[name] = content;
  }
  return parsed;
};
const prepareGuiMutation = (
  action: string,
  params: Readonly<Record<string, import("../../../cli/types").JsonValue>>,
  options: OptionValues,
  context: InvocationContext,
  dependencies: AnkiDependencies,
  run: (port: AnkiPort) => Promise<JsonOutput>,
): PreparedMutation =>
  mutation(
    action,
    options,
    context,
    dependencies,
    params,
    async (port: AnkiPort, _logger: Logger): Promise<JsonOutput> => run(port),
  );

const browserCommands = (dependencies: AnkiDependencies): readonly CommandNode[] => [
  command(
    "browse",
    `${warning}: open Card Browser`,
    [
      option.string("query", "Anki search query", { required: true }),
      option.string("order", "asc or desc", {}),
      option.string("column", "Browser sort column", {}),
    ],
    {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const query = text(options["query"], "--query");
        const rawOrder = options["order"];
        if (rawOrder !== undefined && rawOrder !== "asc" && rawOrder !== "desc")
          throw new CliUsageError("--order must be asc or desc");
        const reordered = rawOrder !== undefined || options["column"] !== undefined;
        const reorderCards = reordered
          ? {
              order: rawOrder === "desc" ? ("descending" as const) : ("ascending" as const),
              columnId:
                options["column"] === undefined ? "noteFld" : text(options["column"], "--column"),
            }
          : undefined;
        const params = { query, ...(reorderCards === undefined ? {} : { reorderCards }) };
        return prepareGuiMutation(
          "guiBrowse",
          params,
          options,
          context,
          dependencies,
          (port: AnkiPort): Promise<JsonOutput> => guiBrowse(port, query, reorderCards),
        );
      },
    },
  ),
  command(
    "select",
    `${warning}: select a browser card`,
    [option.string("card-id", "Card ID", { required: true })],
    {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const card = positiveId(options["card-id"], "--card-id");
        return prepareGuiMutation(
          "guiSelectCard",
          { card },
          options,
          context,
          dependencies,
          (port: AnkiPort): Promise<JsonOutput> => guiSelectCard(port, card),
        );
      },
    },
  ),
  command("selected-notes", `${warning}: query browser selection`, [], {
    kind: "query",
    run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
      guiSelectedNotes(connection(dependencies, options, context).port),
  }),
];

const dialogCommands = (dependencies: AnkiDependencies): readonly CommandNode[] => [
  command(
    "add-cards",
    `${warning}: prefill Add Cards`,
    [
      option.string("deck", "Target deck", { required: true }),
      option.string("model", "Note type", { required: true }),
      option.string("field", "Field k=v", { required: true, multiple: true }),
      option.string("tag", "Tag", { multiple: true }),
    ],
    {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const tags = values(options["tag"]);
        const note: GuiNote = {
          deckName: text(options["deck"], "--deck"),
          modelName: text(options["model"], "--model"),
          fields: fields(options["field"]),
          ...(tags.length === 0 ? {} : { tags }),
        };
        validateGuiNote(note);
        return prepareGuiMutation(
          "guiAddCards",
          { note },
          options,
          context,
          dependencies,
          (port: AnkiPort): Promise<JsonOutput> => guiAddCards(port, note),
        );
      },
    },
  ),
  command(
    "edit",
    `${warning}: open note editor`,
    [option.string("note-id", "Note ID", { required: true })],
    {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const note = positiveId(options["note-id"], "--note-id");
        return prepareGuiMutation(
          "guiEditNote",
          { note },
          options,
          context,
          dependencies,
          (port: AnkiPort): Promise<JsonOutput> => guiEditNote(port, note),
        );
      },
    },
  ),
  command(
    "deck-overview",
    `${warning}: open deck overview`,
    [option.string("deck", "Deck name", { required: true })],
    {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const name = text(options["deck"], "--deck");
        return prepareGuiMutation(
          "guiDeckOverview",
          { name },
          options,
          context,
          dependencies,
          (port: AnkiPort): Promise<JsonOutput> => guiDeckOverview(port, name),
        );
      },
    },
  ),
  command("deck-browser", `${warning}: open deck browser`, [], {
    kind: "mutation",
    prepare: async (options: OptionValues, context: InvocationContext): Promise<PreparedMutation> =>
      prepareGuiMutation("guiDeckBrowser", {}, options, context, dependencies, guiDeckBrowser),
  }),
];

const viewCommands = (dependencies: AnkiDependencies): readonly CommandNode[] => [
  command("current-card", `${warning}: query current review card`, [], {
    kind: "query",
    run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
      guiCurrentCard(connection(dependencies, options, context).port),
  }),
  ...(["Question", "Answer"] as const).map((side: "Answer" | "Question"): CommandNode => {
    const action = `guiShow${side}` as const;
    return command(`show-${side.toLowerCase()}`, `${warning}: display ${side.toLowerCase()}`, [], {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> =>
        prepareGuiMutation(
          action,
          {},
          options,
          context,
          dependencies,
          (port: AnkiPort): Promise<JsonOutput> => guiShowSide(port, action),
        ),
    });
  }),
  command("undo", `${warning}: undo last Anki action`, [], {
    kind: "mutation",
    prepare: async (options: OptionValues, context: InvocationContext): Promise<PreparedMutation> =>
      prepareGuiMutation("guiUndo", {}, options, context, dependencies, guiUndo),
  }),
];

export const createGuiGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("gui", `${warning}: drive the Anki desktop interface`, [
    ...browserCommands(dependencies),
    ...dialogCommands(dependencies),
    ...viewCommands(dependencies),
  ]);
