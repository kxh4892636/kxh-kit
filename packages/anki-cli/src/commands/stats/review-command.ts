import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import { calculateStreak, computeRetention } from "../../utils/stats";

const MS_PER_DAY = 86400000;

export const reviewStatsParamsSchema = z
  .object({
    deck: z.string().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((date) => !Number.isNaN(Date.parse(date))),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((date) => !Number.isNaN(Date.parse(date)))
      .optional(),
  })
  .refine(
    (data) => data.endDate === undefined || new Date(data.startDate) <= new Date(data.endDate),
    { message: "start_date must be less than or equal to end_date" },
  );

export type ReviewStatsParams = z.infer<typeof reviewStatsParamsSchema>;

type CardReviewTuple = [number, number, number, number, number, number, number, number, number];

export interface ReviewStatsResult {
  period: { start: string; end: string };
  deck: string;
  reviews_by_day: Array<{ date: string; count: number }>;
  summary: {
    total_reviews: number;
    average_per_day: number;
    days_studied: number;
    max_day: { date: string; count: number } | null;
    min_day: { date: string; count: number } | null;
    streak: number;
  };
  retention: {
    overall: number;
    by_rating: { again: number; hard: number; good: number; easy: number };
  };
}

const getTodayISO = (): string => new Date().toISOString().split("T")[0]!;

/**
 * 复习历史统计(上游 review_stats): 时间模式/保持率/连续学习天数。
 * deck 缺省分析全集合; 指定 deck 时用 cardReviews(精确牌组, 不含子牌组)。
 */
export const runReviewStats = async (
  client: AnkiConnectClient,
  params: ReviewStatsParams,
): Promise<ReviewStatsResult> => {
  try {
    const { startDate } = params;
    const deck = params.deck !== undefined && params.deck !== "" ? params.deck : undefined;
    const deckLabel = deck ?? "All Decks";
    const endDate = params.endDate ?? getTodayISO();

    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate).getTime() + MS_PER_DAY;

    const reviews =
      deck !== undefined
        ? await client.invoke<CardReviewTuple[]>("cardReviews", {
            startID: startTimestamp,
            deck,
          })
        : await fetchCollectionReviews(client, startTimestamp);

    const filteredReviews = reviews.filter((review) => review[0] <= endTimestamp);

    const reviewsByDayMap = new Map<string, number>();

    for (const review of filteredReviews) {
      const date = new Date(review[0]).toISOString().split("T")[0]!;
      reviewsByDayMap.set(date, (reviewsByDayMap.get(date) ?? 0) + 1);
    }

    const reviewsByDay = Array.from(reviewsByDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const buttonPresses = filteredReviews.map((review) => review[3]);

    const retention = computeRetention(buttonPresses);

    const totalReviews = reviewsByDay.reduce((sum, r) => sum + r.count, 0);
    const daysStudied = reviewsByDay.filter((r) => r.count > 0).length;
    const averagePerDay = reviewsByDay.length > 0 ? totalReviews / reviewsByDay.length : 0;

    const nonZeroDays = reviewsByDay.filter((r) => r.count > 0);
    const maxDay =
      nonZeroDays.length > 0
        ? nonZeroDays.reduce((max, r) => (r.count > max.count ? r : max))
        : null;
    const minDay =
      nonZeroDays.length > 0
        ? nonZeroDays.reduce((min, r) => (r.count < min.count ? r : min))
        : null;

    const streak = calculateStreak(reviewsByDay);

    return {
      period: { start: startDate, end: endDate },
      deck: deckLabel,
      reviews_by_day: reviewsByDay,
      summary: {
        total_reviews: totalReviews,
        average_per_day: averagePerDay,
        days_studied: daysStudied,
        max_day: maxDay,
        min_day: minDay,
        streak,
      },
      retention,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "review_stats",
      hint: "Make sure Anki is running and date format is YYYY-MM-DD. Use decks list to verify deck name if filtering by deck.",
    });
  }
};

// 全集合路径: cardReviews 需要精确牌组名, 无法回答「全部」,
// 故列出全部卡片(getReviewsOfCards)并归一化为同一 tuple 布局。
const fetchCollectionReviews = async (
  client: AnkiConnectClient,
  startTimestamp: number,
): Promise<CardReviewTuple[]> => {
  const cardIds = await client.invoke<number[]>("findCards", {
    query: "deck:*",
  });

  if (!cardIds || cardIds.length === 0) {
    return [];
  }

  const reviewsByCard = await client.invoke<Record<string, Array<Record<string, number>>>>(
    "getReviewsOfCards",
    { cards: cardIds },
  );

  const tuples: CardReviewTuple[] = [];
  for (const [cardId, cardReviews] of Object.entries(reviewsByCard)) {
    const cid = Number(cardId);
    for (const r of cardReviews) {
      if ((r["id"] ?? 0) <= startTimestamp) {
        continue;
      }
      tuples.push([
        r["id"] ?? 0,
        cid,
        r["usn"] ?? 0,
        r["ease"] ?? 0,
        r["ivl"] ?? 0,
        r["lastIvl"] ?? 0,
        r["factor"] ?? 0,
        r["time"] ?? 0,
        r["type"] ?? 0,
      ]);
    }
  }

  return tuples;
};
