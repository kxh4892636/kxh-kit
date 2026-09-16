import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { optionalNumberResponse, parseResponse, stringArrayResponse } from "../responses";
import { buildNoteOptions } from "./note-duplicate-options";

// 上游 addNote 参数 schema 的 CLI 移植。
export const addNoteParamsSchema = z.lazy(() =>
  z.object({
    deckName: z.string().min(1),
    modelName: z.string().min(1),
    fields: z.record(z.string(), z.string()),
    tags: z.array(z.string()).optional(),
    allowDuplicate: z.boolean().optional(),
    duplicateScope: z.enum(["deck", "collection"]).optional(),
    duplicateScopeOptions: z
      .object({
        deckName: z.string().optional(),
        checkChildren: z.boolean().optional(),
        checkAllModels: z.boolean().optional(),
      })
      .optional(),
  }),
);

export type AddNoteParams = z.infer<typeof addNoteParamsSchema>;

export interface AddNoteResult {
  success: boolean;
  noteId: number;
  deckName: string;
  modelName: string;
  message: string;
  details: {
    fieldsAdded: number;
    tagsAdded: number;
    duplicateCheckScope: "deck" | "collection" | "default" | "none";
  };
}

const classifyAddNoteError = (
  message: string,
  context: {
    deckName: string;
    modelName: string;
    allowDuplicate: boolean | undefined;
  },
): JsonError => {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate")) {
    return new JsonError(message, {
      action: "addNote",
      details: context,
      hint: context.allowDuplicate
        ? "The note could not be created. Check if the model and deck names are correct."
        : "This note duplicates an existing one. Retry with --allow-duplicate if intentional.",
    });
  }
  if (lower.includes("model")) {
    return new JsonError(message, {
      action: "addNote",
      details: context,
      hint: "Model not found. Use models list to see available models.",
    });
  }
  if (lower.includes("deck")) {
    return new JsonError(message, {
      action: "addNote",
      details: context,
      hint: "Deck not found. Use decks list to see available decks or decks create to create a new one.",
    });
  }
  if (lower.includes("field")) {
    return new JsonError(message, {
      action: "addNote",
      details: context,
      hint: "Field mismatch. Use models fields to see required fields for this model.",
    });
  }
  return new JsonError(message, {
    action: "addNote",
    details: context,
    hint: "Make sure Anki is running and the deck/model names are correct",
  });
};

// 字段目录决定排序字段, 拿不到目录就无法判断笔记是否可建。
const requireModelFields = async (
  client: AnkiPort,
  modelName: string,
): Promise<readonly string[]> => {
  const fieldNames = parseResponse(
    "modelFieldNames",
    stringArrayResponse,
    await client.invoke<unknown>("modelFieldNames", { modelName }),
  );

  if (!fieldNames || fieldNames.length === 0) {
    throw new JsonError(`Model "${modelName}" not found or has no fields`, {
      action: "addNote",
      details: { modelName },
      hint: "Use models list to see available models",
    });
  }

  return fieldNames;
};

// Anki 要求第一个字段作为排序字段, 空值会让 addNote 静默失败, 因此在本地先拒绝。
const requireSortFieldValue = (
  fields: Record<string, string>,
  sortField: string,
  modelName: string,
): void => {
  const sortFieldValue = fields[sortField];
  if (!sortFieldValue || sortFieldValue.trim() === "") {
    throw new JsonError(
      `The first field "${sortField}" cannot be empty. Anki requires the sort field to have content.`,
      {
        action: "addNote",
        details: { modelName, sortField, providedFields: Object.keys(fields) },
        hint: `The first field "${sortField}" is the sort field and must contain non-empty content.`,
      },
    );
  }
};

// 可选参数只在有值时写入 payload, 避免把空 tags/options 交给上游。
const buildNoteRequest = (params: AddNoteParams): Record<string, JsonValue> => {
  const { deckName, modelName, fields, tags, allowDuplicate, duplicateScope } = params;
  const noteParams: Record<string, JsonValue> = { deckName, modelName, fields };

  if (tags !== undefined && tags.length > 0) {
    noteParams["tags"] = tags;
  }

  const options = buildNoteOptions({
    allowDuplicate,
    duplicateScope,
    duplicateScopeOptions: params.duplicateScopeOptions,
  });
  if (options !== undefined) {
    noteParams["options"] = options;
  }

  return noteParams;
};

/**
 * 添加单条笔记(上游 addNote)。批量请用 add-batch。
 * 排序字段(第一字段)必须非空; 错误按 duplicate/model/deck/field 分类提示。
 */
export const runAddNote = async (
  client: AnkiPort,
  params: AddNoteParams,
): Promise<AddNoteResult> => {
  try {
    const { deckName, modelName, fields, tags, allowDuplicate, duplicateScope } = params;

    const fieldNames = await requireModelFields(client, modelName);
    const sortField = fieldNames[0]!;
    requireSortFieldValue(fields, sortField, modelName);

    const noteParams = buildNoteRequest(params);

    const noteId = parseResponse(
      "addNote",
      optionalNumberResponse,
      await client.invoke<unknown>("addNote", { note: noteParams }),
    );

    if (!noteId) {
      throw classifyAddNoteError("Failed to create note - it may be a duplicate", {
        deckName,
        modelName,
        allowDuplicate,
      });
    }

    const effectiveScope: "deck" | "collection" | "default" | "none" = allowDuplicate
      ? "none"
      : duplicateScope || "default";

    return {
      success: true,
      noteId,
      deckName,
      modelName,
      message: `Successfully created note in deck "${deckName}"`,
      details: {
        fieldsAdded: Object.keys(fields).length,
        tagsAdded: tags ? tags.length : 0,
        duplicateCheckScope: effectiveScope,
      },
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw classifyAddNoteError(error instanceof Error ? error.message : String(error), {
      deckName: params.deckName,
      modelName: params.modelName,
      allowDuplicate: params.allowDuplicate,
    });
  }
};
