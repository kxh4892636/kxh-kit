import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const replaceTagsParamsSchema = z.object({
  notes: z.array(z.number()).min(1).max(1000),
  tagToReplace: z.string().min(1),
  replaceWithTag: z.string().min(1),
});

export type ReplaceTagsParams = z.infer<typeof replaceTagsParamsSchema>;

export interface ReplaceTagsResult {
  success: boolean;
  message: string;
  notesAffected: number;
  tagToReplace: string;
  replaceWithTag: string;
}

// 重命名标签(上游 replaceTags): 单标签, 不允许空格。
export const runReplaceTags = async (
  client: AnkiConnectClient,
  params: ReplaceTagsParams,
): Promise<ReplaceTagsResult> => {
  try {
    const { notes, tagToReplace, replaceWithTag } = params;

    const trimmedOld = tagToReplace.trim();
    const trimmedNew = replaceWithTag.trim();

    if (trimmedOld === "" || trimmedNew === "") {
      throw new Error("tagToReplace and replaceWithTag cannot be empty");
    }
    if (trimmedOld.includes(" ") || trimmedNew.includes(" ")) {
      throw new Error("Tags cannot contain spaces. Use single tags only.");
    }

    await client.invoke<null>("replaceTags", {
      notes,
      tag_to_replace: trimmedOld,
      replace_with_tag: trimmedNew,
    });

    return {
      success: true,
      message: `Successfully replaced "${trimmedOld}" with "${trimmedNew}" in ${notes.length} note(s)`,
      notesAffected: notes.length,
      tagToReplace: trimmedOld,
      replaceWithTag: trimmedNew,
    };
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "replaceTags",
      hint: "Make sure Anki is running and the note IDs are valid",
    });
  }
};
