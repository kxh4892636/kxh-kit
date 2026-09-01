import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { ankiCardArrayResponse, numberArrayResponse, parseResponse } from "../responses";
import { deckScopeQuery, extractRenderedCardContent, type SimplifiedCard } from "./card-domain";

export const cardStates = ["due", "new", "learning", "suspended", "buried"] as const;
export type CardState = (typeof cardStates)[number];
export const getCardsParamsSchema = z.object({
  deckName: z.string().min(1).optional(),
  cardState: z.enum(cardStates).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type GetCardsParams = z.infer<typeof getCardsParamsSchema>;

export interface GetCardsResult {
  readonly success: boolean;
  readonly cards: readonly SimplifiedCard[];
  readonly total: number;
  readonly returned?: number;
  readonly message: string;
}

const stateQueries: Readonly<Record<CardState, string>> = {
  due: "is:due",
  new: "is:new",
  learning: "is:learn",
  suspended: "is:suspended",
  buried: "is:buried",
};

export const runGetCards = async (
  port: AnkiPort,
  params: GetCardsParams,
): Promise<GetCardsResult> => {
  try {
    const state = params.cardState ?? "due";
    const scope = params.deckName === undefined ? "" : `${deckScopeQuery(params.deckName)} `;
    const query = `${scope}${state === "suspended" ? "" : "-is:suspended "}${stateQueries[state]}`;
    const cardIds = parseResponse(
      "findCards",
      numberArrayResponse,
      await port.invoke<unknown>("findCards", { query }),
    );
    if (cardIds === null || cardIds.length === 0) {
      return { success: true, message: `No ${state} cards found`, cards: [], total: 0 };
    }
    const selected = cardIds.slice(0, Math.min(params.limit ?? 10, 50));
    const cards = parseResponse(
      "cardsInfo",
      ankiCardArrayResponse,
      await port.invoke<unknown>("cardsInfo", { cards: selected }),
    ).map((card: z.infer<typeof ankiCardArrayResponse>[number]): SimplifiedCard => {
      const { front, back } = extractRenderedCardContent(card);
      return {
        cardId: card.cardId,
        front,
        back,
        deckName: card.deckName,
        modelName: card.modelName,
        due: card.due ?? 0,
        interval: card.interval ?? 0,
        factor: card.factor ?? 2500,
      };
    });
    return {
      success: true,
      cards,
      total: cardIds.length,
      returned: cards.length,
      message: `Found ${cardIds.length} ${state} cards, returning ${cards.length}`,
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "get_cards",
    });
  }
};
