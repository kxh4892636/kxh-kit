import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import type { AnkiCard, SimplifiedCard } from "../../types/anki.types";
import { deckScopeQuery } from "../../utils/card-states";
import { extractRenderedCardContent } from "../../utils/card-content";

export const CARD_STATE = {
  due: "due",
  new: "new",
  learning: "learning",
  suspended: "suspended",
  buried: "buried",
} as const;

export type CardState = (typeof CARD_STATE)[keyof typeof CARD_STATE];

export const getCardsParamsSchema = z.object({
  deckName: z.string().optional(),
  cardState: z.enum(["due", "new", "learning", "suspended", "buried"]).optional(),
  limit: z.number().min(1).max(50).optional(),
});

export type GetCardsParams = z.infer<typeof getCardsParamsSchema>;

export interface GetCardsResult {
  success: boolean;
  cards: SimplifiedCard[];
  total: number;
  returned?: number;
  message: string;
}

const CARD_STATE_QUERY_MAP: Record<CardState, string> = {
  due: "is:due",
  new: "is:new",
  learning: "is:learn",
  suspended: "is:suspended",
  buried: "is:buried",
};

/**
 * 按状态过滤拉取卡片(上游 get_cards)。
 * 非 suspended 状态加 -is:suspended 前缀; 牌组名经 deckScopeQuery 转义。
 */
export const runGetCards = async (
  client: AnkiConnectClient,
  params: GetCardsParams,
): Promise<GetCardsResult> => {
  try {
    const { deckName, cardState, limit } = params;
    const state = cardState ?? "due";
    const cardLimit = Math.min(limit ?? 10, 50);

    const stateQuery = CARD_STATE_QUERY_MAP[state];
    const excludeSuspended = state !== "suspended" ? "-is:suspended " : "";
    let query = `${excludeSuspended}${stateQuery}`;

    if (deckName !== undefined) {
      query = `${deckScopeQuery(deckName)} ${query}`;
    }

    const cardIds = await client.invoke<number[]>("findCards", { query });

    if (cardIds.length === 0) {
      return {
        success: true,
        message: `No ${state} cards found`,
        cards: [],
        total: 0,
      };
    }

    const selectedCardIds = cardIds.slice(0, cardLimit);

    const cardsInfo = await client.invoke<AnkiCard[]>("cardsInfo", {
      cards: selectedCardIds,
    });

    const cards: SimplifiedCard[] = cardsInfo.map((card) => {
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

    return {
      success: true,
      cards,
      total: cardIds.length,
      returned: cards.length,
      message: `Found ${cardIds.length} ${state} cards, returning ${cards.length}`,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "get_cards",
    });
  }
};
