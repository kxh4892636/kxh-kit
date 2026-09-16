import { z } from "zod";
import { JsonError, modelFailureHints, translateJsonError } from "../errors";
import type { AnkiPort } from "../port";
import { nullResponse, parseResponse } from "../responses";

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
  client: AnkiPort,
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

    parseResponse(
      "modelFieldRemove",
      nullResponse,
      await client.invoke<unknown>("modelFieldRemove", { modelName, fieldName }),
    );

    return {
      success: true,
      modelName,
      fieldName,
      message: `Successfully removed field "${fieldName}" from model "${modelName}". All data in this field has been deleted.`,
    };
  } catch (error) {
    throw translateJsonError(error, {
      action: "removeModelField",
      details: { modelName: params.modelName, fieldName: params.fieldName },
      ...modelFailureHints.modelField,
    });
  }
};
