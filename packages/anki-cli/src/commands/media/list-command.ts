import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const getMediaFilesNamesParamsSchema = z.object({
  pattern: z.string().optional(),
});

export type GetMediaFilesNamesParams = z.infer<typeof getMediaFilesNamesParamsSchema>;

export interface GetMediaFilesNamesResult {
  success: boolean;
  files: string[];
  count: number;
  message: string;
  pattern?: string;
}

// 列出 collection.media 中的媒体文件(上游 getMediaFilesNames)。
export const runGetMediaFilesNames = async (
  client: AnkiConnectClient,
  params: GetMediaFilesNamesParams,
): Promise<GetMediaFilesNamesResult> => {
  try {
    const { pattern } = params;

    const ankiParams: Record<string, unknown> = {};
    if (pattern !== undefined && pattern !== "") {
      ankiParams["pattern"] = pattern;
    }

    const result = await client.invoke<string[]>("getMediaFilesNames", ankiParams);

    const filtered = pattern !== undefined && pattern !== "";

    const message = filtered
      ? `Found ${result.length} media file(s) matching pattern "${pattern}"`
      : `Found ${result.length} media file(s)`;

    const response: GetMediaFilesNamesResult = {
      success: true,
      files: result,
      count: result.length,
      message,
    };
    if (filtered) {
      response.pattern = pattern;
    }

    return response;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "getMediaFilesNames",
      hint: "Make sure Anki is running",
    });
  }
};
