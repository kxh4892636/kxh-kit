import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export interface ClearUnusedTagsResult {
  success: boolean;
  message: string;
}

// 清理未被任何笔记使用的孤儿标签(上游 clearUnusedTags, 破坏性)。
export const runClearUnusedTags = async (
  client: AnkiConnectClient,
  confirmed: boolean,
): Promise<ClearUnusedTagsResult> => {
  try {
    if (!confirmed) {
      throw new JsonError("Clear unused tags not confirmed", {
        action: "clearUnusedTags",
        hint: "Set --yes to permanently remove all orphaned tags",
      });
    }

    await client.invoke<null>("clearUnusedTags");

    return {
      success: true,
      message: "Successfully cleared unused tags from the collection",
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "clearUnusedTags",
      hint: "Make sure Anki is running",
    });
  }
};
