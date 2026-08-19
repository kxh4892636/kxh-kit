import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import type { AnkiCard, SimplifiedCard } from "../../types/anki.types";
import { deckScopeQuery } from "../../utils/card-states";
import { extractRenderedCardContent } from "../../utils/card-content";

export const getDueCardsParamsSchema = z.object({
  deckName: z.string().optional(),
  limit: z.number().min(1).max(50).optional(),
  includeLearning: z.boolean().optional(),
  includeNew: z.boolean().optional(),
});

export type GetDueCardsParams = z.infer<typeof getDueCardsParamsSchema>;

export interface GetDueCardsResult {
  success: boolean;
  cards: SimplifiedCard[];
  total: number;
  returned?: number;
  message: string;
}

/**
 * 拉取到期卡片(上游 get_due_cards)。
 * 查询: -is:suspended (is:due [OR is:learn] [OR is:new]), 牌组名经 deckScopeQuery 转义;
 * include-new 时单独统计 new 子集以诚实计数。
 */
export const runGetDueCards = async (
  client: AnkiConnectClient,
  params: GetDueCardsParams,
): Promise<GetDueCardsResult> => {
  try {
    const { deckName, limit, includeLearning, includeNew } = params;
    const cardLimit = Math.min(limit ?? 10, 50);
    const withLearning = includeLearning ?? true;
    const withNew = includeNew ?? false;

    const states: string[] = ["is:due"];
    if (withLearning) {
      states.push("is:learn");
    }
    if (withNew) {
      states.push("is:new");
    }

    let query = `-is:suspended (${states.join(" OR ")})`;
    if (deckName !== undefined) {
      query = `${deckScopeQuery(deckName)} ${query}`;
    }

    const cardIds = await client.invoke<number[]>("findCards", { query });

    if (cardIds.length === 0) {
      return {
        success: true,
        message: "No cards are due for review",
        cards: [],
        total: 0,
      };
    }

    // include-new 时结果集混合 new 与真正到期卡片, 单独查 new 子集诚实计数
    let newCount = 0;
    if (withNew) {
      let newQuery = "-is:suspended (is:new)";
      if (deckName !== undefined) {
        newQuery = `${deckScopeQuery(deckName)} ${newQuery}`;
      }
      try {
        const newIds = await client.invoke<number[]>("findCards", {
          query: newQuery,
        });
        const resultSet = new Set(cardIds);
        newCount = newIds.filter((id) => resultSet.has(id)).length;
      } catch {
        // 非致命: 降级为全部按到期计
        newCount = 0;
      }
    }
    const dueOnlyCount = cardIds.length - newCount;

    const selectedCardIds = cardIds.slice(0, cardLimit);

    const cardsInfo = await client.invoke<AnkiCard[]>("cardsInfo", {
      cards: selectedCardIds,
    });

    const dueCards: SimplifiedCard[] = cardsInfo.map((card) => {
      const { front, back } = extractRenderedCardContent(card);

      return {
        cardId: card.cardId,
        front,
        back,
        deckName: card.deckName,
        modelName: card.modelName,
        due: card.due || 0,
        interval: card.interval || 0,
        factor: card.factor || 2500,
      };
    });

    const message = withNew
      ? `Found ${cardIds.length} cards (${newCount} new, ${dueOnlyCount} due), returning ${dueCards.length}`
      : `Found ${cardIds.length} due cards, returning ${dueCards.length}`;

    const result: GetDueCardsResult = {
      success: true,
      cards: dueCards,
      total: cardIds.length,
      returned: dueCards.length,
      message,
    };

    return result;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "get_due_cards",
    });
  }
};
