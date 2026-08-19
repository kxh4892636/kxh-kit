import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import type { AnkiDeckStatsResponse } from "../../types/anki.types";
import {
  emptyCardStateCounts,
  fetchCardStateCounts,
  type CardStateCounts,
  type DueTreeCounts,
} from "../../utils/card-states";
import { getRootDeckNames, rollupDeckTotal } from "../../utils/deck-hierarchy";
import { computeDistribution, type DistributionMetrics } from "../../utils/stats";

export const collectionStatsParamsSchema = z.object({
  easeBuckets: z.array(z.number().positive()).max(20).optional(),
  intervalBuckets: z.array(z.number().positive()).max(20).optional(),
});

export type CollectionStatsParams = z.infer<typeof collectionStatsParamsSchema>;

export interface PerDeckStats {
  deck: string;
  total: number;
  new: number;
  learning: number;
  review: number;
  other: number;
}

export interface CollectionStatsResult {
  total_decks: number;
  counts: DueTreeCounts;
  states: CardStateCounts;
  ease: DistributionMetrics;
  intervals: DistributionMetrics;
  per_deck: PerDeckStats[];
}

/**
 * 全集合统计(上游 collection_stats): counts/per_deck 是今日学习队列,
 * states 是全集合真实状态计数; 集合级 counts 只对根牌组求和避免重复计数。
 */
export const runCollectionStats = async (
  client: AnkiConnectClient,
  params: CollectionStatsParams,
): Promise<CollectionStatsResult> => {
  try {
    const { easeBuckets = [2.0, 2.5, 3.0], intervalBuckets = [7, 21, 90] } = params;

    const deckNamesAndIds = await client.invoke<Record<string, number>>("deckNamesAndIds", {});

    const deckNames = deckNamesAndIds ? Object.keys(deckNamesAndIds) : [];

    if (deckNames.length === 0) {
      return {
        total_decks: 0,
        counts: { total: 0, new: 0, learning: 0, review: 0, other: 0 },
        states: emptyCardStateCounts(),
        ease: computeDistribution([], { boundaries: easeBuckets }),
        intervals: computeDistribution([], {
          boundaries: intervalBuckets,
          unitSuffix: "d",
        }),
        per_deck: [],
      };
    }

    const deckStatsResponse = await client.invoke<Record<string, AnkiDeckStatsResponse>>(
      "getDeckStats",
      { decks: deckNames },
    );

    if (!deckStatsResponse || typeof deckStatsResponse !== "object") {
      throw new Error("Invalid getDeckStats response");
    }

    // total_in_deck 只计直接存放的卡片, 需按子树自行上卷。
    const perDeckOwnTotal = new Map<string, number>();
    const perDeckStats = new Map<string, AnkiDeckStatsResponse>();

    for (const deckName of deckNames) {
      const deckId = deckNamesAndIds[deckName];
      const deckStats = deckId != null ? deckStatsResponse[String(deckId)] : undefined;

      if (!deckStats) {
        perDeckOwnTotal.set(deckName, 0);
        continue;
      }

      perDeckOwnTotal.set(deckName, deckStats.total_in_deck ?? 0);
      perDeckStats.set(deckName, deckStats);
    }

    const per_deck: PerDeckStats[] = [];
    for (const deckName of deckNames) {
      const stats = perDeckStats.get(deckName);
      const newCount = stats?.new_count ?? 0;
      const learning = stats?.learn_count ?? 0;
      const review = stats?.review_count ?? 0;
      const total = rollupDeckTotal(deckName, perDeckOwnTotal);
      const other = Math.max(0, total - newCount - learning - review);

      per_deck.push({
        deck: deckName,
        total,
        new: newCount,
        learning,
        review,
        other,
      });
    }

    const rootDeckNames = new Set(getRootDeckNames(deckNames));
    const counts: DueTreeCounts = {
      total: 0,
      new: 0,
      learning: 0,
      review: 0,
      other: 0,
    };
    for (const entry of per_deck) {
      if (!rootDeckNames.has(entry.deck)) {
        continue;
      }
      counts.total += entry.total;
      counts.new += entry.new;
      counts.learning += entry.learning;
      counts.review += entry.review;
      counts.other += entry.other;
    }

    // 空集合判断只信 findCards(筛选牌组借卡时 total_in_deck 可能为 0)。
    const cardIds = await client.invoke<number[]>("findCards", {
      query: "deck:*",
    });

    if (!cardIds || cardIds.length === 0) {
      return {
        total_decks: deckNames.length,
        counts,
        states: emptyCardStateCounts(),
        ease: computeDistribution([], { boundaries: easeBuckets }),
        intervals: computeDistribution([], {
          boundaries: intervalBuckets,
          unitSuffix: "d",
        }),
        per_deck,
      };
    }

    const states = await fetchCardStateCounts(client);

    const easeFactorsRaw = await client.invoke<number[]>("getEaseFactors", {
      cards: cardIds,
    });

    if (!Array.isArray(easeFactorsRaw)) {
      throw new Error("Invalid getEaseFactors response: expected array");
    }

    const easeValues = easeFactorsRaw.map((e) => e / 1000).filter((e) => e > 0);

    const intervalsRaw = await client.invoke<number[]>("getIntervals", {
      cards: cardIds,
    });

    if (!Array.isArray(intervalsRaw)) {
      throw new Error("Invalid getIntervals response: expected array");
    }

    const intervalValues = intervalsRaw.filter((i) => i > 0);

    const ease = computeDistribution(easeValues, { boundaries: easeBuckets });
    const intervals = computeDistribution(intervalValues, {
      boundaries: intervalBuckets,
      unitSuffix: "d",
    });

    return {
      total_decks: deckNames.length,
      counts,
      states,
      ease,
      intervals,
      per_deck,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "collection_stats",
      hint: "Make sure Anki is running and AnkiConnect is accessible.",
    });
  }
};
