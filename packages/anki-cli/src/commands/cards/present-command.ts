import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import type { AnkiCard, CardPresentation } from "../../types/anki.types";
import { extractRenderedCardContent, getCardType } from "../../utils/card-content";

export const presentCardParamsSchema = z.object({
  cardId: z.number().positive(),
  showAnswer: z.boolean().optional(),
});

export type PresentCardParams = z.infer<typeof presentCardParamsSchema>;

export interface PresentCardResult {
  success: boolean;
  card: CardPresentation;
  instruction: string;
}

/**
 * 呈现单张卡片(上游 present_card)。渲染内容按卡片模板方向提取
 * (反转卡/cloze 正确渲染); show-answer 时才带背面。
 */
export const runPresentCard = async (
  client: AnkiConnectClient,
  params: PresentCardParams,
): Promise<PresentCardResult> => {
  try {
    const { cardId } = params;
    const showAnswer = params.showAnswer ?? false;

    const cardsInfo = await client.invoke<AnkiCard[]>("cardsInfo", {
      cards: [cardId],
    });

    if (!cardsInfo || cardsInfo.length === 0) {
      throw new JsonError(`Card with ID ${cardId} not found`, {
        action: "present_card",
        details: { cardId },
      });
    }

    const card = cardsInfo[0]!;
    const { front, back } = extractRenderedCardContent(card);
    const cardType = getCardType(card.type);

    const presentation: CardPresentation = {
      cardId: card.cardId,
      front,
      deckName: card.deckName,
      modelName: card.modelName,
      tags: card.tags || [],
      currentInterval: card.interval || 0,
      easeFactor: card.factor || 2500,
      reviews: card.reps || 0,
      lapses: card.lapses || 0,
      cardType,
      noteId: card.note,
    };

    if (showAnswer) {
      presentation.back = back;
    }

    const instruction = !showAnswer
      ? "Question shown. Wait for user's answer, then use --answer"
      : "Answer revealed. Evaluate response and suggest rating, then wait for user confirmation";

    return {
      success: true,
      card: presentation,
      instruction,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "present_card",
      details: { cardId: params.cardId },
    });
  }
};
