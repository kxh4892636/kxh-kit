// GUI 组 — 视图/工具类命令(guiCurrentCard/guiShowQuestion/guiShowAnswer/guiUndo)。
// 仅用于编辑/创建流程中的内容核对, 严禁用于复习会话编排。

import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import type { GuiCurrentCardInfo } from "../../types/anki.types";

export interface GuiCurrentCardResult {
  success: boolean;
  cardInfo: GuiCurrentCardInfo | null;
  inReview: boolean;
  message: string;
  hint: string;
}

export const runGuiCurrentCard = async (
  client: AnkiConnectClient,
): Promise<GuiCurrentCardResult> => {
  try {
    const cardInfo = await client.invoke<GuiCurrentCardInfo | null>("guiCurrentCard");

    if (!cardInfo) {
      return {
        success: true,
        cardInfo: null,
        inReview: false,
        message: "Not currently in review mode",
        hint: "Open a deck in Anki and start reviewing to see current card information.",
      };
    }

    return {
      success: true,
      cardInfo,
      inReview: true,
      message: `Current card: ${cardInfo.cardId} from deck "${cardInfo.deckName}"`,
      hint: "Use gui edit to edit the note associated with this card.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "guiCurrentCard",
      hint: "Make sure Anki is running and the GUI is visible",
    });
  }
};

export interface GuiSideResult {
  success: boolean;
  inReview: boolean;
  message: string;
  hint: string;
}

const runGuiSide = async (
  client: AnkiConnectClient,
  action: "guiShowQuestion" | "guiShowAnswer",
): Promise<GuiSideResult> => {
  try {
    const side = action === "guiShowQuestion" ? "question" : "answer";
    const inReview = await client.invoke<boolean>(action);

    if (!inReview) {
      return {
        success: true,
        inReview: false,
        message: `Not in review mode - ${side} cannot be shown`,
        hint: "Start reviewing a deck in Anki to use this command.",
      };
    }

    return {
      success: true,
      inReview: true,
      message: `${side === "question" ? "Question" : "Answer"} side is now displayed`,
      hint:
        side === "question"
          ? "Use gui current-card to get the card details, or gui show-answer to reveal the answer."
          : "Use gui current-card to get full card details including the answer content.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action,
      hint: "Make sure Anki is running, GUI is visible, and you are in review mode",
    });
  }
};

export const runGuiShowQuestion = (client: AnkiConnectClient): Promise<GuiSideResult> =>
  runGuiSide(client, "guiShowQuestion");

export const runGuiShowAnswer = (client: AnkiConnectClient): Promise<GuiSideResult> =>
  runGuiSide(client, "guiShowAnswer");

export interface GuiUndoResult {
  success: boolean;
  undone: boolean;
  message: string;
  hint: string;
}

export const runGuiUndo = async (client: AnkiConnectClient): Promise<GuiUndoResult> => {
  try {
    const success = await client.invoke<boolean>("guiUndo");

    if (!success) {
      return {
        success: true,
        undone: false,
        message: "Nothing to undo",
        hint: "There are no recent actions to undo in Anki.",
      };
    }

    return {
      success: true,
      undone: true,
      message: "Last action undone successfully",
      hint: "The previous action has been reversed. Check Anki GUI to verify.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "guiUndo",
      hint: "Make sure Anki is running and the GUI is visible",
    });
  }
};
