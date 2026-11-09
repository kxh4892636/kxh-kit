/**
 * `$skill-name` reference parsing and expansion. Matches the host's own
 * `/skill:` expansion shape so the model sees the same `<skill>` block.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";

/** A resolved skill ready to be embedded. */
export interface SkillReference {
  readonly name: string;
  readonly filePath: string;
  readonly baseDir: string;
  readonly body: string;
}

/** One `$name` token with its span in the source text. */
export interface DollarReference {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/** Result of expanding every resolvable `$name` token. */
export interface ExpandResult {
  readonly text: string;
  readonly expanded: readonly string[];
  readonly unknown: readonly string[];
}

const DOLLAR_REFERENCE = /\$([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w:./-])/gu;

/**
 * Find `$name` tokens that start at the beginning of the text or after
 * whitespace. The trailing guard keeps `$foo:bar`, `$foo/bar` and `$foo.bar`
 * out; uppercase names like `$HOME` never match because names are lowercase.
 */
export function findDollarReferences(text: string): DollarReference[] {
  const references: DollarReference[] = [];
  for (const match of text.matchAll(DOLLAR_REFERENCE)) {
    const name = match[1];
    const start = match.index;
    if (name === undefined || start === undefined) continue;
    if (start > 0 && !/\s/u.test(text[start - 1] ?? "")) continue;
    references.push({ name, start, end: start + match[0].length });
  }
  return references;
}

/**
 * Replace every resolvable `$name` with its skill block; leave unknown tokens
 * untouched. Multiple references are expanded independently.
 */
export function expandSkillReferences(
  text: string,
  lookup: (name: string) => SkillReference | undefined,
): ExpandResult {
  const references = findDollarReferences(text);
  if (references.length === 0) return { text, expanded: [], unknown: [] };

  const expanded = new Set<string>();
  const unknown = new Set<string>();
  let result = "";
  let cursor = 0;
  for (const reference of references) {
    result += text.slice(cursor, reference.start);
    const skill = lookup(reference.name);
    if (skill === undefined) {
      result += text.slice(reference.start, reference.end);
      unknown.add(reference.name);
    } else {
      result += skillBlock(skill);
      expanded.add(reference.name);
    }
    cursor = reference.end;
  }
  result += text.slice(cursor);
  return { text: result, expanded: [...expanded], unknown: [...unknown] };
}

/** Build the host-compatible skill block. */
export function skillBlock(reference: SkillReference): string {
  return (
    `<skill name="${reference.name}" location="${reference.filePath}">\n` +
    `References are relative to ${reference.baseDir}.\n\n` +
    `${reference.body}\n</skill>`
  );
}

/** Read a SKILL.md and strip its frontmatter. */
export function loadSkillReference(name: string, filePath: string): SkillReference {
  const content = readFileSync(filePath, "utf-8");
  return {
    name,
    filePath,
    baseDir: dirname(filePath),
    body: stripFrontmatter(content).trim(),
  };
}
