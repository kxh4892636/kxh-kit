import type { JsonValue } from "../../cli/types";
import { computeDistribution, deckScopeQuery } from "./deck-metrics";
import { AnkiOperationError } from "./errors";
import type { AnkiPort } from "./port";

interface DeckStatsResponse {
  readonly learn_count?: number;
  readonly new_count?: number;
  readonly review_count?: number;
  readonly total_in_deck?: number;
}

const numberArray = (value: unknown, action: string): readonly number[] => {
  if (
    !Array.isArray(value) ||
    !value.every(
      (entry: unknown): entry is number => typeof entry === "number" && Number.isFinite(entry),
    )
  ) {
    throw new AnkiOperationError(`Invalid ${action} response: expected number array`, action);
  }
  return value;
};

const objectRecord = (value: unknown, action: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AnkiOperationError(`Invalid ${action} response: expected object`, action);
  }
  return value as Record<string, unknown>;
};

const countCards = async (port: AnkiPort, query: string): Promise<number> =>
  numberArray(await port.invoke<unknown>("findCards", { query }), "findCards").length;

const stateCounts = async (port: AnkiPort, scope: string): Promise<JsonValue> => {
  const filters = {
    new: "is:new -is:suspended -is:buried",
    learning: "is:learn -is:suspended -is:buried",
    review: "is:review -is:learn -is:suspended -is:buried",
    suspended: "is:suspended",
    buried: "is:buried",
  } as const;
  const result: Record<string, number> = {};
  for (const [name, filter] of Object.entries(filters)) {
    result[name] = await countCards(port, `${scope} ${filter}`);
  }
  return result;
};

export const deckStats = async (
  port: AnkiPort,
  deck: string,
  easeBuckets: readonly number[] = [2, 2.5, 3],
  intervalBuckets: readonly number[] = [7, 21, 90],
): Promise<JsonValue> => {
  try {
    const rawIds = objectRecord(
      await port.invoke<unknown>("deckNamesAndIds", {}),
      "deckNamesAndIds",
    );
    const ids: Record<string, number> = Object.fromEntries(
      Object.entries(rawIds).filter(
        (entry: [string, unknown]): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
    const deckId = ids[deck];
    if (deckId === undefined) throw new Error(`Deck "${deck}" not found`);
    const subtree = Object.keys(ids).filter(
      (name: string): boolean => name === deck || name.startsWith(`${deck}::`),
    );
    const rawStats = objectRecord(
      await port.invoke<unknown>("getDeckStats", { decks: subtree }),
      "getDeckStats",
    );
    const statsAt = (id: number): DeckStatsResponse | undefined => {
      const value = rawStats[String(id)];
      if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
      const source = value as Record<string, unknown>;
      const numeric = (name: string): number => {
        const field = source[name];
        if (field === undefined) return 0;
        if (typeof field !== "number" || !Number.isFinite(field)) {
          throw new AnkiOperationError(`Invalid getDeckStats field: ${name}`, "getDeckStats");
        }
        return field;
      };
      return {
        new_count: numeric("new_count"),
        learn_count: numeric("learn_count"),
        review_count: numeric("review_count"),
        total_in_deck: numeric("total_in_deck"),
      };
    };
    const root = statsAt(deckId);
    if (root === undefined) throw new Error(`Deck "${deck}" not found in statistics response`);
    const total = subtree.reduce((sum: number, name: string): number => {
      const id = ids[name];
      return sum + (id === undefined ? 0 : (statsAt(id)?.total_in_deck ?? 0));
    }, 0);
    const counts = {
      total,
      new: root.new_count ?? 0,
      learning: root.learn_count ?? 0,
      review: root.review_count ?? 0,
      other: Math.max(
        0,
        total - (root.new_count ?? 0) - (root.learn_count ?? 0) - (root.review_count ?? 0),
      ),
    };
    const scope = deckScopeQuery(deck);
    const cards = numberArray(
      await port.invoke<unknown>("findCards", { query: scope }),
      "findCards",
    );
    if (cards.length === 0) {
      return {
        success: true,
        deck,
        counts,
        states: { new: 0, learning: 0, review: 0, suspended: 0, buried: 0 },
        ease: computeDistribution([], easeBuckets),
        intervals: computeDistribution([], intervalBuckets, "d"),
      };
    }
    const states = await stateCounts(port, scope);
    const ease = numberArray(
      await port.invoke<unknown>("getEaseFactors", { cards }),
      "getEaseFactors",
    )
      .map((value: number): number => value / 1000)
      .filter((value: number): boolean => value > 0);
    const intervals = numberArray(
      await port.invoke<unknown>("getIntervals", { cards }),
      "getIntervals",
    ).filter((value: number): boolean => value > 0);
    return {
      success: true,
      deck,
      counts,
      states,
      ease: computeDistribution(ease, easeBuckets),
      intervals: computeDistribution(intervals, intervalBuckets, "d"),
    };
  } catch (error) {
    const details = error instanceof AnkiOperationError ? error.details : undefined;
    throw new AnkiOperationError(
      error instanceof Error ? error.message : String(error),
      "deckStats",
      {
        hint: "Make sure Anki is running and the deck name is valid",
        ...(details === undefined ? {} : { details }),
      },
    );
  }
};
