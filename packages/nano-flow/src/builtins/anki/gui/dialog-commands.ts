import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { parseResponse } from "../responses";

export type GuiNote = {
  readonly deckName: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly modelName: string;
  readonly tags?: readonly string[];
};

const nullableNumber = z.number().nullable();
const nullResponse = z.null();
const booleanResponse = z.boolean();

export const validateGuiNote = (note: GuiNote): void => {
  const emptyFields = Object.entries(note.fields).filter(
    (entry: [string, string]): boolean => entry[1].trim() === "",
  );
  if (emptyFields.length > 0)
    throw new JsonError(
      `Fields cannot be empty: ${emptyFields.map((entry: [string, string]): string => entry[0]).join(", ")}`,
      {
        action: "guiAddCards",
        details: {
          deckName: note.deckName,
          modelName: note.modelName,
          emptyFields: emptyFields.map((entry: [string, string]): string => entry[0]),
        },
      },
    );
};

export const guiAddCards = async (port: AnkiPort, note: GuiNote): Promise<JsonValue> => {
  try {
    validateGuiNote(note);
    const noteId = parseResponse(
      "guiAddCards",
      nullableNumber,
      await port.invoke<unknown>("guiAddCards", { note }),
    );
    return {
      success: true,
      noteId,
      deckName: note.deckName,
      modelName: note.modelName,
      message: `Add Cards dialog opened with preset details for deck "${note.deckName}"`,
      hint: "The user can now review and finalize the note in the Anki GUI. The note will be created when they click Add.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const context = lower.includes("field")
      ? {
          details: { modelName: note.modelName, providedFields: Object.keys(note.fields) },
          hint: "Field mismatch. Use models fields to see required fields.",
        }
      : lower.includes("model")
        ? {
            details: { modelName: note.modelName },
            hint: "Model not found. Use models list to see available models.",
          }
        : lower.includes("deck")
          ? {
              details: { deckName: note.deckName },
              hint: "Deck not found. Use decks list to see available decks.",
            }
          : {
              details: { deckName: note.deckName, modelName: note.modelName },
              hint: "Make sure Anki is running and the deck/model names are correct",
            };
    throw new JsonError(message, { action: "guiAddCards", ...context });
  }
};

export const guiEditNote = async (port: AnkiPort, note: number): Promise<JsonValue> => {
  try {
    parseResponse("guiEditNote", nullResponse, await port.invoke<unknown>("guiEditNote", { note }));
    return {
      success: true,
      noteId: note,
      message: `Note editor opened for note ${note}`,
      hint: "The user can now edit the note fields, tags, and cards in the Anki GUI. Changes will be saved when they close the editor.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JsonError(message, {
      action: "guiEditNote",
      details: { noteId: note },
      hint:
        message.includes("not found") || message.includes("invalid")
          ? "Note not found. Use notes find to search for notes and get valid note IDs."
          : "Make sure Anki is running and the note ID is valid",
    });
  }
};

export const guiDeckOverview = async (port: AnkiPort, name: string): Promise<JsonValue> => {
  try {
    const opened = parseResponse(
      "guiDeckOverview",
      booleanResponse,
      await port.invoke<unknown>("guiDeckOverview", { name }),
    );
    if (!opened)
      throw new JsonError(`Failed to open Deck Overview for deck "${name}"`, {
        action: "guiDeckOverview",
        details: { deckName: name },
        hint: "Deck not found or Anki GUI is not responding. Use decks list to see available decks.",
      });
    return {
      success: true,
      deckName: name,
      message: `Deck Overview opened for deck "${name}"`,
      hint: "The deck statistics and study options are now visible in the Anki GUI.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JsonError(message, {
      action: "guiDeckOverview",
      details: { deckName: name },
      hint:
        message.includes("not found") || message.includes("invalid")
          ? "Deck not found. Use decks list to see available decks."
          : "Make sure Anki is running and the deck name is correct",
    });
  }
};

export const guiDeckBrowser = async (port: AnkiPort): Promise<JsonValue> => {
  try {
    parseResponse("guiDeckBrowser", nullResponse, await port.invoke<unknown>("guiDeckBrowser"));
    return {
      success: true,
      message: "Deck Browser opened successfully",
      hint: "All decks are now visible in the Anki GUI. User can select a deck to study or manage.",
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "guiDeckBrowser",
      hint: "Make sure Anki is running and the GUI is visible",
    });
  }
};
