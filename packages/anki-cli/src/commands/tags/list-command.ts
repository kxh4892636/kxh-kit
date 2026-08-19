import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const getTagsParamsSchema = z.object({
  pattern: z.string().optional(),
});

export type GetTagsParams = z.infer<typeof getTagsParamsSchema>;

export interface GetTagsResult {
  success: boolean;
  tags: string[];
  total: number;
  message: string;
  filtered?: boolean;
  totalUnfiltered?: number;
}

// 列出全部标签(上游 getTags), 可带大小写不敏感的过滤。
export const runGetTags = async (
  client: AnkiConnectClient,
  params: GetTagsParams,
): Promise<GetTagsResult> => {
  try {
    const { pattern } = params;

    const allTags = await client.invoke<string[]>("getTags");

    if (!allTags || allTags.length === 0) {
      return {
        success: true,
        message: "No tags found in Anki collection",
        tags: [],
        total: 0,
      };
    }

    let tags = allTags;
    if (pattern !== undefined && pattern !== "") {
      const lowerPattern = pattern.toLowerCase();
      tags = allTags.filter((tag) => tag.toLowerCase().includes(lowerPattern));
    }

    const filtered = pattern !== undefined && pattern !== "";

    const result: GetTagsResult = {
      success: true,
      tags,
      total: tags.length,
      message: filtered
        ? `Found ${tags.length} tags matching "${pattern}" (${allTags.length} total)`
        : `Found ${tags.length} tags`,
    };
    if (filtered) {
      result.filtered = true;
      result.totalUnfiltered = allTags.length;
    }

    return result;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "getTags",
      hint: "Make sure Anki is running and AnkiConnect is installed",
    });
  }
};
