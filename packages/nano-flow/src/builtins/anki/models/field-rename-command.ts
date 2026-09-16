import { z } from "zod";
import { JsonError, modelFailureHints, translateJsonError } from "../errors";
import type { AnkiPort } from "../port";
import { nullResponse, parseResponse } from "../responses";
import { requireModelFields } from "./fields-command";

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

// 同名改名是空操作, 先拒绝可以省掉一次字段目录查询。
const assertRenamingSomething = (params: RenameModelFieldParams): void => {
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
};

// 旧字段必须真实存在: 上游只会因名字不匹配而静默失败, 得不到可读的错误。
const assertOldFieldExists = (fields: readonly string[], params: RenameModelFieldParams): void => {
  const { modelName, oldFieldName, newFieldName } = params;
  if (!fields.includes(oldFieldName)) {
    throw new JsonError(`Field "${oldFieldName}" does not exist in model "${modelName}"`, {
      action: "renameModelField",
      details: { modelName, oldFieldName, newFieldName },
      hint: "Field names are case-sensitive. Use models fields to see the current field names.",
    });
  }
};

const assertTargetNameAvailable = (
  fields: readonly string[],
  params: RenameModelFieldParams,
): void => {
  const { modelName, oldFieldName, newFieldName } = params;
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
};

// 大小写变体冲突: 仅当目标是正在改名的字段本身时允许(合法的改大小写)。
const assertNoCaseVariantCollision = (
  fields: readonly string[],
  params: RenameModelFieldParams,
): void => {
  const { modelName, oldFieldName, newFieldName } = params;
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
};

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

    assertRenamingSomething(params);

    const fields = await requireModelFields(client, modelName, "renameModelField", {
      modelName,
      oldFieldName,
      newFieldName,
    });
    assertOldFieldExists(fields, params);
    assertTargetNameAvailable(fields, params);
    assertNoCaseVariantCollision(fields, params);

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
    throw translateJsonError(error, {
      action: "renameModelField",
      details: {
        modelName: params.modelName,
        oldFieldName: params.oldFieldName,
        newFieldName: params.newFieldName,
      },
      ...modelFailureHints.modelField,
    });
  }
};
