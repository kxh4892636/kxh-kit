import type { JsonValue } from "../../../cli/types";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import {
  base64OrFalseResponse,
  nullResponse,
  parseResponse,
  stringArrayResponse,
  stringResponse,
} from "../responses";
import { sanitizeMediaFilename } from "./media-validation";

export const listMedia = async (
  port: AnkiPort,
  pattern?: string,
): Promise<Record<string, unknown>> => {
  try {
    const files =
      parseResponse(
        "getMediaFilesNames",
        stringArrayResponse,
        await port.invoke<unknown>(
          "getMediaFilesNames",
          pattern === undefined || pattern === "" ? {} : { pattern },
        ),
      ) ?? [];
    const filtered = pattern !== undefined && pattern !== "";
    return {
      success: true,
      files,
      count: files.length,
      message: filtered
        ? `Found ${files.length} media file(s) matching pattern "${pattern}"`
        : `Found ${files.length} media file(s)`,
      ...(filtered ? { pattern } : {}),
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "getMediaFilesNames",
      hint: "Make sure Anki is running",
    });
  }
};

export const retrieveMedia = async (
  port: AnkiPort,
  rawFilename: string,
): Promise<Record<string, unknown>> => {
  try {
    const filename = sanitizeMediaFilename(rawFilename);
    const data = parseResponse(
      "retrieveMediaFile",
      base64OrFalseResponse,
      await port.invoke<unknown>("retrieveMediaFile", { filename }),
    );
    return {
      success: true,
      filename,
      data: data === false ? null : data,
      message:
        data === false
          ? `Media file not found: ${filename}`
          : `Successfully retrieved media file: ${filename}`,
      found: data !== false,
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "retrieveMediaFile",
      hint: "Make sure Anki is running and the filename is valid",
    });
  }
};

export const storeMedia = async (
  port: AnkiPort,
  rawFilename: string,
  source: Readonly<Record<string, JsonValue>>,
): Promise<Record<string, unknown>> => {
  try {
    const filename = sanitizeMediaFilename(rawFilename);
    const stored = parseResponse(
      "storeMediaFile",
      stringResponse,
      await port.invoke<unknown>("storeMediaFile", {
        filename,
        deleteExisting: true,
        ...source,
      }),
    );
    return {
      success: true,
      filename: stored,
      message: `Successfully stored media file: ${stored}`,
      prefixedWithUnderscore: filename.startsWith("_"),
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "storeMediaFile",
      hint: "Make sure Anki is running and the source is valid",
    });
  }
};

export const deleteMedia = async (
  port: AnkiPort,
  rawFilename: string,
): Promise<Record<string, unknown>> => {
  try {
    const filename = sanitizeMediaFilename(rawFilename);
    parseResponse(
      "deleteMediaFile",
      nullResponse,
      await port.invoke<unknown>("deleteMediaFile", { filename }),
    );
    return {
      success: true,
      filename,
      message: `Successfully deleted media file: ${filename}`,
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "deleteMediaFile",
      hint: "Make sure Anki is running and the filename is valid",
    });
  }
};
