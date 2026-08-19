import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const removeModelFieldParamsSchema = z.object({
  modelName: z.string().min(1),
  fieldName: z.string().min(1),
  confirmDeletion: z.boolean(),
});

export type RemoveModelFieldParams = z.infer<typeof removeModelFieldParamsSchema>;

export interface RemoveModelFieldResult {
  success: boolean;
  modelName: string;
  fieldName: string;
  message: string;
}

/**
 * 移除笔记类型字段(上游 removeModelField), 该字段全部数据被永久删除,
 * 必须 --yes 确认。
 */
export const runRemoveModelField = async (
  client: AnkiConnectClient,
  params: RemoveModelFieldParams,
): Promise<RemoveModelFieldResult> => {
  try {
    const { modelName, fieldName, confirmDeletion } = params;

    if (!confirmDeletion) {
      throw new JsonError("Deletion not confirmed", {
        action: "removeModelField",
        details: { modelName, fieldName },
        hint: "Set --yes to confirm you want to permanently delete this field and all its data.",
      });
    }

    await client.invoke("modelFieldRemove", { modelName, fieldName });

    return {
      success: true,
      modelName,
      fieldName,
      message: `Successfully removed field "${fieldName}" from model "${modelName}". All data in this field has been deleted.`,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("does not exist")) {
      throw new JsonError(message, {
        action: "removeModelField",
        details: { modelName: params.modelName, fieldName: params.fieldName },
        hint: "Model or field not found. Use models list and models fields to verify names.",
      });
    }

    throw new JsonError(message, {
      action: "removeModelField",
      details: { modelName: params.modelName, fieldName: params.fieldName },
      hint: "Make sure Anki is running and the model and field names are correct.",
    });
  }
};
