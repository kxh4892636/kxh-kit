import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { modelCreateResponse, parseResponse } from "../responses";

export const createModelParamsSchema = z.object({
  modelName: z.string().min(1),
  inOrderFields: z.array(z.string().min(1)).min(1),
  cardTemplates: z
    .array(
      z.object({
        Name: z.string().min(1),
        Front: z.string().min(1),
        Back: z.string().min(1),
      }),
    )
    .min(1),
  css: z.string().optional(),
  isCloze: z.boolean().optional(),
});

export type CreateModelParams = z.infer<typeof createModelParamsSchema>;

export interface CreateModelResult {
  success: boolean;
  modelName: string;
  modelId: number | null;
  fields: string[];
  templateCount: number;
  hasCss: boolean;
  isCloze: boolean;
  message: string;
  warnings?: string[];
}

// Anki 特殊字段引用, 模板校验时跳过。
const SPECIAL_FIELDS = new Set(["FrontSide", "Tags", "Type", "Deck", "Subdeck", "Card"]);

/**
 * 创建笔记类型(上游 createModel)。模板中引用了未声明字段时只警告不报错。
 */
export const runCreateModel = async (
  client: AnkiPort,
  params: CreateModelParams,
): Promise<CreateModelResult> => {
  try {
    const { modelName, inOrderFields, cardTemplates, css, isCloze } = params;

    const warnings: string[] = [];
    const fieldSet = new Set(inOrderFields);

    for (const template of cardTemplates) {
      const templateContent = `${template.Front} ${template.Back}`;
      const fieldRefs = templateContent.match(/\{\{([^}]+)\}\}/g) || [];

      for (const ref of fieldRefs) {
        const fieldName = ref.slice(2, -2).trim();
        if (SPECIAL_FIELDS.has(fieldName) || fieldName.startsWith("cloze:")) {
          continue;
        }

        if (!fieldSet.has(fieldName)) {
          warnings.push(
            `Template "${template.Name}" references field "{{${fieldName}}}" which is not in inOrderFields`,
          );
        }
      }
    }

    const result = parseResponse(
      "createModel",
      modelCreateResponse,
      await client.invoke<unknown>("createModel", {
        modelName,
        inOrderFields,
        cardTemplates,
        ...(css === undefined ? {} : { css }),
        isCloze: isCloze ?? false,
      }),
    );

    const response: CreateModelResult = {
      success: true,
      modelName,
      modelId: result.id ?? null,
      fields: inOrderFields,
      templateCount: cardTemplates.length,
      hasCss: Boolean(css),
      isCloze: isCloze ?? false,
      message: `Successfully created model "${modelName}" with ${inOrderFields.length} fields and ${cardTemplates.length} template(s)`,
    };

    if (warnings.length > 0) {
      response.warnings = warnings;
      response.message += ". Note: Some warnings were detected (see warnings field).";
    }

    return response;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already exists") || message.includes("duplicate")) {
      throw new JsonError(message, {
        action: "createModel",
        details: { modelName: params.modelName },
        hint: "A model with this name already exists. Use a different name or use models list to see existing models.",
      });
    }

    throw new JsonError(message, {
      action: "createModel",
      details: { modelName: params.modelName },
      hint: "Make sure Anki is running and all parameters are valid.",
    });
  }
};
