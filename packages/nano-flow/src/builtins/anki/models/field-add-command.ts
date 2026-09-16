import { z } from "zod";
import type { JsonValue } from "../../../cli/types";
import { JsonError, modelFailureHints, translateJsonError } from "../errors";
import type { AnkiPort } from "../port";
import { nullResponse, parseResponse } from "../responses";
import { requireModelFields } from "./fields-command";

export const addModelFieldParamsSchema = z.object({
  modelName: z.string().min(1),
  fieldName: z.string().min(1),
  index: z.number().int().min(0).optional(),
});

export type AddModelFieldParams = z.infer<typeof addModelFieldParamsSchema>;

export interface AddModelFieldResult {
  success: boolean;
  modelName: string;
  fieldName: string;
  index: number | null;
  message: string;
}

/**
 * 给笔记类型添加字段(上游 addModelField)。
 * AnkiConnect 不校验: 重名会静默跳过(带 index 时反而重排已有字段)、
 * 越界 index 会静默截断, 故写前对当前字段预检。
 */
export const runAddModelField = async (
  client: AnkiPort,
  params: AddModelFieldParams,
): Promise<AddModelFieldResult> => {
  try {
    const { modelName, fieldName, index } = params;

    const fields = await requireModelFields(client, modelName, "addModelField", {
      modelName,
      fieldName,
    });

    if (fields.includes(fieldName)) {
      throw new JsonError(
        `Field "${fieldName}" already exists in model "${modelName}". AnkiConnect would silently skip the add instead of erroring (and reposition the existing field if an index is given).`,
        {
          action: "addModelField",
          details: { modelName, fieldName },
          hint: `Field "${fieldName}" already exists. Use models fields to see existing fields.`,
        },
      );
    }

    const caseVariant = fields.find(
      (field: string): boolean => field.toLowerCase() === fieldName.toLowerCase(),
    );
    if (caseVariant !== undefined) {
      throw new JsonError(
        `Field "${fieldName}" collides with existing field "${caseVariant}" in model "${modelName}" (names differ only in case)`,
        {
          action: "addModelField",
          details: { modelName, fieldName },
          hint: `Field names are case-sensitive, but "${fieldName}" differs from existing field "${caseVariant}" only in case. Pick a distinct name.`,
        },
      );
    }

    if (index !== undefined && (index < 0 || index > fields.length)) {
      throw new JsonError(
        `Index ${index} is out of range for model "${modelName}". Valid range is 0-${fields.length} (${fields.length} appends at the end). AnkiConnect would silently clamp the index instead of erroring.`,
        {
          action: "addModelField",
          details: { modelName, fieldName, index },
          hint: "Use models fields to see how many fields exist.",
        },
      );
    }

    const invokeParams: Record<string, JsonValue> = { modelName, fieldName };
    if (index !== undefined) {
      invokeParams["index"] = index;
    }

    parseResponse(
      "modelFieldAdd",
      nullResponse,
      await client.invoke<unknown>("modelFieldAdd", invokeParams),
    );

    return {
      success: true,
      modelName,
      fieldName,
      index: index ?? null,
      message:
        index !== undefined
          ? `Successfully added field "${fieldName}" to model "${modelName}" at position ${index}`
          : `Successfully added field "${fieldName}" to model "${modelName}"`,
    };
  } catch (error) {
    throw translateJsonError(error, {
      action: "addModelField",
      details: { modelName: params.modelName, fieldName: params.fieldName },
      ...modelFailureHints.model,
    });
  }
};
