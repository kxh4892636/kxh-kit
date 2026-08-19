// GUI 组 — 对话框类命令(guiAddCards/guiEditNote/guiDeckOverview/guiDeckBrowser)。
// 仅用于笔记编辑/创建与牌组管理流程, 非复习会话。

import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const guiAddCardsParamsSchema = z.object({
  note: z.object({
    deckName: z.string().min(1),
    modelName: z.string().min(1),
    fields: z.record(z.string(), z.string()),
    tags: z.array(z.string()).optional(),
  }),
});

export type GuiAddCardsParams = z.infer<typeof guiAddCardsParamsSchema>;

export interface GuiAddCardsResult {
  success: boolean;
  noteId: number | null;
  deckName: string;
  modelName: string;
  message: string;
  hint: string;
}

export const runGuiAddCards = async (
  client: AnkiConnectClient,
  params: GuiAddCardsParams,
): Promise<GuiAddCardsResult> => {
  try {
    const { note } = params;

    const emptyFields = Object.entries(note.fields).filter(
      ([, value]) => !value || value.trim() === "",
    );
    if (emptyFields.length > 0) {
      throw new JsonError(`Fields cannot be empty: ${emptyFields.map(([key]) => key).join(", ")}`, {
        action: "guiAddCards",
        details: {
          deckName: note.deckName,
          modelName: note.modelName,
          emptyFields: emptyFields.map(([key]) => key),
        },
      });
    }

    const noteId = await client.invoke<number | null>("guiAddCards", { note });

    return {
      success: true,
      noteId,
      deckName: note.deckName,
      modelName: note.modelName,
      message: `Add Cards dialog opened with preset details for deck "${note.deckName}"`,
      hint: "The user can now review and finalize the note in the Anki GUI. The note will be created when they click Add.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes("field")) {
      throw new JsonError(message, {
        action: "guiAddCards",
        details: {
          modelName: params.note.modelName,
          providedFields: Object.keys(params.note.fields),
        },
        hint: "Field mismatch. Use models fields to see required fields.",
      });
    }
    if (lower.includes("model")) {
      throw new JsonError(message, {
        action: "guiAddCards",
        details: { modelName: params.note.modelName },
        hint: "Model not found. Use models list to see available models.",
      });
    }
    if (lower.includes("deck")) {
      throw new JsonError(message, {
        action: "guiAddCards",
        details: { deckName: params.note.deckName },
        hint: "Deck not found. Use decks list to see available decks.",
      });
    }
    throw new JsonError(message, {
      action: "guiAddCards",
      details: { deckName: params.note.deckName, modelName: params.note.modelName },
      hint: "Make sure Anki is running and the deck/model names are correct",
    });
  }
};

export interface GuiEditNoteResult {
  success: boolean;
  noteId: number;
  message: string;
  hint: string;
}

export const runGuiEditNote = async (
  client: AnkiConnectClient,
  note: number,
): Promise<GuiEditNoteResult> => {
  try {
    await client.invoke<null>("guiEditNote", { note });

    return {
      success: true,
      noteId: note,
      message: `Note editor opened for note ${note}`,
      hint: "The user can now edit the note fields, tags, and cards in the Anki GUI. Changes will be saved when they close the editor.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("invalid")) {
      throw new JsonError(message, {
        action: "guiEditNote",
        details: { noteId: note },
        hint: "Note not found. Use notes find to search for notes and get valid note IDs.",
      });
    }
    throw new JsonError(message, {
      action: "guiEditNote",
      details: { noteId: note },
      hint: "Make sure Anki is running and the note ID is valid",
    });
  }
};

export interface GuiDeckOverviewResult {
  success: boolean;
  deckName: string;
  message: string;
  hint: string;
}

export const runGuiDeckOverview = async (
  client: AnkiConnectClient,
  name: string,
): Promise<GuiDeckOverviewResult> => {
  try {
    const success = await client.invoke<boolean>("guiDeckOverview", { name });

    if (!success) {
      throw new JsonError(`Failed to open Deck Overview for deck "${name}"`, {
        action: "guiDeckOverview",
        details: { deckName: name },
        hint: "Deck not found or Anki GUI is not responding. Use decks list to see available decks.",
      });
    }

    return {
      success: true,
      deckName: name,
      message: `Deck Overview opened for deck "${name}"`,
      hint: "The deck statistics and study options are now visible in the Anki GUI.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("invalid")) {
      throw new JsonError(message, {
        action: "guiDeckOverview",
        details: { deckName: name },
        hint: "Deck not found. Use decks list to see available decks.",
      });
    }
    throw new JsonError(message, {
      action: "guiDeckOverview",
      details: { deckName: name },
      hint: "Make sure Anki is running and the deck name is correct",
    });
  }
};

export interface GuiDeckBrowserResult {
  success: boolean;
  message: string;
  hint: string;
}

export const runGuiDeckBrowser = async (
  client: AnkiConnectClient,
): Promise<GuiDeckBrowserResult> => {
  try {
    await client.invoke<null>("guiDeckBrowser");

    return {
      success: true,
      message: "Deck Browser opened successfully",
      hint: "All decks are now visible in the Anki GUI. User can select a deck to study or manage.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "guiDeckBrowser",
      hint: "Make sure Anki is running and the GUI is visible",
    });
  }
};
