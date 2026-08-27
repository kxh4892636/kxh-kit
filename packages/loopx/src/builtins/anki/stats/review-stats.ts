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
interface ReviewEntry {
  readonly ease: number;
  readonly id: number;
}

const collectionReviews = async (
  port: AnkiPort,
  start: number,
): Promise<readonly ReviewEntry[]> => {
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
  const entries: ReviewEntry[] = [];
  for (const reviews of Object.values(byCard)) {
    for (const review of reviews)
      if (review.id > start) entries.push({ ease: review.ease, id: review.id });
  }
  return entries;
};

const aggregate = (
  reviews: readonly ReviewEntry[],
  start: string,
  end: string,
  deck: string,
  today: Date,
): JsonValue => {
  const byDate = new Map<string, number>();
  for (const review of reviews) {
    const date = new Date(review.id).toISOString().slice(0, 10);
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
    retention: retention(reviews.map((review: ReviewEntry): number => review.ease)),
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
          ).map((review: ReviewTuple): ReviewEntry => ({ ease: review[3], id: review[0] }));
    return aggregate(
      reviews.filter((review: ReviewEntry): boolean => review.id <= end),
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
