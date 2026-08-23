import { command, group, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import type {
  CommandGroup,
  InvocationContext,
  JsonOutput,
  OptionValue,
  OptionValues,
  PreparedMutation,
} from "../../../cli/types";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { connection, mutation, toJson, type AnkiDependencies } from "../runtime";
import { getDueCardsParamsSchema, runGetDueCards } from "./due-command";
import { cardStates, getCardsParamsSchema, runGetCards, type CardState } from "./list-command";
import { presentCardParamsSchema, runPresentCard } from "./present-command";
import { rateCardParamsSchema, runRateCard } from "./rate-command";

const positiveInteger = (value: OptionValue, flag: string, maximum?: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || (maximum !== undefined && parsed > maximum)) {
    throw new CliUsageError(
      `${flag} requires a positive integer${maximum === undefined ? "" : ` up to ${maximum}`}`,
    );
  }
  return parsed;
};

const assertValid = (result: { readonly success: boolean; readonly error?: Error }): void => {
  if (!result.success) throw new CliUsageError(result.error?.message ?? "Invalid command input");
};

const dueOptions = [
  option.string("deck", "Limit to a deck", {}),
  option.string("limit", "Maximum cards (1-50)", {}),
  option.boolean("no-learning", "Exclude learning cards", {}),
  option.boolean("include-new", "Include new cards", {}),
] as const;
const listOptions = [
  option.string("deck", "Limit to a deck", {}),
  option.string("state", "Card state: due|new|learning|suspended|buried", {}),
  option.string("limit", "Maximum cards (1-50)", {}),
] as const;
const presentOptions = [
  option.string("card-id", "Card ID", { required: true }),
  option.boolean("answer", "Include the rendered answer", {}),
] as const;
const rateOptions = [
  option.string("card-id", "Card ID", { required: true }),
  option.string("rating", "Rating: 1=Again, 2=Hard, 3=Good, 4=Easy", { required: true }),
] as const;

export const createCardsGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("cards", "Query and review cards", [
    command("due", "List cards due for review", dueOptions, {
      kind: "query",
      run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> => {
        const params = {
          ...(typeof options["deck"] === "string" ? { deckName: options["deck"] } : {}),
          ...(options["limit"] === undefined
            ? {}
            : { limit: positiveInteger(options["limit"], "--limit", 50) }),
          includeLearning: options["no-learning"] !== true,
          includeNew: options["include-new"] === true,
        };
        assertValid(getDueCardsParamsSchema.safeParse(params));
        const connected = connection(dependencies, options, context);
        return toJson(runGetDueCards(connected.port, params, connected.logger));
      },
    }),
    command("list", "List cards by state", listOptions, {
      kind: "query",
      run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> => {
        const state = options["state"];
        if (state !== undefined && !cardStates.includes(state as CardState)) {
          throw new CliUsageError("--state must be due, new, learning, suspended, or buried");
        }
        const params = {
          ...(typeof options["deck"] === "string" ? { deckName: options["deck"] } : {}),
          ...(state === undefined ? {} : { cardState: state as CardState }),
          ...(options["limit"] === undefined
            ? {}
            : { limit: positiveInteger(options["limit"], "--limit", 50) }),
        };
        assertValid(getCardsParamsSchema.safeParse(params));
        return toJson(runGetCards(connection(dependencies, options, context).port, params));
      },
    }),
    command("present", "Render one card", presentOptions, {
      kind: "query",
      run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> => {
        const params = {
          cardId: positiveInteger(options["card-id"], "--card-id"),
          showAnswer: options["answer"] === true,
        };
        assertValid(presentCardParamsSchema.safeParse(params));
        return toJson(runPresentCard(connection(dependencies, options, context).port, params));
      },
    }),
    command("rate", "Rate one card", rateOptions, {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const params = {
          cardId: positiveInteger(options["card-id"], "--card-id"),
          rating: positiveInteger(options["rating"], "--rating", 4),
        };
        assertValid(rateCardParamsSchema.safeParse(params));
        return mutation(
          "answerCards",
          options,
          context,
          dependencies,
          { answers: [{ cardId: params.cardId, ease: params.rating }] },
          async (port: AnkiPort, _logger: Logger): Promise<JsonOutput> =>
            toJson(runRateCard(port, params)),
        );
      },
    }),
  ]);
