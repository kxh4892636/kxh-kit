import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { modelTemplatesResponse, parseResponse } from "../responses";

export const modelTemplatesParamsSchema = z.object({
  modelName: z.string().min(1),
});

export type ModelTemplatesParams = z.infer<typeof modelTemplatesParamsSchema>;

export interface ModelTemplatesResult {
  success: boolean;
  modelName: string;
  templates: Record<string, { Front: string; Back: string }>;
  message: string;
  hint: string;
}

// 笔记类型的卡片模板(上游 modelTemplates)。
export const runModelTemplates = async (
  client: AnkiPort,
  params: ModelTemplatesParams,
): Promise<ModelTemplatesResult> => {
  try {
    const { modelName } = params;

    const templates = parseResponse(
      "modelTemplates",
      modelTemplatesResponse,
      await client.invoke<unknown>("modelTemplates", { modelName }),
    );

    if (!templates || Object.keys(templates).length === 0) {
      throw new JsonError(`Model "${modelName}" not found or has no card templates`, {
        action: "modelTemplates",
        details: { modelName },
        hint: "Use models list to see available models",
      });
    }

    const cardCount = Object.keys(templates).length;

    return {
      success: true,
      modelName,
      templates,
      message: `Retrieved ${cardCount} card template(s) for model "${modelName}"`,
      hint: "Use models update-templates to modify the Front/Back HTML of these card templates",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "modelTemplates",
      details: { modelName: params.modelName },
      hint: "Make sure the model name is correct and Anki is running",
    });
  }
};
