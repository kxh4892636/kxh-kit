import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { nullResponse, parseResponse } from "../responses";

export interface SyncResult {
  readonly success: boolean;
  readonly message: string;
  readonly timestamp: string;
}

export const runSync = async (port: AnkiPort, now: () => Date): Promise<SyncResult> => {
  try {
    parseResponse("sync", nullResponse, await port.invoke<unknown>("sync"));
    return {
      success: true,
      message: "Successfully synchronized with AnkiWeb",
      timestamp: now().toISOString(),
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "sync",
      hint: "Make sure Anki is running and you are logged into AnkiWeb",
    });
  }
};
