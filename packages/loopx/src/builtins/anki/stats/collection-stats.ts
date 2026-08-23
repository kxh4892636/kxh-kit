import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { parseResponse } from "../responses";
import { distribution } from "./stat-metrics";

const deckNamesResponse = z.record(z.string(), z.number());
const deckStat = z
  .object({
    new_count: z.number().optional(),
    learn_count: z.number().optional(),
    review_count: z.number().optional(),
    total_in_deck: z.number().optional(),
  })
  .passthrough();
const deckStatsResponse = z.record(z.string(), deckStat);
const numbersResponse = z.array(z.number());

type StateCounts = {
  buried: number;
  learning: number;
  new: number;
  review: number;
  suspended: number;
};
type PerDeck = {
  deck: string;
  learning: number;
  new: number;
  other: number;
  review: number;
  total: number;
};

const emptyStates = (): StateCounts => ({
  new: 0,
  learning: 0,
  review: 0,
  suspended: 0,
  buried: 0,
});
const rollupTotal = (deck: string, ownTotals: ReadonlyMap<string, number>): number => {
  let total = ownTotals.get(deck) ?? 0;
  for (const [name, own] of ownTotals) if (name.startsWith(`${deck}::`)) total += own;
  return total;
};
const buildPerDeck = (
  names: readonly string[],
  ids: Readonly<Record<string, number>>,
  stats: Readonly<Record<string, z.infer<typeof deckStat>>>,
): readonly PerDeck[] => {
  const ownTotals = new Map(
    names.map((name: string): readonly [string, number] => [
      name,
      stats[String(ids[name])]?.total_in_deck ?? 0,
    ]),
  );
  return names.map((deck: string): PerDeck => {
    const current = stats[String(ids[deck])];
    const total = rollupTotal(deck, ownTotals);
    const fresh = current?.new_count ?? 0;
    const learning = current?.learn_count ?? 0;
    const review = current?.review_count ?? 0;
    return {
      deck,
      total,
      new: fresh,
      learning,
      review,
      other: Math.max(0, total - fresh - learning - review),
    };
  });
};
const rootCounts = (entries: readonly PerDeck[]): Record<string, number> =>
  entries
    .filter((entry: PerDeck): boolean => !entry.deck.includes("::"))
    .reduce(
      (counts: Record<string, number>, entry: PerDeck): Record<string, number> => ({
        total: counts["total"]! + entry.total,
        new: counts["new"]! + entry.new,
        learning: counts["learning"]! + entry.learning,
        review: counts["review"]! + entry.review,
        other: counts["other"]! + entry.other,
      }),
      { total: 0, new: 0, learning: 0, review: 0, other: 0 },
    );

const stateQueries = [
  ["new", "is:new -is:suspended -is:buried"],
  ["learning", "is:learn -is:suspended -is:buried"],
  ["review", "is:review -is:learn -is:suspended -is:buried"],
  ["suspended", "is:suspended"],
  ["buried", "is:buried"],
] as const;
const fetchStates = async (port: AnkiPort): Promise<StateCounts> => {
  const counts = emptyStates();
  for (const [state, query] of stateQueries) {
    counts[state] = parseResponse(
      "findCards",
      numbersResponse,
      await port.invoke<unknown>("findCards", { query }),
    ).length;
  }
  return counts;
};

const emptyResult = (
  names: readonly string[],
  perDeck: readonly PerDeck[],
  easeBuckets: readonly number[],
  intervalBuckets: readonly number[],
): JsonValue => ({
  total_decks: names.length,
  counts: rootCounts(perDeck),
  states: emptyStates(),
  ease: distribution([], easeBuckets),
  intervals: distribution([], intervalBuckets, "d"),
  per_deck: perDeck,
});

export const collectionStats = async (
  port: AnkiPort,
  easeBuckets: readonly number[] = [2, 2.5, 3],
  intervalBuckets: readonly number[] = [7, 21, 90],
): Promise<JsonValue> => {
  try {
    const ids = parseResponse(
      "deckNamesAndIds",
      deckNamesResponse,
      await port.invoke<unknown>("deckNamesAndIds", {}),
    );
    const names = Object.keys(ids);
    if (names.length === 0) return emptyResult([], [], easeBuckets, intervalBuckets);
    const stats = parseResponse(
      "getDeckStats",
      deckStatsResponse,
      await port.invoke<unknown>("getDeckStats", { decks: names }),
    );
    const perDeck = buildPerDeck(names, ids, stats);
    const cards = parseResponse(
      "findCards",
      numbersResponse,
      await port.invoke<unknown>("findCards", { query: "deck:*" }),
    );
    if (cards.length === 0) return emptyResult(names, perDeck, easeBuckets, intervalBuckets);
    const states = await fetchStates(port);
    const ease = parseResponse(
      "getEaseFactors",
      numbersResponse,
      await port.invoke<unknown>("getEaseFactors", { cards }),
    )
      .map((value: number): number => value / 1000)
      .filter((value: number): boolean => value > 0);
    const intervals = parseResponse(
      "getIntervals",
      numbersResponse,
      await port.invoke<unknown>("getIntervals", { cards }),
    ).filter((value: number): boolean => value > 0);
    return {
      total_decks: names.length,
      counts: rootCounts(perDeck),
      states,
      ease: distribution(ease, easeBuckets),
      intervals: distribution(intervals, intervalBuckets, "d"),
      per_deck: perDeck,
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "collection_stats",
      hint: "Make sure Anki is running and AnkiConnect is accessible.",
    });
  }
};
