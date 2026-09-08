import { command, group, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import type {
  CommandGroup,
  InvocationContext,
  JsonOutput,
  OptionValues,
  PreparedMutation,
  ValuesFromOptions,
} from "../../../cli/types";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { connection, mutation, type AnkiDependencies } from "../runtime";
import { deckStats } from "./deck-stats";
import { createDeck, deleteDeck, listDecks, moveCards, validateDeckName } from "./decks";

const listOptions = [option.boolean("stats", "Include scheduler statistics", {})] as const;
const statsOptions = [
  option.string("deck", "Deck name", { required: true }),
  option.string("ease-buckets", "Comma-separated ease boundaries", {}),
  option.string("interval-buckets", "Comma-separated interval boundaries", {}),
] as const;
const createOptions = [option.string("name", "Deck name", { required: true })] as const;
const moveOptions = [
  option.string("deck", "Target deck name", { required: true }),
  option.string("card-id", "Card IDs", { required: true, multiple: true }),
] as const;
const deleteOptions = [
  option.string("name", "Deck name", { required: true }),
  option.boolean("yes", "Confirm permanent deletion", { required: true }),
] as const;
type ListOptions = ValuesFromOptions<typeof listOptions>;
type StatsOptions = ValuesFromOptions<typeof statsOptions>;
type CreateOptions = ValuesFromOptions<typeof createOptions>;
type MoveOptions = ValuesFromOptions<typeof moveOptions>;
type DeleteOptions = ValuesFromOptions<typeof deleteOptions>;

export const numbers = (raw: string | undefined, name: string): readonly number[] | undefined => {
  if (raw === undefined) return undefined;
  const values = raw.split(",").map((value: string): number => Number(value.trim()));
  if (
    values.length === 0 ||
    values.length > 20 ||
    values.some((value: number): boolean => !Number.isFinite(value) || value <= 0)
  ) {
    throw new CliUsageError(`${name} must contain one to twenty positive numbers`);
  }
  return values;
};

export const cardIds = (value: OptionValues[string]): readonly number[] => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const ids = raw.map((entry: string): number => Number(entry));
  if (ids.length === 0 || ids.some((id: number): boolean => !Number.isInteger(id) || id <= 0)) {
    throw new CliUsageError("--card-id values must be positive integers");
  }
  return ids;
};

const assertDeckName = (name: string): void => {
  try {
    validateDeckName(name);
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
};

export const createDecksGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("decks", "Manage decks", [
    command("list", "List decks", listOptions, {
      kind: "query",
      run: async (options: ListOptions, context: InvocationContext): Promise<JsonOutput> =>
        listDecks(connection(dependencies, options, context).port, options.stats === true),
    }),
    command("stats", "Show deck statistics", statsOptions, {
      kind: "query",
      run: async (options: StatsOptions, context: InvocationContext): Promise<JsonOutput> =>
        deckStats(
          connection(dependencies, options, context).port,
          options.deck,
          numbers(options["ease-buckets"], "--ease-buckets"),
          numbers(options["interval-buckets"], "--interval-buckets"),
        ),
    }),
    command("create", "Create a deck", createOptions, {
      kind: "mutation",
      prepare: async (
        options: CreateOptions,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        assertDeckName(options.name);
        return mutation(
          "createDeck",
          options,
          context,
          dependencies,
          { deck: options.name },
          async (port: AnkiPort, logger: Logger): Promise<JsonOutput> =>
            createDeck(port, options.name, logger),
        );
      },
    }),
    command("move", "Move cards to a deck", moveOptions, {
      kind: "mutation",
      prepare: async (
        options: MoveOptions,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const cards = cardIds(options["card-id"]);
        const deck = options.deck.trim();
        if (deck === "") throw new CliUsageError("--deck cannot be empty");
        return mutation(
          "changeDeck",
          options,
          context,
          dependencies,
          { cards, deck },
          async (port: AnkiPort): Promise<JsonOutput> => moveCards(port, deck, cards),
        );
      },
    }),
    command("delete", "Permanently delete a deck", deleteOptions, {
      kind: "mutation",
      prepare: async (
        options: DeleteOptions,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        assertDeckName(options.name);
        return mutation(
          "deleteDecks",
          options,
          context,
          dependencies,
          { decks: [options.name], cardsToo: true },
          async (port: AnkiPort): Promise<JsonOutput> => deleteDeck(port, options.name),
        );
      },
    }),
  ]);
