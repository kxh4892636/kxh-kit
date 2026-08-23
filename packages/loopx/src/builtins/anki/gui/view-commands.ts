import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { parseResponse } from "../responses";

const currentCardResponse = z
  .object({
    answer: z.string(),
    question: z.string(),
    deckName: z.string(),
    modelName: z.string(),
    cardId: z.number(),
    buttons: z.array(z.number()),
    nextReviews: z.array(z.string()),
    fields: z.record(z.string(), z.object({ value: z.string(), order: z.number() })).optional(),
  })
  .catchall(z.json())
  .nullable();
const booleanResponse = z.boolean();

export const guiCurrentCard = async (port: AnkiPort): Promise<JsonValue> => {
  try {
    const cardInfo = parseResponse(
      "guiCurrentCard",
      currentCardResponse,
      await port.invoke<unknown>("guiCurrentCard"),
    );
    if (cardInfo === null)
      return {
        success: true,
        cardInfo: null,
        inReview: false,
        message: "Not currently in review mode",
        hint: "Open a deck in Anki and start reviewing to see current card information.",
      };
    return {
      success: true,
      cardInfo,
      inReview: true,
      message: `Current card: ${cardInfo.cardId} from deck "${cardInfo.deckName}"`,
      hint: "Use gui edit to edit the note associated with this card.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "guiCurrentCard",
      hint: "Make sure Anki is running and the GUI is visible",
    });
  }
};

export const guiShowSide = async (
  port: AnkiPort,
  action: "guiShowAnswer" | "guiShowQuestion",
): Promise<JsonValue> => {
  try {
    const side = action === "guiShowQuestion" ? "question" : "answer";
    const inReview = parseResponse(action, booleanResponse, await port.invoke<unknown>(action));
    if (!inReview)
      return {
        success: true,
        inReview: false,
        message: `Not in review mode - ${side} cannot be shown`,
        hint: "Start reviewing a deck in Anki to use this command.",
      };
    return {
      success: true,
      inReview: true,
      message: `${side === "question" ? "Question" : "Answer"} side is now displayed`,
      hint:
        side === "question"
          ? "Use gui current-card to get the card details, or gui show-answer to reveal the answer."
          : "Use gui current-card to get full card details including the answer content.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action,
      hint: "Make sure Anki is running, GUI is visible, and you are in review mode",
    });
  }
};

export const guiUndo = async (port: AnkiPort): Promise<JsonValue> => {
  try {
    const undone = parseResponse("guiUndo", booleanResponse, await port.invoke<unknown>("guiUndo"));
    return undone
      ? {
          success: true,
          undone: true,
          message: "Last action undone successfully",
          hint: "The previous action has been reversed. Check Anki GUI to verify.",
        }
      : {
          success: true,
          undone: false,
          message: "Nothing to undo",
          hint: "There are no recent actions to undo in Anki.",
        };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "guiUndo",
      hint: "Make sure Anki is running and the GUI is visible",
    });
  }
};
