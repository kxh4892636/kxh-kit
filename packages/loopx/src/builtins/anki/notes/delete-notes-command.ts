import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { noteDeleteArrayResponse, nullResponse, parseResponse } from "../responses";

export const deleteNotesParamsSchema = z.object({
  notes: z.array(z.number()).min(1).max(100),
  confirmDeletion: z.boolean(),
});

export type DeleteNotesParams = z.infer<typeof deleteNotesParamsSchema>;

export interface DeleteNotesResult {
  success: boolean;
  deletedCount: number;
  deletedNoteIds?: number[];
  cardsDeleted?: number;
  notFoundCount: number;
  requestedIds: number[];
  message: string;
  warning?: string;
  hint?: string;
}

/**
 * 删除笔记及其全部卡片(上游 deleteNotes)。不可逆, 必须显式确认(--yes)。
 */
export const runDeleteNotes = async (
  client: AnkiPort,
  params: DeleteNotesParams,
): Promise<DeleteNotesResult> => {
  try {
    const { notes, confirmDeletion } = params;

    if (!confirmDeletion) {
      throw new JsonError("Deletion not confirmed", {
        action: "deleteNotes",
        details: { requestedNotes: notes, noteCount: notes.length },
        hint: "Set --yes to permanently delete these notes and all their cards",
      });
    }

    const notesInfo = parseResponse(
      "notesInfo",
      noteDeleteArrayResponse,
      await client.invoke<unknown>("notesInfo", { notes }),
    );

    const validNotes = notesInfo.filter(
      (note: (typeof notesInfo)[number]): boolean => note.noteId !== undefined,
    );
    const validNoteIds = validNotes.map(
      (note: (typeof validNotes)[number]): number => note.noteId as number,
    );
    const notFoundCount = notes.length - validNotes.length;

    if (validNoteIds.length === 0) {
      const result: DeleteNotesResult = {
        success: true,
        deletedCount: 0,
        notFoundCount: notes.length,
        requestedIds: notes,
        message: "No notes were deleted (none of the provided IDs were valid)",
        hint: "The notes may have already been deleted or the IDs are invalid",
      };
      return result;
    }

    const totalCards = validNotes.reduce(
      (sum: number, note: (typeof validNotes)[number]): number => sum + (note.cards?.length ?? 0),
      0,
    );

    parseResponse(
      "deleteNotes",
      nullResponse,
      await client.invoke<unknown>("deleteNotes", { notes: validNoteIds }),
    );

    const message =
      notFoundCount > 0
        ? `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s). ${notFoundCount} note(s) were not found.`
        : `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s)`;

    const result: DeleteNotesResult = {
      success: true,
      deletedCount: validNoteIds.length,
      deletedNoteIds: validNoteIds,
      cardsDeleted: totalCards,
      notFoundCount,
      requestedIds: notes,
      message,
      warning: "These notes and cards have been permanently deleted",
      hint: "Consider syncing with AnkiWeb to propagate deletions to other devices",
    };

    return result;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("permission")) {
      throw new JsonError(message, {
        action: "deleteNotes",
        details: { requestedNotes: params.notes },
        hint: "Permission denied. Check if Anki allows deletions via AnkiConnect.",
      });
    }

    throw new JsonError(message, {
      action: "deleteNotes",
      details: { requestedNotes: params.notes },
      hint: "Make sure Anki is running and the note IDs are valid",
    });
  }
};
