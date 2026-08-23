import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { parseResponse } from "../responses";
import { retention, streak } from "./stat-metrics";

const MS_PER_DAY = 86_400_000;
const reviewTuple = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
const reviewTuples = z.array(reviewTuple);
const reviewRecord = z
  .object({
    id: z.number(),
    ease: z.number(),
    usn: z.number().optional(),
    ivl: z.number().optional(),
    lastIvl: z.number().optional(),
    factor: z.number().optional(),
    time: z.number().optional(),
    type: z.number().optional(),
  })
  .passthrough();
const collectionReviewsResponse = z.record(z.string(), z.array(reviewRecord));
const cardIdsResponse = z.array(z.number());
type ReviewTuple = z.infer<typeof reviewTuple>;

const collectionReviews = async (
  port: AnkiPort,
  start: number,
): Promise<readonly ReviewTuple[]> => {
  const cards = parseResponse(
    "findCards",
    cardIdsResponse,
    await port.invoke<unknown>("findCards", { query: "deck:*" }),
  );
  if (cards.length === 0) return [];
  const byCard = parseResponse(
    "getReviewsOfCards",
    collectionReviewsResponse,
    await port.invoke<unknown>("getReviewsOfCards", { cards }),
  );
  const tuples: ReviewTuple[] = [];
  for (const [cardId, reviews] of Object.entries(byCard)) {
    for (const review of reviews)
      if (review.id > start)
        tuples.push([
          review.id,
          Number(cardId),
          review.usn ?? 0,
          review.ease,
          review.ivl ?? 0,
          review.lastIvl ?? 0,
          review.factor ?? 0,
          review.time ?? 0,
          review.type ?? 0,
        ]);
  }
  return tuples;
};

const aggregate = (
  reviews: readonly ReviewTuple[],
  start: string,
  end: string,
  deck: string,
  today: Date,
): JsonValue => {
  const byDate = new Map<string, number>();
  for (const review of reviews) {
    const date = new Date(review[0]).toISOString().slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  const days = [...byDate.entries()]
    .map(([date, count]: [string, number]): { date: string; count: number } => ({ date, count }))
    .sort((left: { date: string }, right: { date: string }): number =>
      left.date.localeCompare(right.date),
    );
  const total = days.reduce((sum: number, day: { count: number }): number => sum + day.count, 0);
  const maxDay =
    days.length === 0
      ? null
      : days.reduce(
          (
            best: { date: string; count: number },
            day: { date: string; count: number },
          ): { date: string; count: number } => (day.count > best.count ? day : best),
        );
  const minDay =
    days.length === 0
      ? null
      : days.reduce(
          (
            best: { date: string; count: number },
            day: { date: string; count: number },
          ): { date: string; count: number } => (day.count < best.count ? day : best),
        );
  return {
    period: { start, end },
    deck,
    reviews_by_day: days,
    summary: {
      total_reviews: total,
      average_per_day: days.length === 0 ? 0 : total / days.length,
      days_studied: days.length,
      max_day: maxDay,
      min_day: minDay,
      streak: streak(days, today),
    },
    retention: retention(reviews.map((review: ReviewTuple): number => review[3])),
  };
};

export const reviewStats = async (
  port: AnkiPort,
  startDate: string,
  endDate: string,
  deck: string | undefined,
  today: Date,
): Promise<JsonValue> => {
  try {
    const start = Date.parse(startDate);
    const end = Date.parse(endDate) + MS_PER_DAY;
    const reviews =
      deck === undefined
        ? await collectionReviews(port, start)
        : parseResponse(
            "cardReviews",
            reviewTuples,
            await port.invoke<unknown>("cardReviews", { startID: start, deck }),
          );
    return aggregate(
      reviews.filter((review: ReviewTuple): boolean => review[0] <= end),
      startDate,
      endDate,
      deck ?? "All Decks",
      today,
    );
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "review_stats",
      hint: "Make sure Anki is running and date format is YYYY-MM-DD. Use decks list to verify deck name if filtering by deck.",
    });
  }
};
