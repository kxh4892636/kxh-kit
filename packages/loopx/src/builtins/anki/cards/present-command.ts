import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { ankiCardArrayResponse, parseResponse } from "../responses";
import { extractRenderedCardContent, getCardType, type CardPresentation } from "./card-domain";

export const presentCardParamsSchema = z.object({
  cardId: z.number().int().positive(),
  showAnswer: z.boolean().optional(),
});
export type PresentCardParams = z.infer<typeof presentCardParamsSchema>;

export interface PresentCardResult {
  readonly success: boolean;
  readonly card: CardPresentation;
  readonly instruction: string;
}

export const runPresentCard = async (
  port: AnkiPort,
  params: PresentCardParams,
): Promise<PresentCardResult> => {
  try {
    const cards = parseResponse(
      "cardsInfo",
      ankiCardArrayResponse,
      await port.invoke<unknown>("cardsInfo", { cards: [params.cardId] }),
    );
    if (cards.length === 0) {
      throw new JsonError(`Card with ID ${params.cardId} not found`, {
        action: "present_card",
        details: { cardId: params.cardId },
      });
    }
    const card = cards[0]!;
    const { front, back } = extractRenderedCardContent(card);
    const presentation: CardPresentation = {
      cardId: card.cardId,
      front,
      deckName: card.deckName,
      modelName: card.modelName,
      tags: card.tags ?? [],
      currentInterval: card.interval ?? 0,
      easeFactor: card.factor ?? 2500,
      reviews: card.reps ?? 0,
      lapses: card.lapses ?? 0,
      cardType: getCardType(card.type),
      noteId: card.note,
      ...(params.showAnswer === true ? { back } : {}),
    };
    return {
      success: true,
      card: presentation,
      instruction:
        params.showAnswer === true
          ? "Answer revealed. Evaluate response and suggest rating, then wait for user confirmation"
          : "Question shown. Wait for user's answer, then use --answer",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "present_card",
      details: { cardId: params.cardId },
    });
  }
};
