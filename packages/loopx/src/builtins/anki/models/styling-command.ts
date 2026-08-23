import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { modelStylingResponse, parseResponse } from "../responses";

export const modelStylingParamsSchema = z.object({
  modelName: z.string().min(1),
});

export type ModelStylingParams = z.infer<typeof modelStylingParamsSchema>;

export interface ModelStylingResult {
  success: boolean;
  modelName: string;
  css: string;
  cssInfo: {
    length: number;
    hasCardStyling: boolean;
    hasFrontStyling: boolean;
    hasBackStyling: boolean;
    hasClozeStyling: boolean;
  };
  message: string;
  hint: string;
}

// 笔记类型的 CSS 样式(上游 modelStyling)。
export const runModelStyling = async (
  client: AnkiPort,
  params: ModelStylingParams,
): Promise<ModelStylingResult> => {
  try {
    const { modelName } = params;

    const styling = parseResponse(
      "modelStyling",
      modelStylingResponse,
      await client.invoke<unknown>("modelStyling", { modelName }),
    );

    if (!styling || !styling.css) {
      throw new JsonError(`Model "${modelName}" not found or has no styling`, {
        action: "modelStyling",
        details: { modelName },
        hint: "Use models list to see available models",
      });
    }

    const css = styling.css;

    return {
      success: true,
      modelName,
      css,
      cssInfo: {
        length: css.length,
        hasCardStyling: css.includes(".card"),
        hasFrontStyling: css.includes(".front"),
        hasBackStyling: css.includes(".back"),
        hasClozeStyling: css.includes(".cloze"),
      },
      message: `Retrieved CSS styling for model "${modelName}"`,
      hint: "This CSS is automatically applied when cards of this type are rendered in Anki",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "modelStyling",
      details: { modelName: params.modelName },
      hint: "Make sure the model name is correct and Anki is running",
    });
  }
};
