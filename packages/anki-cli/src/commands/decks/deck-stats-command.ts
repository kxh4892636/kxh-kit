import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import type { AnkiDeckStatsResponse } from "../../types/anki.types";
import {
  emptyCardStateCounts,
  fetchCardStateCounts,
  deckScopeQuery,
  type CardStateCounts,
  type DueTreeCounts,
} from "../../utils/card-states";
import { isDescendantOf } from "../../utils/deck-hierarchy";
import { computeDistribution, type DistributionMetrics } from "../../utils/stats";

export const deckStatsParamsSchema = z.object({
  deck: z.string().min(1),
  easeBuckets: z.array(z.number().positive()).max(20).optional(),
  intervalBuckets: z.array(z.number().positive()).max(20).optional(),
});

export type DeckStatsParams = z.infer<typeof deckStatsParamsSchema>;

/**
 * 单牌组统计的两个视角(上游 deckStats), 刻意分开:
 * - counts: 今日学习队列(getDeckStats 调度器 due tree, 受每日上限);
 * - states: 搜索派生的真实卡片状态计数, 不受到期日与上限影响。
 * 两者都上卷子孙牌组。
 */
export interface DeckStatsResult {
  success: boolean;
  deck: string;
  counts: DueTreeCounts;
  states: CardStateCounts;
  ease: DistributionMetrics;
  intervals: DistributionMetrics;
}

export const runDeckStats = async (
  client: AnkiConnectClient,
  params: DeckStatsParams,
): Promise<DeckStatsResult> => {
  try {
    const { deck, easeBuckets = [2.0, 2.5, 3.0], intervalBuckets = [7, 21, 90] } = params;

    // 1. 牌组名 → ID, 并枚举子孙(getDeckStats.total_in_deck 只计直接存放的卡片,
    //    调度器桶却已上卷, 故 total 需按子树求和保持算术一致)。
    const deckNamesAndIds = await client.invoke<Record<string, number>>("deckNamesAndIds", {});
    const deckId = deckNamesAndIds?.[deck];

    if (deckId == null) {
      throw new Error(`Deck "${deck}" not found`);
    }

    const subtreeDeckNames = Object.keys(deckNamesAndIds).filter(
      (name) => name === deck || isDescendantOf(name, deck),
    );

    // 2. getDeckStats(整棵子树)
    const deckStatsResponse = await client.invoke<Record<string, AnkiDeckStatsResponse>>(
      "getDeckStats",
      { decks: subtreeDeckNames },
    );

    const rootDeckStats = deckStatsResponse?.[String(deckId)];

    if (!rootDeckStats) {
      throw new Error(`Deck "${deck}" not found in statistics response`);
    }

    const newCount = rootDeckStats.new_count || 0;
    const learning = rootDeckStats.learn_count || 0;
    const review = rootDeckStats.review_count || 0;

    let total = 0;
    for (const descendantName of subtreeDeckNames) {
      const descId = deckNamesAndIds[descendantName];
      const descStats = descId != null ? deckStatsResponse?.[String(descId)] : undefined;
      total += descStats?.total_in_deck ?? 0;
    }

    // other 是残差而非卡片状态(今日到期且受上限的三个桶 vs 全部卡片)。
    const other = Math.max(0, total - newCount - learning - review);

    const counts: DueTreeCounts = {
      total,
      new: newCount,
      learning,
      review,
      other,
    };

    // 3. deck: 查询覆盖整棵子树(含被筛选牌组借入的卡片)。
    //    注意: 空牌组判断只信 findCards, total 不可信(筛选牌组借卡时可为 0)。
    const deckScope = deckScopeQuery(deck);
    const cardIds = await client.invoke<number[]>("findCards", {
      query: deckScope,
    });

    if (cardIds != null && !Array.isArray(cardIds)) {
      throw new Error("Invalid findCards response: expected array");
    }

    if (!cardIds || cardIds.length === 0) {
      return {
        success: true,
        deck,
        counts,
        states: emptyCardStateCounts(),
        ease: computeDistribution([], { boundaries: easeBuckets }),
        intervals: computeDistribution([], {
          boundaries: intervalBuckets,
          unitSuffix: "d",
        }),
      };
    }

    // 4. 真实卡片状态计数(5 次 findCards)。
    const states = await fetchCardStateCounts(client, deckScope);

    // 5. 难度系数(除以 1000, 过滤无效值 0=新卡)。
    const easeFactorsRaw = await client.invoke<number[]>("getEaseFactors", {
      cards: cardIds,
    });

    if (!Array.isArray(easeFactorsRaw)) {
      throw new Error("Invalid getEaseFactors response: expected array");
    }

    const easeValues = easeFactorsRaw.map((e) => e / 1000).filter((e) => e > 0);

    // 6. 间隔(过滤负数 = 学习中的卡片, 单位秒)。
    const intervalsRaw = await client.invoke<number[]>("getIntervals", {
      cards: cardIds,
    });

    if (!Array.isArray(intervalsRaw)) {
      throw new Error("Invalid getIntervals response: expected array");
    }

    const intervalValues = intervalsRaw.filter((i) => i > 0);

    // 7. 分布计算
    const ease = computeDistribution(easeValues, {
      boundaries: easeBuckets,
    });

    const intervals = computeDistribution(intervalValues, {
      boundaries: intervalBuckets,
      unitSuffix: "d",
    });

    return {
      success: true,
      deck,
      counts,
      states,
      ease,
      intervals,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "deckStats",
      hint: "Make sure Anki is running and the deck name is valid",
    });
  }
};
