import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import { getRatingDescription } from "../../utils/card-content";

export const rateCardParamsSchema = z.object({
  cardId: z.number().positive(),
  rating: z.number().min(1).max(4),
});

export type RateCardParams = z.infer<typeof rateCardParamsSchema>;

export interface RateCardResult {
  success: boolean;
  cardId: number;
  rating: number;
  ratingDescription: string;
  message: string;
  nextReview: {
    interval: number;
    due: number;
    factor: number;
  } | null;
}

/**
 * 提交评分更新调度(上游 rate_card)。
 * answerCards 对不存在的 ID 也返回 true, 故先经 cardsInfo 预检。
 */
export const runRateCard = async (
  client: AnkiConnectClient,
  params: RateCardParams,
): Promise<RateCardResult> => {
  try {
    const { cardId, rating } = params;

    if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
      throw new JsonError("Invalid rating. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)", {
        action: "rate_card",
        details: { cardId, attemptedRating: rating },
      });
    }

    const existingInfo = await client.invoke<Array<{ cardId?: number }>>("cardsInfo", {
      cards: [cardId],
    });

    const found = existingInfo?.[0] && typeof existingInfo[0].cardId === "number";

    if (!found) {
      throw new JsonError(`Card ID ${cardId} does not exist in the Anki collection. Cannot rate.`, {
        action: "rate_card",
        details: { cardId, attemptedRating: rating },
        hint: "Verify the card ID with cards due or notes find before rating",
      });
    }

    const result = await client.invoke<boolean>("answerCards", {
      answers: [{ cardId, ease: rating }],
    });

    if (!result) {
      throw new Error(`Failed to rate card ${cardId}`);
    }

    const ratingDesc = getRatingDescription(rating);

    const cardsInfo = await client.invoke<Array<Record<string, unknown>>>("cardsInfo", {
      cards: [cardId],
    });

    let nextReview: RateCardResult["nextReview"] = null;
    if (cardsInfo && cardsInfo.length > 0) {
      const card = cardsInfo[0]!;
      nextReview = {
        interval: (card["interval"] as number) || 0,
        due: (card["due"] as number) || 0,
        factor: (card["factor"] as number) || 2500,
      };
    }

    return {
      success: true,
      cardId,
      rating,
      ratingDescription: ratingDesc,
      message: `Card successfully rated as ${ratingDesc}`,
      nextReview,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "rate_card",
      details: { cardId: params.cardId, attemptedRating: params.rating },
      hint: "Make sure Anki is running and the card exists",
    });
  }
};
