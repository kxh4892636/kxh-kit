import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError, ReadOnlyModeError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { optionalNumberResponse, parseResponse, stringArrayResponse } from "../responses";
import { buildNoteOptions } from "./note-duplicate-options";

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

interface BatchNoteContext {
  readonly allowDuplicate: boolean | undefined;
  readonly deckName: string;
  readonly duplicateScope: "collection" | "deck" | undefined;
  readonly modelName: string;
  readonly sharedTags: readonly string[] | undefined;
}

// 模型字段目录是批量校验的前置条件, 缺失时统一给出「用 models list 排查」的提示。
const requireBatchModelFields = async (
  client: AnkiPort,
  modelName: string,
  deckName: string,
  totalRequested: number,
): Promise<readonly string[]> => {
  const fieldNames = parseResponse(
    "modelFieldNames",
    stringArrayResponse,
    await client.invoke<unknown>("modelFieldNames", { modelName }),
  );

  if (!fieldNames || fieldNames.length === 0) {
    throw new JsonError(`Model "${modelName}" not found or has no fields`, {
      action: "addNotes",
      details: { deckName, modelName, totalRequested },
      hint: "Use models list to see available models",
    });
  }

  return fieldNames;
};

// 先收集全部空排序字段再一次性报错: 逐条失败会掩盖「整批输入不可用」这一事实。
const collectEmptySortFields = (
  notes: AddNotesParams["notes"],
  sortField: string,
): Array<{ error: string; index: number }> => {
  const errors: Array<{ error: string; index: number }> = [];
  for (let i = 0; i < notes.length; i++) {
    const sortFieldValue = notes[i]!.fields[sortField];
    if (!sortFieldValue || sortFieldValue.trim() === "") {
      errors.push({
        index: i,
        error: `The first field "${sortField}" cannot be empty. Anki requires the sort field to have content.`,
      });
    }
  }
  return errors;
};

// 每条笔记的 tags 与 options 是「共享参数 + 本条参数」的合并结果。
const noteParamsFor = (
  note: AddNotesParams["notes"][number],
  context: BatchNoteContext,
): Record<string, JsonValue> => {
  const mergedTags = [...new Set([...(context.sharedTags ?? []), ...(note.tags ?? [])])];

  const noteParams: Record<string, JsonValue> = {
    deckName: context.deckName,
    modelName: context.modelName,
    fields: note.fields,
  };

  if (mergedTags.length > 0) {
    noteParams["tags"] = mergedTags;
  }

  const options = buildNoteOptions({
    allowDuplicate: context.allowDuplicate,
    duplicateScope: context.duplicateScope,
  });
  if (options !== undefined) {
    noteParams["options"] = options;
  }

  return noteParams;
};

// 单条失败不终止批次, 因此把异常翻译成结果条目; 只读模式属于配置错误, 必须冒泡。
const addOneNote = async (
  client: AnkiPort,
  noteParams: Record<string, JsonValue>,
  index: number,
  logger: Logger | undefined,
): Promise<AddNotesResult["results"][number]> => {
  try {
    const noteId = parseResponse(
      "addNote",
      optionalNumberResponse,
      await client.invoke<unknown>("addNote", { note: noteParams }),
    );

    if (noteId != null) {
      return { index, status: "created", noteId };
    }
    return { index, status: "skipped", reason: "duplicate" };
  } catch (error) {
    if (error instanceof ReadOnlyModeError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.warn(`Unable to add batch note ${index}: ${errorMessage}`);

    if (
      errorMessage.includes("duplicate") ||
      errorMessage.includes("cannot create note because it is a duplicate")
    ) {
      return { index, status: "skipped", reason: "duplicate" };
    }
    return { index, status: "failed", error: errorMessage };
  }
};

export const runAddNotes = async (
  client: AnkiPort,
  params: AddNotesParams,
  logger?: Logger,
): Promise<AddNotesResult> => {
  try {
    const { deckName, modelName, tags: sharedTags, allowDuplicate, duplicateScope, notes } = params;

    const fieldNames = await requireBatchModelFields(client, modelName, deckName, notes.length);

    const sortField = fieldNames[0]!;
    const sortFieldErrors = collectEmptySortFields(notes, sortField);

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
    const context: BatchNoteContext = {
      allowDuplicate,
      deckName,
      duplicateScope,
      modelName,
      sharedTags,
    };

    for (let i = 0; i < notes.length; i++) {
      const entry = await addOneNote(client, noteParamsFor(notes[i]!, context), i, logger);
      results.push(entry);

      if (entry.status === "created") {
        createdCount++;
      } else if (entry.status === "skipped") {
        skippedCount++;
      } else {
        failedCount++;
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
