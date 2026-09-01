import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { parseResponse, stringArrayResponse } from "../responses";

export interface ModelNamesResult {
  success: boolean;
  modelNames: string[];
  total: number;
  message: string;
  commonTypes: {
    basic: string | null;
    basicReversed: string | null;
    cloze: string | null;
  };
}

// 列出全部笔记类型名(上游 modelNames)。
export const runModelNames = async (client: AnkiPort): Promise<ModelNamesResult> => {
  try {
    const modelNames = parseResponse(
      "modelNames",
      stringArrayResponse,
      await client.invoke<unknown>("modelNames"),
    );

    if (!modelNames || modelNames.length === 0) {
      return {
        success: true,
        message: "No note types found in Anki",
        modelNames: [],
        total: 0,
        commonTypes: { basic: null, basicReversed: null, cloze: null },
      };
    }

    return {
      success: true,
      modelNames,
      total: modelNames.length,
      message: `Found ${modelNames.length} note types`,
      commonTypes: {
        basic: modelNames.includes("Basic") ? "Basic" : null,
        basicReversed: modelNames.includes("Basic (and reversed card)")
          ? "Basic (and reversed card)"
          : null,
        cloze: modelNames.includes("Cloze") ? "Cloze" : null,
      },
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "modelNames",
      hint: "Make sure Anki is running and AnkiConnect is installed",
    });
  }
};
