import { z } from "zod";
import { JsonError, modelFailureHints, translateJsonError } from "../errors";
import type { AnkiPort } from "../port";
import { nullResponse, parseResponse } from "../responses";
import { requireModelFields } from "./fields-command";

export const repositionModelFieldParamsSchema = z.object({
  modelName: z.string().min(1),
  fieldName: z.string().min(1),
  index: z.number().int().min(0),
});

export type RepositionModelFieldParams = z.infer<typeof repositionModelFieldParamsSchema>;

export interface RepositionModelFieldResult {
  success: boolean;
  modelName: string;
  fieldName: string;
  newIndex: number;
  message: string;
}

/**
 * 调整字段位置(上游 repositionModelField)。
 * 预检字段存在与 index 范围(AnkiConnect 对越界 index 静默截断)。
 */
export const runRepositionModelField = async (
  client: AnkiPort,
  params: RepositionModelFieldParams,
): Promise<RepositionModelFieldResult> => {
  try {
    const { modelName, fieldName, index } = params;

    const fields = await requireModelFields(client, modelName, "repositionModelField", {
      modelName,
      fieldName,
      index,
    });

    if (!fields.includes(fieldName)) {
      throw new JsonError(`Field "${fieldName}" does not exist in model "${modelName}"`, {
        action: "repositionModelField",
        details: { modelName, fieldName, index },
        hint: "Field names are case-sensitive. Use models fields to see the current field names.",
      });
    }

    if (index < 0 || index > fields.length - 1) {
      throw new JsonError(
        `Index ${index} is out of range for model "${modelName}". Valid range is 0-${fields.length - 1} (the model has ${fields.length} fields). AnkiConnect would silently clamp the index instead of erroring.`,
        {
          action: "repositionModelField",
          details: { modelName, fieldName, index },
          hint: "Index out of range. Use models fields to see how many fields exist.",
        },
      );
    }

    parseResponse(
      "modelFieldReposition",
      nullResponse,
      await client.invoke<unknown>("modelFieldReposition", { modelName, fieldName, index }),
    );

    return {
      success: true,
      modelName,
      fieldName,
      newIndex: index,
      message: `Successfully moved field "${fieldName}" to position ${index} in model "${modelName}"`,
    };
  } catch (error) {
    throw translateJsonError(error, {
      action: "repositionModelField",
      details: { modelName: params.modelName, fieldName: params.fieldName, index: params.index },
      ...modelFailureHints.modelField,
    });
  }
};
