import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { parseResponse } from "../responses";

const idsResponse = z.array(z.number());
const booleanResponse = z.boolean();

export const guiBrowse = async (
  port: AnkiPort,
  query: string,
  reorderCards?: { readonly columnId: string; readonly order: "ascending" | "descending" },
): Promise<JsonValue> => {
  try {
    const cardIds = parseResponse(
      "guiBrowse",
      idsResponse,
      await port.invoke<unknown>("guiBrowse", {
        query,
        ...(reorderCards === undefined ? {} : { reorderCards }),
      }),
    );
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
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JsonError(message, {
      action: "guiBrowse",
      details: { query },
      hint:
        message.includes("query") || message.includes("syntax")
          ? 'Invalid search query. Check Anki search syntax. Examples: "deck:MyDeck", "tag:important", "is:due"'
          : "Make sure Anki is running and the GUI is visible",
    });
  }
};

export const guiSelectCard = async (port: AnkiPort, card: number): Promise<JsonValue> => {
  try {
    const selected = parseResponse(
      "guiSelectCard",
      booleanResponse,
      await port.invoke<unknown>("guiSelectCard", { card }),
    );
    if (!selected)
      throw new JsonError("Card Browser is not open", {
        action: "guiSelectCard",
        details: { cardId: card },
        hint: "Use gui browse to open the Card Browser first, then try selecting the card again.",
      });
    return {
      success: true,
      cardId: card,
      browserOpen: true,
      message: `Successfully selected card ${card} in Card Browser`,
      hint: "The card is now selected. Use gui edit to edit the associated note, or gui selected-notes to get note IDs.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JsonError(message, {
      action: "guiSelectCard",
      details: { cardId: card },
      hint:
        message.includes("not found") || message.includes("invalid")
          ? "Card ID not found. Make sure the card exists and is visible in the current browser search."
          : "Make sure Anki is running, the Card Browser is open, and the card ID is valid",
    });
  }
};

export const guiSelectedNotes = async (port: AnkiPort): Promise<JsonValue> => {
  try {
    const noteIds = parseResponse(
      "guiSelectedNotes",
      idsResponse,
      await port.invoke<unknown>("guiSelectedNotes"),
    );
    return {
      success: true,
      noteIds,
      noteCount: noteIds.length,
      message:
        noteIds.length === 0
          ? "No notes are currently selected in the Card Browser"
          : `Retrieved ${noteIds.length} selected note ID(s) from Card Browser`,
      hint:
        noteIds.length === 0
          ? "Open the Card Browser (gui browse) and select some cards/notes first."
          : "Use notes info to get details about these notes, or notes update/notes delete to modify them.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JsonError(message, {
      action: "guiSelectedNotes",
      hint:
        message.includes("browser") || message.includes("not open")
          ? "Card Browser is not open. Use gui browse to open it first."
          : "Make sure Anki is running and the Card Browser is open",
    });
  }
};
