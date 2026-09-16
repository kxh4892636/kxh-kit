import { z } from "zod";
import { JsonError, modelFailureHints, translateJsonError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { modelStylingResponse, nullResponse, parseResponse } from "../responses";

// 读取与替换同一份模型 CSS 的两个命令合并在此文件: 二者共享同一套样式语义与响应解析,
// 合并后仍保持命令与目录规模上限(models 目录已有 13 个文件)。
const modelStylingParamsSchema = z.object({
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

export const updateModelStylingParamsSchema = z.lazy(() =>
  z.object({
    modelName: z.string().min(1),
    css: z.string().min(1),
  }),
);

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
  client: AnkiPort,
  params: UpdateModelStylingParams,
  logger?: Logger,
): Promise<UpdateModelStylingResult> => {
  try {
    const { modelName, css } = params;

    let oldStyling: { css: string } | null = null;
    try {
      oldStyling = parseResponse(
        "modelStyling",
        modelStylingResponse,
        await client.invoke<unknown>("modelStyling", { modelName }),
      );
    } catch (error: unknown) {
      logger?.warn(
        `Unable to read existing styling before update: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    parseResponse(
      "updateModelStyling",
      nullResponse,
      await client.invoke<unknown>("updateModelStyling", {
        model: { name: modelName, css },
      }),
    );

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
    throw translateJsonError(error, {
      action: "updateModelStyling",
      details: { modelName: params.modelName },
      ...modelFailureHints.model,
    });
  }
};
