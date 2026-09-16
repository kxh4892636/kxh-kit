import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { errorMessage, JsonError, translateJsonError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { noteUpdateArrayResponse, nullResponse, parseResponse } from "../responses";
import { mediaUrlConfig, sanitizeMediaFilename, validateMediaUrl } from "../media/media-validation";

export const updateNoteFieldsParamsSchema = z.lazy(() =>
  z.object({
    note: z.object({
      id: z.number(),
      fields: z.record(z.string(), z.string()),
      audio: z
        .array(
          z.object({
            url: z.string(),
            filename: z.string(),
            fields: z.array(z.string()),
          }),
        )
        .optional(),
      picture: z
        .array(
          z.object({
            url: z.string(),
            filename: z.string(),
            fields: z.array(z.string()),
          }),
        )
        .optional(),
    }),
  }),
);

export type UpdateNoteFieldsParams = z.infer<typeof updateNoteFieldsParamsSchema>;

export interface UpdateNoteFieldsResult {
  success: boolean;
  noteId: number;
  updatedFields: string[];
  fieldCount: number;
  modelName: string;
  message: string;
  cssNote: string;
  warning: string;
  hint: string;
}

type NoteAttachment = { url: string; filename: string; fields: string[] };

// 空字段更新必然无效, 在连接 Anki 之前就拒绝, 避免无意义的上游调用。
const requireFieldCount = (note: UpdateNoteFieldsParams["note"]): number => {
  const fieldCount = Object.keys(note.fields).length;

  if (fieldCount === 0) {
    throw new JsonError("No fields provided for update", {
      action: "updateNoteFields",
      details: { noteId: note.id },
      hint: "Provide at least one field to update",
    });
  }

  return fieldCount;
};

// audio 与 picture 走完全相同的校验链(SSRF 白名单 + 文件名净化), 因此合成一个入口;
// 每次调用都重新解析一次允许主机, 与逐附件处理的原始顺序保持一致。
const prepareAttachments = async (
  items: readonly NoteAttachment[] | undefined,
  env: Readonly<Record<string, string | undefined>>,
  logger: Logger | undefined,
): Promise<void> => {
  if (items === undefined) return;

  const urlConfig = mediaUrlConfig(env);
  for (const item of items) {
    await validateMediaUrl(item.url, urlConfig, logger);
    item.filename = sanitizeMediaFilename(item.filename);
  }
};

// 只有拿到当前笔记才能判断待更新字段是否属于该模型。
const requireUpdateTarget = async (
  client: AnkiPort,
  noteId: number,
): Promise<{ existingFields: string[]; modelName: string }> => {
  const notesInfo = parseResponse(
    "notesInfo",
    noteUpdateArrayResponse,
    await client.invoke<unknown>("notesInfo", { notes: [noteId] }),
  );

  if (!notesInfo || notesInfo.length === 0 || !notesInfo[0]) {
    throw new JsonError("Note not found", {
      action: "updateNoteFields",
      details: { noteId },
      hint: "The note ID is invalid or the note has been deleted. Use notes find to get valid note IDs.",
    });
  }

  const currentNote = notesInfo[0];
  return {
    modelName: currentNote["modelName"] as string,
    existingFields: Object.keys((currentNote["fields"] as Record<string, unknown>) ?? {}),
  };
};

// 上游会静默忽略不存在的字段, 因此在本地列出全部非法字段名供用户核对。
const assertFieldsExist = (
  note: UpdateNoteFieldsParams["note"],
  modelName: string,
  existingFields: readonly string[],
): void => {
  const invalidFields = Object.keys(note.fields).filter(
    (field: string): boolean => !existingFields.includes(field),
  );

  if (invalidFields.length > 0) {
    throw new JsonError(`Invalid fields for model "${modelName}"`, {
      action: "updateNoteFields",
      details: {
        noteId: note.id,
        modelName,
        invalidFields,
        validFields: existingFields,
      },
      hint: `These fields don't exist in the "${modelName}" model. Use models fields to see valid fields.`,
    });
  }
};

const buildUpdateParams = (note: UpdateNoteFieldsParams["note"]): Record<string, JsonValue> => {
  const updateParams: Record<string, JsonValue> = {
    note: { id: note.id, fields: note.fields },
  };
  if (note.audio !== undefined) {
    (updateParams["note"] as Record<string, JsonValue>)["audio"] = note.audio;
  }
  if (note.picture !== undefined) {
    (updateParams["note"] as Record<string, JsonValue>)["picture"] = note.picture;
  }
  return updateParams;
};

// 「字段不存在」比「笔记不存在」更具体, 但上游文案可能同时命中两者, 保持原有判定顺序。
const translateUpdateFailure = (
  error: unknown,
  note: UpdateNoteFieldsParams["note"],
): JsonError => {
  if (error instanceof JsonError) return error;

  const message = errorMessage(error);
  if (!message.includes("not found") && message.includes("field")) {
    return new JsonError(message, {
      action: "updateNoteFields",
      details: { noteId: note.id, providedFields: Object.keys(note.fields) },
      hint: "Check field names match exactly (case-sensitive). Use notes info to see current fields.",
    });
  }

  return translateJsonError(error, {
    action: "updateNoteFields",
    details: { noteId: note.id },
    hint: "Make sure Anki is running and the note is not open in the browser",
    notFoundHint: "Note not found. It may have been deleted.",
    markers: ["not found"],
  });
};

/**
 * 更新笔记字段(上游 updateNoteFields)。
 * 注意上游坑: 笔记在 Anki 浏览器中打开时更新会静默失败(结果里始终带 warning)。
 * audio/picture URL 经 SSRF 校验, 文件名经净化。
 */
export const runUpdateNoteFields = async (
  client: AnkiPort,
  params: UpdateNoteFieldsParams,
  env: Readonly<Record<string, string | undefined>>,
  logger?: Logger,
): Promise<UpdateNoteFieldsResult> => {
  try {
    const { note } = params;

    const fieldCount = requireFieldCount(note);
    await prepareAttachments(note.audio, env, logger);
    await prepareAttachments(note.picture, env, logger);

    const { existingFields, modelName } = await requireUpdateTarget(client, note.id);
    assertFieldsExist(note, modelName, existingFields);

    parseResponse(
      "updateNoteFields",
      nullResponse,
      await client.invoke<unknown>("updateNoteFields", buildUpdateParams(note)),
    );

    return {
      success: true,
      noteId: note.id,
      updatedFields: Object.keys(note.fields),
      fieldCount,
      modelName,
      message: `Successfully updated ${fieldCount} field${fieldCount === 1 ? "" : "s"} in note`,
      cssNote: "HTML content is preserved. Model CSS styling remains unchanged.",
      warning:
        "If changes don't appear, ensure the note wasn't open in Anki browser during update.",
      hint: "Use notes info to verify the changes or notes find to locate other notes to update.",
    };
  } catch (error) {
    throw translateUpdateFailure(error, params.note);
  }
};
