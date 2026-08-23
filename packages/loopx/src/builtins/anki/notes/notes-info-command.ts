import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { noteInfoArrayResponse, parseResponse } from "../responses";

interface NoteInfo {
  readonly cards: number[];
  readonly fields: Record<string, { order: number; value: string }>;
  readonly mod: number;
  readonly modelName: string;
  readonly noteId: number;
  readonly tags: string[];
}

export const notesInfoParamsSchema = z.object({
  notes: z.array(z.number()).min(1).max(100),
});

export type NotesInfoParams = z.infer<typeof notesInfoParamsSchema>;

export interface NotesInfoResult {
  success: boolean;
  notes: NoteInfo[];
  count: number;
  notFound: number;
  requestedIds: number[];
  message: string;
  models: string[];
  cssNote: string;
  hint: string;
}

// 笔记详情(上游 notesInfo): 过滤已删除的 null 项并如实计数。
export const runNotesInfo = async (
  client: AnkiPort,
  params: NotesInfoParams,
): Promise<NotesInfoResult> => {
  try {
    const { notes } = params;

    const notesData = parseResponse(
      "notesInfo",
      noteInfoArrayResponse,
      await client.invoke<unknown>("notesInfo", { notes }),
    );

    if (!notesData || notesData.length === 0) {
      throw new JsonError("No note information found", {
        action: "notesInfo",
        details: { requestedNotes: notes },
        hint: "The note IDs may be invalid or the notes may have been deleted",
      });
    }

    // AnkiConnect 对已删除笔记可能返回 null 或空对象, 先过滤 null/undefined。
    const transformedNotes: NoteInfo[] = notesData
      .filter(
        (note: (typeof notesData)[number]): note is NonNullable<(typeof notesData)[number]> =>
          note !== null,
      )
      .map(
        (note: NonNullable<(typeof notesData)[number]>): NoteInfo => ({
          noteId: note.noteId,
          modelName: note.modelName,
          tags: note.tags,
          fields: note.fields,
          cards: note.cards,
          mod: note.mod,
        }),
      );

    const validNotes = transformedNotes.filter((note: NoteInfo): boolean => note.noteId > 0);
    const deletedCount = notes.length - validNotes.length;

    const message =
      deletedCount > 0
        ? `Retrieved ${validNotes.length} note(s). ${deletedCount} note(s) not found (possibly deleted).`
        : `Successfully retrieved information for ${validNotes.length} note(s)`;

    const uniqueModels = [...new Set(validNotes.map((note: NoteInfo): string => note.modelName))];

    return {
      success: true,
      notes: validNotes,
      count: validNotes.length,
      notFound: deletedCount,
      requestedIds: notes,
      message,
      models: uniqueModels,
      cssNote:
        "Each note model has its own CSS styling. Use models styling to get CSS for specific models.",
      hint:
        validNotes.length > 0
          ? "Fields may contain HTML. Use notes update to modify content. Do not view notes in Anki browser while updating."
          : "No valid notes found. They may have been deleted.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      throw new JsonError(message, {
        action: "notesInfo",
        details: { requestedNotes: params.notes },
        hint: "One or more note IDs are invalid. Use notes find to get valid note IDs.",
      });
    }

    throw new JsonError(message, {
      action: "notesInfo",
      details: { requestedNotes: params.notes },
      hint: "Make sure Anki is running and the note IDs are valid",
    });
  }
};
