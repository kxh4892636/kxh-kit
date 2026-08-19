import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const changeDeckParamsSchema = z.object({
  deck: z.string().min(1),
  cards: z.array(z.number()).min(1),
});

export type ChangeDeckParams = z.infer<typeof changeDeckParamsSchema>;

export interface ChangeDeckResult {
  success: boolean;
  message: string;
  cardsAffected: number;
  targetDeck: string;
}

/**
 * 移动卡片到目标牌组(上游 changeDeck), 牌组不存在时自动创建。
 * 提交前用 cardsInfo 校验全部 ID 存在——AnkiConnect 的 changeDeck 对
 * 不存在的卡片静默返回 null, 不校验会掩盖错误。
 */
export const runChangeDeck = async (
  client: AnkiConnectClient,
  params: ChangeDeckParams,
): Promise<ChangeDeckResult> => {
  try {
    const { cards, deck } = params;

    const trimmedDeck = deck.trim();
    if (trimmedDeck === "") {
      throw new Error("deck name cannot be empty");
    }

    const cardsInfo = await client.invoke<Array<{ cardId?: number }>>("cardsInfo", { cards });

    const invalidIds: number[] = [];
    cards.forEach((id, index) => {
      const info = cardsInfo?.[index];
      if (!info || typeof info.cardId !== "number") {
        invalidIds.push(id);
      }
    });

    if (invalidIds.length > 0) {
      const maxShown = 10;
      const shown = invalidIds.slice(0, maxShown).join(", ");
      const suffix =
        invalidIds.length > maxShown ? ` (and ${invalidIds.length - maxShown} more)` : "";
      throw new JsonError(
        `${invalidIds.length} of ${cards.length} card ID(s) do not exist in the Anki collection: [${shown}]${suffix}. No cards were moved.`,
        {
          action: "changeDeck",
          details: { invalidIds, totalRequested: cards.length },
        },
      );
    }

    await client.invoke<null>("changeDeck", { cards, deck: trimmedDeck });

    return {
      success: true,
      message: `Successfully moved ${cards.length} card(s) to deck "${trimmedDeck}"`,
      cardsAffected: cards.length,
      targetDeck: trimmedDeck,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "changeDeck",
      hint: "Make sure Anki is running and the card IDs / deck name are valid",
    });
  }
};
