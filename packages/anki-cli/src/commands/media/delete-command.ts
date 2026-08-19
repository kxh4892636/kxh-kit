import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import { sanitizeMediaFilename } from "../../utils/media-validation";

export const deleteMediaFileParamsSchema = z.object({
  filename: z.string().min(1),
  confirmed: z.boolean(),
});

export type DeleteMediaFileParams = z.infer<typeof deleteMediaFileParamsSchema>;

export interface DeleteMediaFileResult {
  success: boolean;
  filename: string;
  message: string;
}

// 删除媒体文件(上游 deleteMediaFile, 破坏性, 必须 --yes)。
export const runDeleteMediaFile = async (
  client: AnkiConnectClient,
  params: DeleteMediaFileParams,
): Promise<DeleteMediaFileResult> => {
  try {
    if (!params.confirmed) {
      throw new JsonError("Deletion not confirmed", {
        action: "deleteMediaFile",
        details: { filename: sanitizeMediaFilename(params.filename) },
        hint: "Set --yes to permanently delete this media file",
      });
    }

    const filename = sanitizeMediaFilename(params.filename);

    await client.invoke<void>("deleteMediaFile", { filename });

    return {
      success: true,
      filename,
      message: `Successfully deleted media file: ${filename}`,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "deleteMediaFile",
      hint: "Make sure Anki is running and the filename is valid",
    });
  }
};
