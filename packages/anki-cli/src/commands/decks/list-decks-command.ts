import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import type { DeckInfo, DeckStats } from "../../types/anki.types";
import { getRootDeckNames } from "../../utils/deck-hierarchy";

// 参数 schema 单一事实源: commander 选项与运行时校验都由它派生。
export const listDecksParamsSchema = z.object({
  includeStats: z.boolean().optional(),
});

export type ListDecksParams = z.infer<typeof listDecksParamsSchema>;

export interface ListDecksResult {
  success: boolean;
  decks: DeckInfo[];
  total: number;
  message?: string;
  /**
   * 集合级汇总。total_cards 对全部牌组求和(total_in_deck 只计本牌组卡片);
   * 三个调度桶只对根牌组求和(其计数已上卷子牌组)。
   */
  summary?: {
    total_cards: number;
    new_cards: number;
    learning_cards: number;
    review_cards: number;
  };
}

/**
 * 列出全部牌组(上游 listDecks)。
 * --stats 时: 先 deckNamesAndIds 取 ID 映射, 再 getDeckStats 按 ID 匹配
 * (子牌组在 getDeckStats 响应里是短名, 按名匹配会错位), 汇总按根牌组语义。
 */
export const runListDecks = async (
  client: AnkiConnectClient,
  params: ListDecksParams,
): Promise<ListDecksResult> => {
  try {
    const includeStats = params.includeStats ?? false;

    const deckNames = await client.invoke<string[]>("deckNames");

    if (!deckNames || deckNames.length === 0) {
      return {
        success: true,
        message: "No decks found in Anki",
        decks: [],
        total: 0,
      };
    }

    let decks: DeckInfo[];
    let summary: ListDecksResult["summary"];

    if (includeStats) {
      const deckNamesAndIds = await client.invoke<Record<string, number>>("deckNamesAndIds", {});

      const deckStatsResponse = await client.invoke<Record<string, Record<string, unknown>>>(
        "getDeckStats",
        { decks: deckNames },
      );

      decks = deckNames.map((name) => {
        const deckId = deckNamesAndIds?.[name];
        const stats = deckId != null ? deckStatsResponse?.[String(deckId)] : undefined;

        if (stats) {
          return {
            name,
            stats: {
              deck_id: (stats["deck_id"] as number) || 0,
              name,
              new_count: (stats["new_count"] as number) || 0,
              learn_count: (stats["learn_count"] as number) || 0,
              review_count: (stats["review_count"] as number) || 0,
              total_new: (stats["new_count"] as number) || 0,
              total_cards: (stats["total_in_deck"] as number) || 0,
            } as DeckStats,
          };
        }
        return { name };
      });

      const rootDeckNames = new Set(getRootDeckNames(deckNames));

      summary = decks.reduce<ListDecksResult["summary"]>(
        (acc, deck) => {
          if (!deck.stats) {
            return acc;
          }
          acc!.total_cards += deck.stats.total_cards;
          if (rootDeckNames.has(deck.name)) {
            acc!.new_cards += deck.stats.new_count;
            acc!.learning_cards += deck.stats.learn_count;
            acc!.review_cards += deck.stats.review_count;
          }
          return acc;
        },
        { total_cards: 0, new_cards: 0, learning_cards: 0, review_cards: 0 },
      );
    } else {
      decks = deckNames.map((name) => ({ name }));
    }

    const result: ListDecksResult = {
      success: true,
      decks,
      total: decks.length,
    };

    if (summary !== undefined) {
      result.summary = summary;
    }

    return result;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "listDecks",
      hint: "Make sure Anki is running",
    });
  }
};
