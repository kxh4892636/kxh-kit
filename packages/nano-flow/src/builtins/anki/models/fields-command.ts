import { z } from "zod";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { parseResponse, stringArrayResponse } from "../responses";

const modelFieldNamesParamsSchema = z.object({
  modelName: z.string().min(1),
});

export type ModelFieldNamesParams = z.infer<typeof modelFieldNamesParamsSchema>;

export interface ModelFieldNamesResult {
  success: boolean;
  modelName: string;
  fieldNames: string[];
  total: number;
  message: string;
  example?: Record<string, string>;
  hint?: string;
}

/** 读取笔记类型的字段列表(上游 modelFieldNames)。 */
const fetchModelFields = async (client: AnkiPort, modelName: string): Promise<string[] | null> =>
  parseResponse(
    "modelFieldNames",
    stringArrayResponse,
    await client.invoke<unknown>("modelFieldNames", { modelName }),
  );

/**
 * 字段写操作的前置读取: AnkiConnect 对不存在的模型同样返回空数组,
 * 无法区分「模型没有字段」与「模型不存在」, 故统一按后者报错。
 * action/details 随命令而异, 由调用方给出。
 */
export const requireModelFields = async (
  client: AnkiPort,
  modelName: string,
  action: string,
  details: Readonly<Record<string, unknown>>,
): Promise<string[]> => {
  const fields = await fetchModelFields(client, modelName);
  if (!fields || fields.length === 0) {
    throw new JsonError(`Model "${modelName}" has no fields or does not exist`, {
      action,
      details,
      hint: "Model not found. Use models list to see available models.",
    });
  }
  return fields;
};

// 笔记类型的字段名列表(上游 modelFieldNames), 常见类型附示例字段。
export const runModelFieldNames = async (
  client: AnkiPort,
  params: ModelFieldNamesParams,
): Promise<ModelFieldNamesResult> => {
  try {
    const { modelName } = params;

    const fieldNames = await fetchModelFields(client, modelName);

    if (!fieldNames) {
      throw new JsonError(`Model "${modelName}" not found`, {
        action: "modelFieldNames",
        details: { modelName },
        hint: "Use models list to see available models",
      });
    }

    if (fieldNames.length === 0) {
      return {
        success: true,
        modelName,
        fieldNames: [],
        total: 0,
        message: `Model "${modelName}" has no fields`,
      };
    }

    let exampleFields: Record<string, string> | undefined;
    const lowerModelName = modelName.toLowerCase();

    if (lowerModelName.includes("basic") && !lowerModelName.includes("reversed")) {
      exampleFields = { Front: "Question or prompt text", Back: "Answer or response text" };
    } else if (lowerModelName.includes("basic") && lowerModelName.includes("reversed")) {
      exampleFields = { Front: "First side of the card", Back: "Second side of the card" };
    } else if (lowerModelName.includes("cloze")) {
      exampleFields = {
        Text: "The {{c1::hidden}} text will be replaced with [...] on the card",
        "Back Extra": "Additional information or hints",
      };
    }

    const result: ModelFieldNamesResult = {
      success: true,
      modelName,
      fieldNames,
      total: fieldNames.length,
      message: `Model "${modelName}" has ${fieldNames.length} field${fieldNames.length !== 1 ? "s" : ""}`,
    };

    if (exampleFields !== undefined) {
      result.example = exampleFields;
      result.hint = "Use these field names as keys when creating notes with notes add";
    }

    return result;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "modelFieldNames",
      details: { modelName: params.modelName },
      hint: "Make sure the model name is correct and Anki is running",
    });
  }
};
