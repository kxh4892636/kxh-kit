import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const updateModelTemplatesParamsSchema = z.object({
  modelName: z.string().min(1),
  templates: z
    .record(z.string(), z.object({ Front: z.string().min(1), Back: z.string().min(1) }))
    .refine((t) => Object.keys(t).length > 0, {
      message: "At least one card template is required",
    }),
});

export type UpdateModelTemplatesParams = z.infer<typeof updateModelTemplatesParamsSchema>;

export interface UpdateModelTemplatesResult {
  success: boolean;
  modelName: string;
  templateCount: number;
  message: string;
  hint: string;
}

/**
 * 更新卡片模板(上游 updateModelTemplates)。
 * 模板名大小写敏感: 预检未知名并拒绝(AnkiConnect 会静默忽略未知名)。
 */
export const runUpdateModelTemplates = async (
  client: AnkiConnectClient,
  params: UpdateModelTemplatesParams,
): Promise<UpdateModelTemplatesResult> => {
  try {
    const { modelName, templates } = params;

    const existingTemplates = await client.invoke<Record<
      string,
      { Front: string; Back: string }
    > | null>("modelTemplates", { modelName });

    if (!existingTemplates || Object.keys(existingTemplates).length === 0) {
      throw new JsonError(`Model "${modelName}" has no templates or does not exist`, {
        action: "updateModelTemplates",
        details: { modelName },
        hint: "Model not found. Use models list to see available models.",
      });
    }

    const existingNames = new Set(Object.keys(existingTemplates));
    const unknownNames = Object.keys(templates).filter((name) => !existingNames.has(name));

    if (unknownNames.length > 0) {
      const offending = unknownNames.map((name) => `"${name}"`).join(", ");
      const validNames = Object.keys(existingTemplates)
        .map((name) => `"${name}"`)
        .join(", ");
      throw new JsonError(
        `Card template(s) not found in model "${modelName}": ${offending}. Valid templates: ${validNames}. Use models templates to see current names.`,
        {
          action: "updateModelTemplates",
          details: { modelName },
          hint: `Card template names are case-sensitive and must match exactly. Valid templates: ${validNames}.`,
        },
      );
    }

    const templateCount = Object.keys(templates).length;

    await client.invoke("updateModelTemplates", {
      model: { name: modelName, templates },
    });

    return {
      success: true,
      modelName,
      templateCount,
      message: `Successfully updated ${templateCount} card template(s) for model "${modelName}"`,
      hint: "Template changes apply to all cards using this model. Use gui browse to preview changes.",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("model not found")
    ) {
      throw new JsonError(message, {
        action: "updateModelTemplates",
        details: { modelName: params.modelName },
        hint: "Model not found. Use models list to see available models.",
      });
    }

    throw new JsonError(message, {
      action: "updateModelTemplates",
      details: { modelName: params.modelName },
      hint: "Make sure Anki is running and the model name is correct.",
    });
  }
};
