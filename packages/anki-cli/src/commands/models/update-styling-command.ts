import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const updateModelStylingParamsSchema = z.object({
  modelName: z.string().min(1),
  css: z.string().min(1),
});

export type UpdateModelStylingParams = z.infer<typeof updateModelStylingParamsSchema>;

export interface UpdateModelStylingResult {
  success: boolean;
  modelName: string;
  cssLength: number;
  cssInfo: {
    hasRtlSupport: boolean;
    hasCardStyling: boolean;
    hasFrontStyling: boolean;
    hasBackStyling: boolean;
    hasClozeStyling: boolean;
  };
  message: string;
  oldCssLength?: number;
  cssLengthChange?: number;
}

// 更新笔记类型 CSS(上游 updateModelStyling), 影响该类型全部卡片。
export const runUpdateModelStyling = async (
  client: AnkiConnectClient,
  params: UpdateModelStylingParams,
): Promise<UpdateModelStylingResult> => {
  try {
    const { modelName, css } = params;

    let oldStyling: { css: string } | null = null;
    try {
      oldStyling = await client.invoke<{ css: string }>("modelStyling", {
        modelName,
      });
    } catch {
      // 模型可能不存在, 交由下方更新调用报错
    }

    await client.invoke("updateModelStyling", {
      model: { name: modelName, css },
    });

    const hasRtl = css.includes("direction: rtl") || css.includes("direction:rtl");

    const response: UpdateModelStylingResult = {
      success: true,
      modelName,
      cssLength: css.length,
      cssInfo: {
        hasRtlSupport: hasRtl,
        hasCardStyling: css.includes(".card"),
        hasFrontStyling: css.includes(".front"),
        hasBackStyling: css.includes(".back"),
        hasClozeStyling: css.includes(".cloze"),
      },
      message: `Successfully updated CSS styling for model "${modelName}"`,
    };

    if (oldStyling !== null) {
      response.oldCssLength = oldStyling.css.length;
      response.cssLengthChange = css.length - oldStyling.css.length;
    }

    return response;
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
        action: "updateModelStyling",
        details: { modelName: params.modelName },
        hint: "Model not found. Use models list to see available models.",
      });
    }

    throw new JsonError(message, {
      action: "updateModelStyling",
      details: { modelName: params.modelName },
      hint: "Make sure Anki is running and the model name is correct.",
    });
  }
};
