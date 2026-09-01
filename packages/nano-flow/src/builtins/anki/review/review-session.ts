import type { InvocationContext, JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { runGetDueCards } from "../cards/due-command";
import { runRateCard } from "../cards/rate-command";
import { runSync } from "../sync/sync-command";
import { createEventStream } from "./event-stream";

export interface ReviewSessionOptions {
  readonly deck: string | undefined;
  readonly limit: number | undefined;
  readonly includeNew: boolean;
  readonly syncFirst: boolean;
}

export interface ReviewSummary {
  readonly success: boolean;
  readonly reviewed: number;
  readonly skipped: number;
  readonly ratings: Readonly<Record<string, number>>;
  readonly message: string;
}

export const runReviewSession = (
  port: AnkiPort,
  context: InvocationContext,
  options: ReviewSessionOptions,
  logger: Logger,
  now: () => Date,
): AsyncIterable<JsonValue> =>
  createEventStream<JsonValue>(async (emit: (event: JsonValue) => void): Promise<void> => {
    const ratings: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
    let reviewed = 0;
    let skipped = 0;
    if (options.syncFirst) emit((await runSync(port, now)) as unknown as JsonValue);
    const due = await runGetDueCards(
      port,
      {
        ...(options.deck === undefined ? {} : { deckName: options.deck }),
        limit: options.limit ?? 10,
        includeLearning: true,
        includeNew: options.includeNew,
      },
      logger,
    );
    emit({
      success: true,
      total: due.total,
      returned: due.returned ?? 0,
      message: due.message,
    });
    for (const card of due.cards) {
      if (context.signal.aborted) break;
      emit({
        type: "question",
        cardId: card.cardId,
        front: card.front,
        deckName: card.deckName,
        modelName: card.modelName,
      });
      const line = await context.stdin.readLine();
      if (line === null || context.signal.aborted) break;
      const input = line.trim();
      if (input === "q" || input === "quit") break;
      const rating = Number(input);
      if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
        skipped += 1;
        emit({
          success: false,
          error: "评分必须是 1-4(1=Again 2=Hard 3=Good 4=Easy), q 退出",
          received: input,
        });
        continue;
      }
      try {
        const result = await runRateCard(port, { cardId: card.cardId, rating });
        emit(result as unknown as JsonValue);
        const key = String(rating);
        ratings[key] = (ratings[key] ?? 0) + 1;
        reviewed += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Unable to rate review card ${card.cardId}: ${message}`);
        skipped += 1;
        emit({
          success: false,
          cardId: card.cardId,
          error: error instanceof JsonError ? error.message : message,
        });
      }
    }
    const summary: ReviewSummary = {
      success: true,
      reviewed,
      skipped,
      ratings,
      message: `复习结束: ${reviewed} 张已评分${skipped > 0 ? `, ${skipped} 张跳过` : ""}`,
    };
    emit(summary as unknown as JsonValue);
  });
