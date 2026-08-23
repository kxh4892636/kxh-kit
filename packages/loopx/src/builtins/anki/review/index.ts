import { command, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import type {
  InvocationContext,
  JsonOutput,
  JsonValue,
  LeafCommand,
  OptionValue,
  OptionValues,
  PreparedMutation,
} from "../../../cli/types";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { connection, mutation, type AnkiDependencies } from "../runtime";
import { runGetDueCards } from "../cards/due-command";
import type { SimplifiedCard } from "../cards/card-domain";
import { runReviewSession } from "./review-session";

const reviewOptions = [
  option.string("deck", "Limit to a deck", {}),
  option.string("limit", "Maximum cards (1-50)", {}),
  option.boolean("include-new", "Include new cards", {}),
  option.boolean("no-sync", "Skip the initial AnkiWeb sync", {}),
] as const;

const limitValue = (value: OptionValue): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new CliUsageError("--limit requires an integer from 1 to 50");
  }
  return parsed;
};

export const createReviewCommand = (dependencies: AnkiDependencies): LeafCommand =>
  command("review", "Run an interactive review session", reviewOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const sessionOptions = {
        deck: typeof options["deck"] === "string" ? options["deck"] : undefined,
        limit: limitValue(options["limit"]),
        includeNew: options["include-new"] === true,
        syncFirst: options["no-sync"] !== true,
      };
      const params = {
        ...(sessionOptions.deck === undefined ? {} : { deck: sessionOptions.deck }),
        limit: sessionOptions.limit ?? 10,
        includeNew: sessionOptions.includeNew,
        syncFirst: sessionOptions.syncFirst,
      };
      const now = (): Date => dependencies.now?.() ?? new Date();
      if (context.dryRun) {
        const connected = connection(dependencies, options, context);
        const due = await runGetDueCards(
          connected.port,
          {
            ...(sessionOptions.deck === undefined ? {} : { deckName: sessionOptions.deck }),
            limit: sessionOptions.limit ?? 10,
            includeLearning: true,
            includeNew: sessionOptions.includeNew,
          },
          connected.logger,
        );
        return {
          preview: {
            success: true,
            actions: [{ action: "review", params }],
            cards: due.cards.map((card: SimplifiedCard): JsonValue => ({ cardId: card.cardId })),
          },
          commit: async (): Promise<JsonOutput> => {
            throw new Error("Dry-run review cannot be committed");
          },
        };
      }
      return mutation(
        "review",
        options,
        context,
        dependencies,
        params,
        async (port: AnkiPort, logger: Logger): Promise<JsonOutput> =>
          runReviewSession(port, context, sessionOptions, logger, now),
      );
    },
  });
