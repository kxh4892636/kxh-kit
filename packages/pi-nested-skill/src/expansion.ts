import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";

const SKILL_MARKER_PATTERN = /\/skill:([a-z0-9]+(?:-[a-z0-9]+)*)/g;
const LEFT_NON_BOUNDARY_CHARACTER_PATTERN = /[\p{L}\p{M}\p{N}_./:=~#?-]/u;
const RIGHT_NON_BOUNDARY_CHARACTER_PATTERN = /[\p{L}\p{M}\p{N}_/-]/u;

export interface SkillReadWarning {
  name: string;
  path: string;
}

export interface ExpansionResult {
  text: string;
  changed: boolean;
}

export type SkillCatalog = ReadonlyMap<string, string>;
export type WarningSink = (warning: SkillReadWarning) => void;

export const expandSkillMarkers = async (
  text: string,
  catalog: SkillCatalog,
  warn: WarningSink,
): Promise<ExpansionResult> => {
  let cursor = 0;
  let expandedText = "";
  let changed = false;
  for (const match of text.matchAll(SKILL_MARKER_PATTERN)) {
    const marker = match[0];
    const name = match[1];
    const index = match.index;
    if (name === undefined || index === undefined) continue;
    const precedingCharacter = text.slice(0, index).match(/[\s\S]$/u)?.[0];
    const followingCharacter = text.slice(index + marker.length).match(/^[\s\S]/u)?.[0];
    if (
      (precedingCharacter !== undefined &&
        (precedingCharacter === "\\" ||
          LEFT_NON_BOUNDARY_CHARACTER_PATTERN.test(precedingCharacter))) ||
      (followingCharacter !== undefined &&
        (followingCharacter === "\\" ||
          RIGHT_NON_BOUNDARY_CHARACTER_PATTERN.test(followingCharacter)))
    ) {
      continue;
    }
    const filePath = catalog.get(name);
    if (filePath === undefined) continue;

    let skillBlock: string;
    try {
      const body = stripFrontmatter(await readFile(filePath, "utf8")).trim();
      skillBlock = `<skill name="${name}" location="${filePath}">\nReferences are relative to ${dirname(filePath)}.\n\n${body}\n</skill>`;
    } catch {
      warn({ name, path: filePath });
      continue;
    }

    expandedText += text.slice(cursor, index);
    expandedText += skillBlock;
    cursor = index + marker.length;
    changed = true;
  }

  if (!changed) return { text, changed: false };
  expandedText += text.slice(cursor);
  return { text: expandedText, changed: true };
};
