import { command, group, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import type { CommandGroup, InvocationContext, JsonOutput, OptionValues } from "../../../cli/types";
import { connection, type AnkiDependencies } from "../runtime";
import { collectionStats } from "./collection-stats";
import { reviewStats } from "./review-stats";

const bucketValues = (value: unknown, flag: string): readonly number[] | undefined => {
  if (typeof value !== "string") return undefined;
  const numbers = value.split(",").map((entry: string): number => Number(entry.trim()));
  if (
    numbers.length === 0 ||
    numbers.length > 20 ||
    numbers.some((entry: number): boolean => !Number.isFinite(entry) || entry <= 0)
  ) {
    throw new CliUsageError(`${flag} must contain one to twenty positive numbers`);
  }
  return numbers;
};
const date = (value: unknown, flag: string): string => {
  const text = typeof value === "string" ? value : "";
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(text) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  )
    throw new CliUsageError(`${flag} must use YYYY-MM-DD`);
  return text;
};

export const createStatsGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("stats", "Show collection statistics", [
    command(
      "collection",
      "Show collection statistics",
      [
        option.string("ease-buckets", "Comma-separated ease boundaries", {}),
        option.string("interval-buckets", "Comma-separated interval boundaries", {}),
      ],
      {
        kind: "query",
        run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
          collectionStats(
            connection(dependencies, options, context).port,
            bucketValues(options["ease-buckets"], "--ease-buckets"),
            bucketValues(options["interval-buckets"], "--interval-buckets"),
          ),
      },
    ),
    command(
      "review",
      "Show review history",
      [
        option.string("start", "Start date (YYYY-MM-DD)", { required: true }),
        option.string("end", "End date (YYYY-MM-DD)", {}),
        option.string("deck", "Exact deck name", {}),
      ],
      {
        kind: "query",
        run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> => {
          const start = date(options["start"], "--start");
          const today = dependencies.now?.() ?? new Date();
          const end =
            options["end"] === undefined
              ? today.toISOString().slice(0, 10)
              : date(options["end"], "--end");
          if (Date.parse(start) > Date.parse(end))
            throw new CliUsageError("--start must be before or equal to --end");
          const deck =
            typeof options["deck"] === "string" && options["deck"].trim() !== ""
              ? options["deck"]
              : undefined;
          return reviewStats(
            connection(dependencies, options, context).port,
            start,
            end,
            deck,
            today,
          );
        },
      },
    ),
  ]);
