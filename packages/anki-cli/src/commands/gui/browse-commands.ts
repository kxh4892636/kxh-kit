// GUI 组 — 浏览器类命令(guiBrowse/guiSelectCard/guiSelectedNotes)。
// 仅用于笔记编辑/创建流程, 非复习会话。

import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const guiBrowseParamsSchema = z.object({
  query: z.string().min(1),
  reorderCards: z
    .object({
      order: z.enum(["ascending", "descending"]),
      columnId: z.string(),
    })
    .optional(),
});

export type GuiBrowseParams = z.infer<typeof guiBrowseParamsSchema>;

export interface GuiBrowseResult {
  success: boolean;
  cardIds: number[];
  cardCount: number;
  query: string;
  message: string;
  hint: string;
}

export const runGuiBrowse = async (
  client: AnkiConnectClient,
  params: GuiBrowseParams,
): Promise<GuiBrowseResult> => {
  try {
    const { query, reorderCards } = params;

    const invokeParams: Record<string, unknown> = { query };
    if (reorderCards !== undefined) {
      invokeParams["reorderCards"] = reorderCards;
    }

    const cardIds = await client.invoke<number[]>("guiBrowse", invokeParams);

    return {
      success: true,
      cardIds,
      cardCount: cardIds.length,
      query,
      message: `Card Browser opened with ${cardIds.length} card(s) matching query "${query}"`,
      hint:
        cardIds.length === 0
          ? "No cards found. Try adjusting your search query."
          : "Use gui select to select a specific card, or gui selected-notes to get selected notes.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("query") || message.includes("syntax")) {
      throw new JsonError(message, {
        action: "guiBrowse",
        details: { query: params.query },
        hint: 'Invalid search query. Check Anki search syntax. Examples: "deck:MyDeck", "tag:important", "is:due"',
      });
    }
    throw new JsonError(message, {
      action: "guiBrowse",
      details: { query: params.query },
      hint: "Make sure Anki is running and the GUI is visible",
    });
  }
};

export interface GuiSelectCardResult {
  success: boolean;
  cardId: number;
  browserOpen: boolean;
  message: string;
  hint: string;
}

export const runGuiSelectCard = async (
  client: AnkiConnectClient,
  card: number,
): Promise<GuiSelectCardResult> => {
  try {
    const success = await client.invoke<boolean>("guiSelectCard", { card });

    if (!success) {
      throw new JsonError("Card Browser is not open", {
        action: "guiSelectCard",
        details: { cardId: card },
        hint: "Use gui browse to open the Card Browser first, then try selecting the card again.",
      });
    }

    return {
      success: true,
      cardId: card,
      browserOpen: true,
      message: `Successfully selected card ${card} in Card Browser`,
      hint: "The card is now selected. Use gui edit to edit the associated note, or gui selected-notes to get note IDs.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("invalid")) {
      throw new JsonError(message, {
        action: "guiSelectCard",
        details: { cardId: card },
        hint: "Card ID not found. Make sure the card exists and is visible in the current browser search.",
      });
    }
    throw new JsonError(message, {
      action: "guiSelectCard",
      details: { cardId: card },
      hint: "Make sure Anki is running, the Card Browser is open, and the card ID is valid",
    });
  }
};

export interface GuiSelectedNotesResult {
  success: boolean;
  noteIds: number[];
  noteCount: number;
  message: string;
  hint: string;
}

export const runGuiSelectedNotes = async (
  client: AnkiConnectClient,
): Promise<GuiSelectedNotesResult> => {
  try {
    const noteIds = await client.invoke<number[]>("guiSelectedNotes");

    if (noteIds.length === 0) {
      return {
        success: true,
        noteIds: [],
        noteCount: 0,
        message: "No notes are currently selected in the Card Browser",
        hint: "Open the Card Browser (gui browse) and select some cards/notes first.",
      };
    }

    return {
      success: true,
      noteIds,
      noteCount: noteIds.length,
      message: `Retrieved ${noteIds.length} selected note ID(s) from Card Browser`,
      hint: "Use notes info to get details about these notes, or notes update/notes delete to modify them.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("browser") || message.includes("not open")) {
      throw new JsonError(message, {
        action: "guiSelectedNotes",
        hint: "Card Browser is not open. Use gui browse to open it first.",
      });
    }
    throw new JsonError(message, {
      action: "guiSelectedNotes",
      hint: "Make sure Anki is running and the Card Browser is open",
    });
  }
};
