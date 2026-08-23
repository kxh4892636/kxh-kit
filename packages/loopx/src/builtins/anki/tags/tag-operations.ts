import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { nullResponse, parseResponse, stringArrayResponse } from "../responses";

export interface TagChangeParams {
  readonly notes: readonly number[];
  readonly tags: readonly string[];
}

const tagText = (tags: readonly string[]): string => tags.join(" ").trim();
const outputTags = (tags: readonly string[]): readonly string[] =>
  tagText(tags)
    .split(/\s+/u)
    .filter((tag: string): boolean => tag !== "");

export const listTags = async (
  port: AnkiPort,
  pattern?: string,
): Promise<Record<string, unknown>> => {
  try {
    const allTags =
      parseResponse("getTags", stringArrayResponse, await port.invoke<unknown>("getTags")) ?? [];
    const filtered = pattern !== undefined && pattern !== "";
    const tags = filtered
      ? allTags.filter((tag: string): boolean => tag.toLowerCase().includes(pattern.toLowerCase()))
      : allTags;
    return {
      success: true,
      tags,
      total: tags.length,
      message: filtered
        ? `Found ${tags.length} tags matching "${pattern}" (${allTags.length} total)`
        : allTags.length === 0
          ? "No tags found in Anki collection"
          : `Found ${tags.length} tags`,
      ...(filtered ? { filtered: true, totalUnfiltered: allTags.length } : {}),
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "getTags",
      hint: "Make sure Anki is running and AnkiConnect is installed",
    });
  }
};

export const changeTags = async (
  port: AnkiPort,
  action: "addTags" | "removeTags",
  params: TagChangeParams,
): Promise<Record<string, unknown>> => {
  try {
    const tags = tagText(params.tags);
    const changedTags = outputTags(params.tags);
    parseResponse(
      action,
      nullResponse,
      await port.invoke<unknown>(action, { notes: params.notes, tags }),
    );
    return {
      success: true,
      message: `Successfully ${action === "addTags" ? "added" : "removed"} ${changedTags.length} tag(s) ${action === "addTags" ? "to" : "from"} ${params.notes.length} note(s)`,
      notesAffected: params.notes.length,
      [action === "addTags" ? "tagsAdded" : "tagsRemoved"]: changedTags,
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action,
      hint: "Make sure Anki is running and the note IDs are valid",
    });
  }
};

export const replaceTag = async (
  port: AnkiPort,
  notes: readonly number[],
  from: string,
  to: string,
): Promise<Record<string, unknown>> => {
  try {
    parseResponse(
      "replaceTags",
      nullResponse,
      await port.invoke<unknown>("replaceTags", {
        notes,
        tag_to_replace: from,
        replace_with_tag: to,
      }),
    );
    return {
      success: true,
      message: `Successfully replaced "${from}" with "${to}" in ${notes.length} note(s)`,
      notesAffected: notes.length,
      tagToReplace: from,
      replaceWithTag: to,
    };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "replaceTags",
      hint: "Make sure Anki is running and the note IDs are valid",
    });
  }
};

export const clearUnusedTags = async (port: AnkiPort): Promise<Record<string, unknown>> => {
  try {
    parseResponse("clearUnusedTags", nullResponse, await port.invoke<unknown>("clearUnusedTags"));
    return { success: true, message: "Successfully cleared unused tags from the collection" };
  } catch (error: unknown) {
    if (error instanceof JsonError) throw error;
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "clearUnusedTags",
      hint: "Make sure Anki is running",
    });
  }
};
