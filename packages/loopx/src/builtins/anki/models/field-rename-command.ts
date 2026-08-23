import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { nullResponse, parseResponse, stringArrayResponse } from "../responses";

export const renameModelFieldParamsSchema = z.object({
  modelName: z.string().min(1),
  oldFieldName: z.string().min(1),
  newFieldName: z.string().min(1),
});

export type RenameModelFieldParams = z.infer<typeof renameModelFieldParamsSchema>;

export interface RenameModelFieldResult {
  success: boolean;
  modelName: string;
  oldFieldName: string;
  newFieldName: string;
  message: string;
  warning?: string;
}

/**
 * 重命名字段(上游 renameModelField)。
 * 模板引用不会自动更新, 结果中始终带 warning 提示手动更新。
 * 预检: 新旧同名、旧字段不存在、新名已存在、大小写变体冲突。
 */
export const runRenameModelField = async (
  client: AnkiPort,
  params: RenameModelFieldParams,
): Promise<RenameModelFieldResult> => {
  try {
    const { modelName, oldFieldName, newFieldName } = params;

    if (oldFieldName === newFieldName) {
      throw new JsonError(
        `Old and new field names are identical ("${oldFieldName}") — nothing to rename`,
        {
          action: "renameModelField",
          details: { modelName, oldFieldName, newFieldName },
          hint: "Provide a new field name that differs from the current one.",
        },
      );
    }

    const fields = parseResponse(
      "modelFieldNames",
      stringArrayResponse,
      await client.invoke<unknown>("modelFieldNames", { modelName }),
    );

    if (!fields || fields.length === 0) {
      throw new JsonError(`Model "${modelName}" has no fields or does not exist`, {
        action: "renameModelField",
        details: { modelName, oldFieldName, newFieldName },
        hint: "Model not found. Use models list to see available models.",
      });
    }

    if (!fields.includes(oldFieldName)) {
      throw new JsonError(`Field "${oldFieldName}" does not exist in model "${modelName}"`, {
        action: "renameModelField",
        details: { modelName, oldFieldName, newFieldName },
        hint: "Field names are case-sensitive. Use models fields to see the current field names.",
      });
    }

    if (fields.includes(newFieldName)) {
      throw new JsonError(
        `A field named "${newFieldName}" already exists in model "${modelName}". AnkiConnect would silently mangle the name with a "+" suffix instead of erroring.`,
        {
          action: "renameModelField",
          details: { modelName, oldFieldName, newFieldName },
          hint: `A field named "${newFieldName}" already exists in this model.`,
        },
      );
    }

    // 大小写变体冲突: 仅当目标是正在改名的字段本身时允许(合法的改大小写)。
    const caseVariant = fields.find(
      (field: string): boolean =>
        field !== oldFieldName && field.toLowerCase() === newFieldName.toLowerCase(),
    );
    if (caseVariant !== undefined) {
      throw new JsonError(
        `Field "${newFieldName}" collides with existing field "${caseVariant}" in model "${modelName}" (names differ only in case)`,
        {
          action: "renameModelField",
          details: { modelName, oldFieldName, newFieldName },
          hint: `Field names are case-sensitive, but "${newFieldName}" differs from existing field "${caseVariant}" only in case. Pick a distinct name.`,
        },
      );
    }

    parseResponse(
      "modelFieldRename",
      nullResponse,
      await client.invoke<unknown>("modelFieldRename", {
        modelName,
        oldFieldName,
        newFieldName,
      }),
    );

    return {
      success: true,
      modelName,
      oldFieldName,
      newFieldName,
      message: `Successfully renamed field "${oldFieldName}" to "${newFieldName}" in model "${modelName}"`,
      warning:
        `Card templates referencing "{{${oldFieldName}}}" must be updated manually ` +
        `to "{{${newFieldName}}}" using the models update-templates command.`,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("does not exist")) {
      throw new JsonError(message, {
        action: "renameModelField",
        details: {
          modelName: params.modelName,
          oldFieldName: params.oldFieldName,
          newFieldName: params.newFieldName,
        },
        hint: "Model or field not found. Use models list and models fields to verify names.",
      });
    }

    throw new JsonError(message, {
      action: "renameModelField",
      details: {
        modelName: params.modelName,
        oldFieldName: params.oldFieldName,
        newFieldName: params.newFieldName,
      },
      hint: "Make sure Anki is running and the model and field names are correct.",
    });
  }
};
