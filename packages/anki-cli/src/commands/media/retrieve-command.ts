import { writeFileSync } from "node:fs";
import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import { sanitizeMediaFilename } from "../../utils/media-validation";

// 把 --out 指定的路径写入 base64 数据(get 命令的 CLI 层辅助)。
export const writeRetrievedBase64 = (data: string, out: string): void => {
  try {
    writeFileSync(out, Buffer.from(data, "base64"));
  } catch {
    throw new JsonError(`无法写入文件: ${out}`, { action: "retrieveMediaFile" });
  }
};

export const retrieveMediaFileParamsSchema = z.object({
  filename: z.string().min(1),
});

export type RetrieveMediaFileParams = z.infer<typeof retrieveMediaFileParamsSchema>;

export interface RetrieveMediaFileResult {
  success: boolean;
  filename: string;
  data: string | null;
  message: string;
  found: boolean;
}

// 取回媒体文件(base64, 上游 retrieveMediaFile), 文件名经路径穿越净化。
export const runRetrieveMediaFile = async (
  client: AnkiConnectClient,
  params: RetrieveMediaFileParams,
): Promise<RetrieveMediaFileResult> => {
  try {
    const filename = sanitizeMediaFilename(params.filename);

    const result = await client.invoke<string | false>("retrieveMediaFile", {
      filename,
    });

    if (result === false) {
      return {
        success: true,
        filename,
        data: null,
        message: `Media file not found: ${filename}`,
        found: false,
      };
    }

    return {
      success: true,
      filename,
      data: result,
      message: `Successfully retrieved media file: ${filename}`,
      found: true,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "retrieveMediaFile",
      hint: "Make sure Anki is running and the filename is valid",
    });
  }
};
