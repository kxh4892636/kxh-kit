import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

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
  client: AnkiConnectClient,
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

    const notesInfo = await client.invoke<Array<Record<string, unknown>>>("notesInfo", { notes });

    const validNotes = notesInfo.filter((note) => note && note["noteId"]);
    const validNoteIds = validNotes.map((note) => note["noteId"] as number);
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
      (sum, note) => sum + ((note["cards"] as number[] | undefined)?.length || 0),
      0,
    );

    await client.invoke<null>("deleteNotes", { notes: validNoteIds });

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
