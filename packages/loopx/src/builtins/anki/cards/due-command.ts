import { z } from "zod";
import { JsonError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { ankiCardArrayResponse, numberArrayResponse, parseResponse } from "../responses";
import { deckScopeQuery, extractRenderedCardContent, type SimplifiedCard } from "./card-domain";

export const getDueCardsParamsSchema = z.object({
  deckName: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  includeLearning: z.boolean().optional(),
  includeNew: z.boolean().optional(),
});
export type GetDueCardsParams = z.infer<typeof getDueCardsParamsSchema>;

export interface GetDueCardsResult {
  readonly success: boolean;
  readonly cards: readonly SimplifiedCard[];
  readonly total: number;
  readonly returned?: number;
  readonly message: string;
}

const simplifyCard = (card: z.infer<typeof ankiCardArrayResponse>[number]): SimplifiedCard => {
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
};

export const runGetDueCards = async (
  port: AnkiPort,
  params: GetDueCardsParams,
  logger?: Logger,
): Promise<GetDueCardsResult> => {
  try {
    const { deckName } = params;
    const withNew = params.includeNew ?? false;
    const states = [
      "is:due",
      ...(params.includeLearning === false ? [] : ["is:learn"]),
      ...(withNew ? ["is:new"] : []),
    ];
    const scope = deckName === undefined ? "" : `${deckScopeQuery(deckName)} `;
    const query = `${scope}-is:suspended (${states.join(" OR ")})`;
    const cardIds = parseResponse(
      "findCards",
      numberArrayResponse,
      await port.invoke<unknown>("findCards", { query }),
    );
    if (cardIds === null || cardIds.length === 0) {
      return { success: true, message: "No cards are due for review", cards: [], total: 0 };
    }
    let newCount = 0;
    if (withNew) {
      try {
        const newIds = parseResponse(
          "findCards",
          numberArrayResponse,
          await port.invoke<unknown>("findCards", { query: `${scope}-is:suspended (is:new)` }),
        );
        const resultSet = new Set(cardIds);
        newCount = (newIds ?? []).filter((id: number): boolean => resultSet.has(id)).length;
      } catch (error: unknown) {
        logger?.warn(
          `Unable to classify new cards: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const selected = cardIds.slice(0, Math.min(params.limit ?? 10, 50));
    const cards = parseResponse(
      "cardsInfo",
      ankiCardArrayResponse,
      await port.invoke<unknown>("cardsInfo", { cards: selected }),
    ).map(simplifyCard);
    const dueCount = cardIds.length - newCount;
    return {
      success: true,
      cards,
      total: cardIds.length,
      returned: cards.length,
      message: withNew
        ? `Found ${cardIds.length} cards (${newCount} new, ${dueCount} due), returning ${cards.length}`
        : `Found ${cardIds.length} due cards, returning ${cards.length}`,
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "get_due_cards",
    });
  }
};
