// 交互式复习会话(替代上游 review-session prompt 的 CLI 闭环):
// sync → 拉取到期卡片 → 逐张输出问题 JSON → stdin 读评分(1-4) → 输出评分结果;
// 输入 q/EOF/SIGINT 中断时输出汇总 JSON 并正常退出。

import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import { runGetDueCards } from "../cards/due-command";
import { runRateCard } from "../cards/rate-command";
import { runSync } from "../sync/sync-command";

export interface ReviewSessionOptions {
  deck: string | undefined;
  limit: number | undefined;
  includeNew: boolean;
  syncFirst: boolean;
}

export interface ReviewIo {
  readLine: () => Promise<string | null>;
  writeOut: (text: string) => void;
  writeErr: (text: string) => void;
}

export interface ReviewSummary {
  success: boolean;
  reviewed: number;
  skipped: number;
  ratings: Record<string, number>;
  message: string;
}

const RATING_LABELS = ["1", "2", "3", "4"] as const;

export const runReviewSession = async (
  client: AnkiConnectClient,
  io: ReviewIo,
  options: ReviewSessionOptions,
): Promise<ReviewSummary> => {
  const ratings: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
  let reviewed = 0;
  let skipped = 0;

  if (options.syncFirst) {
    const syncResult = await runSync(client);
    io.writeOut(`${JSON.stringify(syncResult, null, 2)}\n`);
  }

  const dueParams: {
    deckName?: string;
    limit?: number;
    includeLearning: boolean;
    includeNew: boolean;
  } = {
    limit: options.limit ?? 10,
    includeLearning: true,
    includeNew: options.includeNew,
  };
  if (options.deck !== undefined) {
    dueParams.deckName = options.deck;
  }

  const due = await runGetDueCards(client, dueParams);

  io.writeOut(
    `${JSON.stringify(
      {
        success: true,
        total: due.total,
        returned: due.returned ?? 0,
        message: due.message,
      },
      null,
      2,
    )}\n`,
  );

  for (const card of due.cards) {
    io.writeOut(
      `${JSON.stringify(
        {
          type: "question",
          cardId: card.cardId,
          front: card.front,
          deckName: card.deckName,
          modelName: card.modelName,
        },
        null,
        2,
      )}\n`,
    );

    const line = await io.readLine();
    if (line === null) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed === "q" || trimmed === "quit") {
      break;
    }

    const rating = Number(trimmed);
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
      skipped++;
      io.writeErr(
        `${JSON.stringify(
          {
            success: false,
            error: "评分必须是 1-4(1=Again 2=Hard 3=Good 4=Easy), q 退出",
            received: trimmed,
          },
          null,
          2,
        )}\n`,
      );
      continue;
    }

    try {
      const result = await runRateCard(client, {
        cardId: card.cardId,
        rating,
      });
      io.writeOut(`${JSON.stringify(result, null, 2)}\n`);
      const key = String(rating) as (typeof RATING_LABELS)[number];
      ratings[key] = (ratings[key] ?? 0) + 1;
      reviewed++;
    } catch (error) {
      // 单张评分失败不中断会话(如卡片已被删除), 计为跳过并记录错误。
      skipped++;
      io.writeErr(
        `${JSON.stringify(
          {
            success: false,
            cardId: card.cardId,
            error: error instanceof JsonError ? error.message : String(error),
          },
          null,
          2,
        )}\n`,
      );
    }
  }

  const summary: ReviewSummary = {
    success: true,
    reviewed,
    skipped,
    ratings,
    message: `复习结束: ${reviewed} 张已评分${skipped > 0 ? `, ${skipped} 张跳过` : ""}`,
  };

  return summary;
};
