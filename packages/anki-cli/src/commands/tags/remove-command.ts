import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const removeTagsParamsSchema = z.object({
  notes: z.array(z.number()).min(1).max(1000),
  tags: z.string().min(1),
});

export type RemoveTagsParams = z.infer<typeof removeTagsParamsSchema>;

export interface RemoveTagsResult {
  success: boolean;
  message: string;
  notesAffected: number;
  tagsRemoved: string[];
}

// 从笔记移除标签(上游 removeTags)。
export const runRemoveTags = async (
  client: AnkiConnectClient,
  params: RemoveTagsParams,
): Promise<RemoveTagsResult> => {
  try {
    const { notes, tags } = params;

    const trimmedTags = tags.trim();
    if (trimmedTags === "") {
      throw new Error("tags string cannot be empty");
    }
    const tagList = trimmedTags.split(/\s+/).filter(Boolean);

    await client.invoke<null>("removeTags", { notes, tags: trimmedTags });

    return {
      success: true,
      message: `Successfully removed ${tagList.length} tag(s) from ${notes.length} note(s)`,
      notesAffected: notes.length,
      tagsRemoved: tagList,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "removeTags",
      hint: "Make sure Anki is running and the note IDs are valid",
    });
  }
};
