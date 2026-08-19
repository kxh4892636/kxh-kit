import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const findNotesParamsSchema = z.object({
  query: z.string().min(1),
});

export type FindNotesParams = z.infer<typeof findNotesParamsSchema>;

export interface FindNotesResult {
  success: boolean;
  noteIds: number[];
  count: number;
  query: string;
  message: string;
  hint?: string;
}

// 按 Anki 查询语法搜索笔记(上游 findNotes)。
export const runFindNotes = async (
  client: AnkiConnectClient,
  params: FindNotesParams,
): Promise<FindNotesResult> => {
  try {
    const { query } = params;

    const noteIds = await client.invoke<number[]>("findNotes", { query });

    if (!noteIds || noteIds.length === 0) {
      return {
        success: true,
        noteIds: [],
        count: 0,
        query,
        message: "No notes found matching the search criteria",
        hint: "Try a broader search query or check your deck/tag names",
      };
    }

    const result: FindNotesResult = {
      success: true,
      noteIds,
      count: noteIds.length,
      query,
      message: `Found ${noteIds.length} note${noteIds.length === 1 ? "" : "s"} matching the query`,
      hint:
        noteIds.length > 100
          ? "Large result set. Consider using notes info with smaller batches for detailed information."
          : "Use notes info to get detailed information about these notes",
    };

    return result;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("query")) {
      throw new JsonError(message, {
        action: "findNotes",
        details: { query: params.query },
        hint: "Invalid query syntax. Check Anki documentation for valid search syntax.",
      });
    }

    throw new JsonError(message, {
      action: "findNotes",
      details: { query: params.query },
      hint: "Make sure Anki is running and the query syntax is valid",
    });
  }
};
