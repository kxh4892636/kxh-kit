import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export interface SyncResult {
  success: boolean;
  message: string;
  timestamp: string;
}

// 与 AnkiWeb 同步(上游 sync 工具的行为对齐: 失败时附登录/运行提示)。
export const runSync = async (client: AnkiConnectClient): Promise<SyncResult> => {
  try {
    await client.invoke("sync");
    return {
      success: true,
      message: "Successfully synchronized with AnkiWeb",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "sync",
      hint: "Make sure Anki is running and you are logged into AnkiWeb",
    });
  }
};
