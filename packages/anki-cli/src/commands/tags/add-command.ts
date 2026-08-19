import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const addTagsParamsSchema = z.object({
  notes: z.array(z.number()).min(1).max(1000),
  tags: z.string().min(1),
});

export type AddTagsParams = z.infer<typeof addTagsParamsSchema>;

export interface AddTagsResult {
  success: boolean;
  message: string;
  notesAffected: number;
  tagsAdded: string[];
}

// 给笔记添加标签(上游 addTags): 标签为空格分隔字符串。
export const runAddTags = async (
  client: AnkiConnectClient,
  params: AddTagsParams,
): Promise<AddTagsResult> => {
  try {
    const { notes, tags } = params;

    const trimmedTags = tags.trim();
    if (trimmedTags === "") {
      throw new Error("tags string cannot be empty");
    }
    const tagList = trimmedTags.split(/\s+/).filter(Boolean);

    await client.invoke<null>("addTags", { notes, tags: trimmedTags });

    return {
      success: true,
      message: `Successfully added ${tagList.length} tag(s) to ${notes.length} note(s)`,
      notesAffected: notes.length,
      tagsAdded: tagList,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "addTags",
      hint: "Make sure Anki is running and the note IDs are valid",
    });
  }
};
