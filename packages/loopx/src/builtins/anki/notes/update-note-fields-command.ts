import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { noteUpdateArrayResponse, nullResponse, parseResponse } from "../responses";
import {
  getMediaUrlConfigFromEnv,
  sanitizeMediaFilename,
  validateMediaUrl,
} from "./media-validation";

export const updateNoteFieldsParamsSchema = z.object({
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
});

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

    const fieldCount = Object.keys(note.fields).length;

    if (fieldCount === 0) {
      throw new JsonError("No fields provided for update", {
        action: "updateNoteFields",
        details: { noteId: note.id },
        hint: "Provide at least one field to update",
      });
    }

    if (note.audio !== undefined) {
      const urlConfig = getMediaUrlConfigFromEnv(env);
      for (const audioItem of note.audio) {
        await validateMediaUrl(audioItem.url, urlConfig, logger);
        audioItem.filename = sanitizeMediaFilename(audioItem.filename);
      }
    }

    if (note.picture !== undefined) {
      const urlConfig = getMediaUrlConfigFromEnv(env);
      for (const pictureItem of note.picture) {
        await validateMediaUrl(pictureItem.url, urlConfig, logger);
        pictureItem.filename = sanitizeMediaFilename(pictureItem.filename);
      }
    }

    const notesInfo = parseResponse(
      "notesInfo",
      noteUpdateArrayResponse,
      await client.invoke<unknown>("notesInfo", { notes: [note.id] }),
    );

    if (!notesInfo || notesInfo.length === 0 || !notesInfo[0]) {
      throw new JsonError("Note not found", {
        action: "updateNoteFields",
        details: { noteId: note.id },
        hint: "The note ID is invalid or the note has been deleted. Use notes find to get valid note IDs.",
      });
    }

    const currentNote = notesInfo[0];
    const modelName = currentNote["modelName"] as string;
    const existingFields = Object.keys((currentNote["fields"] as Record<string, unknown>) ?? {});

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

    const updateParams: Record<string, JsonValue> = {
      note: { id: note.id, fields: note.fields },
    };
    if (note.audio !== undefined) {
      (updateParams["note"] as Record<string, JsonValue>)["audio"] = note.audio;
    }
    if (note.picture !== undefined) {
      (updateParams["note"] as Record<string, JsonValue>)["picture"] = note.picture;
    }

    parseResponse(
      "updateNoteFields",
      nullResponse,
      await client.invoke<unknown>("updateNoteFields", updateParams),
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
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      throw new JsonError(message, {
        action: "updateNoteFields",
        details: { noteId: params.note.id },
        hint: "Note not found. It may have been deleted.",
      });
    }
    if (message.includes("field")) {
      throw new JsonError(message, {
        action: "updateNoteFields",
        details: { noteId: params.note.id, providedFields: Object.keys(params.note.fields) },
        hint: "Check field names match exactly (case-sensitive). Use notes info to see current fields.",
      });
    }

    throw new JsonError(message, {
      action: "updateNoteFields",
      details: { noteId: params.note.id },
      hint: "Make sure Anki is running and the note is not open in the browser",
    });
  }
};
