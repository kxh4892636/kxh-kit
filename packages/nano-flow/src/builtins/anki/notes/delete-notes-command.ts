import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { noteDeleteArrayResponse, nullResponse, parseResponse } from "../responses";

export const deleteNotesParamsSchema = z.lazy(() =>
  z.object({
    notes: z.array(z.number()).min(1).max(100),
    confirmDeletion: z.boolean(),
  }),
);

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

// notesInfo 条目可能缺 noteId(笔记不存在)与 cards(卡片列表缺失)。
type NoteEntry = {
  readonly cards?: number[] | undefined;
  readonly noteId?: number | undefined;
};

// 删除不可逆, 确认位缺失时必须在触达 Anki 之前就失败。
const assertDeletionConfirmed = (notes: number[], confirmDeletion: boolean): void => {
  if (!confirmDeletion) {
    throw new JsonError("Deletion not confirmed", {
      action: "deleteNotes",
      details: { requestedNotes: notes, noteCount: notes.length },
      hint: "Set --yes to permanently delete these notes and all their cards",
    });
  }
};

// 上游对不存在的 ID 只回空条目, 因此先挑出真实存在的笔记, 只对它们发起删除。
const partitionExistingNotes = (
  requested: number[],
  notesInfo: readonly NoteEntry[],
): { existingIds: number[]; notFoundCount: number; totalCards: number } => {
  const existingNotes = notesInfo.filter((note: NoteEntry): boolean => note.noteId !== undefined);
  return {
    existingIds: existingNotes.map((note: NoteEntry): number => note.noteId as number),
    notFoundCount: requested.length - existingNotes.length,
    totalCards: existingNotes.reduce(
      (sum: number, note: NoteEntry): number => sum + (note.cards?.length ?? 0),
      0,
    ),
  };
};

const emptyDeletionResult = (notes: number[]): DeleteNotesResult => ({
  success: true,
  deletedCount: 0,
  notFoundCount: notes.length,
  requestedIds: notes,
  message: "No notes were deleted (none of the provided IDs were valid)",
  hint: "The notes may have already been deleted or the IDs are invalid",
});

const deletionResult = (
  notes: number[],
  existingIds: number[],
  totalCards: number,
  notFoundCount: number,
): DeleteNotesResult => {
  const message =
    notFoundCount > 0
      ? `Successfully deleted ${existingIds.length} note(s) and ${totalCards} card(s). ${notFoundCount} note(s) were not found.`
      : `Successfully deleted ${existingIds.length} note(s) and ${totalCards} card(s)`;

  return {
    success: true,
    deletedCount: existingIds.length,
    deletedNoteIds: existingIds,
    cardsDeleted: totalCards,
    notFoundCount,
    requestedIds: notes,
    message,
    warning: "These notes and cards have been permanently deleted",
    hint: "Consider syncing with AnkiWeb to propagate deletions to other devices",
  };
};

const translateDeleteFailure = (error: unknown, notes: number[]): JsonError => {
  if (error instanceof JsonError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("permission")) {
    return new JsonError(message, {
      action: "deleteNotes",
      details: { requestedNotes: notes },
      hint: "Permission denied. Check if Anki allows deletions via AnkiConnect.",
    });
  }

  return new JsonError(message, {
    action: "deleteNotes",
    details: { requestedNotes: notes },
    hint: "Make sure Anki is running and the note IDs are valid",
  });
};

/**
 * 删除笔记及其全部卡片(上游 deleteNotes)。不可逆, 必须显式确认(--yes)。
 */
export const runDeleteNotes = async (
  client: AnkiPort,
  params: DeleteNotesParams,
): Promise<DeleteNotesResult> => {
  try {
    const { notes, confirmDeletion } = params;

    assertDeletionConfirmed(notes, confirmDeletion);

    const notesInfo = parseResponse(
      "notesInfo",
      noteDeleteArrayResponse,
      await client.invoke<unknown>("notesInfo", { notes }),
    );

    const { existingIds, notFoundCount, totalCards } = partitionExistingNotes(notes, notesInfo);
    if (existingIds.length === 0) {
      return emptyDeletionResult(notes);
    }

    parseResponse(
      "deleteNotes",
      nullResponse,
      await client.invoke<unknown>("deleteNotes", { notes: existingIds }),
    );

    return deletionResult(notes, existingIds, totalCards, notFoundCount);
  } catch (error) {
    throw translateDeleteFailure(error, params.notes);
  }
};
