import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import {
  booleanResponse,
  cardPresenceArrayResponse,
  cardScheduleArrayResponse,
  parseResponse,
} from "../responses";
import { getRatingDescription } from "./card-domain";

export const rateCardParamsSchema = z.object({
  cardId: z.number().int().positive(),
  rating: z.number().int().min(1).max(4),
});
export type RateCardParams = z.infer<typeof rateCardParamsSchema>;

export interface RateCardResult {
  readonly success: boolean;
  readonly cardId: number;
  readonly rating: number;
  readonly ratingDescription: string;
  readonly message: string;
  readonly nextReview: {
    readonly interval: number;
    readonly due: number;
    readonly factor: number;
  } | null;
}

export const runRateCard = async (
  port: AnkiPort,
  params: RateCardParams,
): Promise<RateCardResult> => {
  try {
    const existing = parseResponse(
      "cardsInfo",
      cardPresenceArrayResponse,
      await port.invoke<unknown>("cardsInfo", { cards: [params.cardId] }),
    );
    if (existing[0]?.cardId === undefined) {
      throw new JsonError(
        `Card ID ${params.cardId} does not exist in the Anki collection. Cannot rate.`,
        {
          action: "rate_card",
          details: { cardId: params.cardId, attemptedRating: params.rating },
          hint: "Verify the card ID with cards due or notes find before rating",
        },
      );
    }
    const answered = parseResponse(
      "answerCards",
      booleanResponse,
      await port.invoke<unknown>("answerCards", {
        answers: [{ cardId: params.cardId, ease: params.rating }],
      }),
    );
    if (!answered) throw new Error(`Failed to rate card ${params.cardId}`);
    const schedule = parseResponse(
      "cardsInfo",
      cardScheduleArrayResponse,
      await port.invoke<unknown>("cardsInfo", { cards: [params.cardId] }),
    )[0];
    const description = getRatingDescription(params.rating);
    return {
      success: true,
      cardId: params.cardId,
      rating: params.rating,
      ratingDescription: description,
      message: `Card successfully rated as ${description}`,
      nextReview:
        schedule === undefined
          ? null
          : {
              interval: schedule.interval ?? 0,
              due: schedule.due ?? 0,
              factor: schedule.factor ?? 2500,
            },
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "rate_card",
      details: { cardId: params.cardId, attemptedRating: params.rating },
      hint: "Make sure Anki is running and the card exists",
    });
  }
};
