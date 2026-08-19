import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import {
  getMediaFilePathConfigFromEnv,
  getMediaUrlConfigFromEnv,
  sanitizeMediaFilename,
  validateMediaFilePath,
  validateMediaUrl,
} from "../../utils/media-validation";

export const storeMediaFileParamsSchema = z.object({
  filename: z.string().min(1),
  data: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
  deleteExisting: z.boolean().optional(),
});

export type StoreMediaFileParams = z.infer<typeof storeMediaFileParamsSchema>;

export interface StoreMediaFileResult {
  success: boolean;
  filename: string;
  message: string;
  prefixedWithUnderscore: boolean;
}

// 把 --out 指定的路径写入 base64 数据(取回命令的 CLI 层辅助, 见 retrieve-command)。

/**
 * 存入媒体文件(上游 storeMediaFile)。三种来源互斥: data(base64)/path(本地路径,
 * MIME 白名单 + 可选目录限制)/url(SSRF 校验); 文件名净化。
 */
export const runStoreMediaFile = async (
  client: AnkiConnectClient,
  params: StoreMediaFileParams,
): Promise<StoreMediaFileResult> => {
  try {
    const { data, path, url } = params;
    const deleteExisting = params.deleteExisting ?? true;

    if (!data && !path && !url) {
      throw new Error("Must provide either data, path, or url parameter");
    }

    const sources = [data, path, url].filter(Boolean);
    if (sources.length > 1) {
      throw new Error("Cannot provide multiple sources (data, path, url). Choose one.");
    }

    const filename = sanitizeMediaFilename(params.filename);

    let validatedPath: string | undefined;
    if (path !== undefined) {
      const { resolvedPath } = validateMediaFilePath(path, getMediaFilePathConfigFromEnv());
      validatedPath = resolvedPath;
    }

    if (url !== undefined) {
      await validateMediaUrl(url, getMediaUrlConfigFromEnv());
    }

    const prefixedWithUnderscore = filename.startsWith("_");

    const ankiParams: Record<string, unknown> = {
      filename,
      deleteExisting,
    };

    if (data !== undefined) {
      ankiParams["data"] = data;
    } else if (validatedPath !== undefined) {
      ankiParams["path"] = validatedPath;
    } else if (url !== undefined) {
      ankiParams["url"] = url;
    }

    const result = await client.invoke<string>("storeMediaFile", ankiParams);

    if (!result) {
      throw new Error("Failed to store media file");
    }

    return {
      success: true,
      filename: result,
      message: `Successfully stored media file: ${result}`,
      prefixedWithUnderscore,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "storeMediaFile",
      hint: "Make sure Anki is running and the source is valid",
    });
  }
};
