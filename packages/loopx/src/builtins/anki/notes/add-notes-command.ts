import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError, ReadOnlyModeError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { optionalNumberResponse, parseResponse, stringArrayResponse } from "../responses";

// 批量添加笔记(上游 addNotes): 共享牌组与模板, 逐条部分成功。
export const addNotesParamsSchema = z.lazy(() =>
  z.object({
    deckName: z.string().min(1),
    modelName: z.string().min(1),
    tags: z.array(z.string()).optional(),
    allowDuplicate: z.boolean().optional(),
    duplicateScope: z.enum(["deck", "collection"]).optional(),
    notes: z
      .array(
        z.object({
          fields: z.record(z.string(), z.string()),
          tags: z.array(z.string()).optional(),
        }),
      )
      .min(1)
      .max(100),
  }),
);

export type AddNotesParams = z.infer<typeof addNotesParamsSchema>;

export type NoteResultStatus = "created" | "skipped" | "failed";

export interface AddNotesResult {
  success: boolean;
  deckName: string;
  modelName: string;
  totalRequested: number;
  created: number;
  skipped: number;
  failed: number;
  results: Array<{
    index: number;
    status: NoteResultStatus;
    noteId?: number;
    reason?: string;
    error?: string;
  }>;
}

export const runAddNotes = async (
  client: AnkiPort,
  params: AddNotesParams,
  logger?: Logger,
): Promise<AddNotesResult> => {
  try {
    const { deckName, modelName, tags: sharedTags, allowDuplicate, duplicateScope, notes } = params;

    const fieldNames = parseResponse(
      "modelFieldNames",
      stringArrayResponse,
      await client.invoke<unknown>("modelFieldNames", { modelName }),
    );

    if (!fieldNames || fieldNames.length === 0) {
      throw new JsonError(`Model "${modelName}" not found or has no fields`, {
        action: "addNotes",
        details: { deckName, modelName, totalRequested: notes.length },
        hint: "Use models list to see available models",
      });
    }

    const sortField = fieldNames[0]!;
    const sortFieldErrors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < notes.length; i++) {
      const sortFieldValue = notes[i]!.fields[sortField];
      if (!sortFieldValue || sortFieldValue.trim() === "") {
        sortFieldErrors.push({
          index: i,
          error: `The first field "${sortField}" cannot be empty. Anki requires the sort field to have content.`,
        });
      }
    }

    if (sortFieldErrors.length > 0) {
      throw new JsonError(
        `${sortFieldErrors.length} note(s) have empty sort field "${sortField}"`,
        {
          action: "addNotes",
          details: {
            deckName,
            modelName,
            totalRequested: notes.length,
            invalidNotes: sortFieldErrors,
          },
          hint: `The first field "${sortField}" is the sort field and must contain non-empty content for every note.`,
        },
      );
    }

    const results: AddNotesResult["results"] = [];
    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]!;

      const mergedTags = [...new Set([...(sharedTags ?? []), ...(note.tags ?? [])])];

      const noteParams: Record<string, JsonValue> = {
        deckName,
        modelName,
        fields: note.fields,
      };

      if (mergedTags.length > 0) {
        noteParams["tags"] = mergedTags;
      }

      const options: Record<string, JsonValue> = {};
      let hasOptions = false;
      if (allowDuplicate !== undefined) {
        options["allowDuplicate"] = allowDuplicate;
        hasOptions = true;
      }
      if (duplicateScope !== undefined) {
        options["duplicateScope"] = duplicateScope;
        hasOptions = true;
      }
      if (hasOptions) {
        noteParams["options"] = options;
      }

      try {
        const noteId = parseResponse(
          "addNote",
          optionalNumberResponse,
          await client.invoke<unknown>("addNote", { note: noteParams }),
        );

        if (noteId != null) {
          results.push({ index: i, status: "created", noteId });
          createdCount++;
        } else {
          results.push({ index: i, status: "skipped", reason: "duplicate" });
          skippedCount++;
        }
      } catch (error) {
        if (error instanceof ReadOnlyModeError) throw error;

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger?.warn(`Unable to add batch note ${i}: ${errorMessage}`);

        if (
          errorMessage.includes("duplicate") ||
          errorMessage.includes("cannot create note because it is a duplicate")
        ) {
          results.push({ index: i, status: "skipped", reason: "duplicate" });
          skippedCount++;
        } else {
          results.push({ index: i, status: "failed", error: errorMessage });
          failedCount++;
        }
      }
    }

    return {
      success: createdCount > 0 || (failedCount === 0 && skippedCount > 0),
      deckName,
      modelName,
      totalRequested: notes.length,
      created: createdCount,
      skipped: skippedCount,
      failed: failedCount,
      results,
    };
  } catch (error) {
    if (error instanceof JsonError || error instanceof ReadOnlyModeError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "addNotes",
      details: {
        deckName: params.deckName,
        modelName: params.modelName,
        totalRequested: params.notes.length,
      },
      hint: "Make sure Anki is running and the deck/model names are correct",
    });
  }
};
