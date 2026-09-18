/**
 * Nested-skill discovery. pi's built-in scanner stops descending as soon as a
 * directory contains `SKILL.md`, so a `SKILL.md` under another skill directory
 * (for example `.agents/skills/nano-flow/references/skills/questing/SKILL.md`)
 * is invisible. This module returns exactly those hidden skill directories so
 * `resources_discover` can hand them back to pi.
 */

import { existsSync, readdirSync, realpathSync } from "node:fs";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

/** Directory names pruned from the walk. Dot-prefixed names are always pruned. */
const DEFAULT_EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build", "coverage", "out"];

/** Discovery inputs; `agentDir` and `homeDir` are injectable for tests. */
export interface DiscoverOptions {
  readonly cwd: string;
  readonly agentDir?: string;
  readonly homeDir?: string;
  readonly projectTrusted: boolean;
  readonly knownSkillDirs?: readonly string[];
  readonly excludedDirs?: readonly string[];
}

/**
 * Existing skill roots pi itself scans: the agent skills dir, the user
 * `.agents/skills` dir, and (only for trusted projects) `.pi/skills` and
 * `.agents/skills` in `cwd` and its ancestors up to the git root.
 */
export function skillRoots(options: DiscoverOptions): string[] {
  const agentDir = options.agentDir ?? getAgentDir();
  const homeDir = options.homeDir ?? homedir();
  const roots = [join(resolve(agentDir), "skills"), join(resolve(homeDir), ".agents", "skills")];
  if (options.projectTrusted) {
    for (const dir of ancestorDirs(options.cwd)) {
      roots.push(join(dir, CONFIG_DIR_NAME, "skills"));
      roots.push(join(dir, ".agents", "skills"));
    }
  }
  return [...new Set(roots.filter((root) => existsSync(root)))];
}

/**
 * Find every hidden skill directory: a `SKILL.md` whose strict ancestor inside
 * the same root also contains `SKILL.md`, plus everything below a known skill
 * directory. Results are canonicalized and sorted for determinism.
 */
export function findHiddenSkillDirs(options: DiscoverOptions): string[] {
  const excluded = new Set(options.excludedDirs ?? DEFAULT_EXCLUDED_DIRS);
  const found = new Set<string>();
  const record = (dir: string): void => {
    found.add(canonical(dir));
  };

  for (const root of skillRoots(options)) walk(root, false, excluded, record);
  for (const known of options.knownSkillDirs ?? []) {
    const dir = resolve(known);
    if (existsSync(dir)) walkChildren(dir, true, excluded, record);
  }
  return [...found].sort((left, right) => left.localeCompare(right));
}

/** Evaluate one directory, then recurse into its children. */
function walk(
  dir: string,
  ancestorHasSkill: boolean,
  excluded: ReadonlySet<string>,
  record: (dir: string) => void,
): void {
  const entries = readEntries(dir);
  const hasSkill = entries.some((entry) => entry.isFile() && entry.name === "SKILL.md");
  if (hasSkill && ancestorHasSkill) record(dir);
  const childAncestor = ancestorHasSkill || hasSkill;
  for (const entry of entries) {
    if (!entry.isDirectory() || isSkipped(entry.name, excluded)) continue;
    walk(join(dir, entry.name), childAncestor, excluded, record);
  }
}

/** Recurse into the children of a directory without evaluating it as a skill root. */
function walkChildren(
  dir: string,
  ancestorHasSkill: boolean,
  excluded: ReadonlySet<string>,
  record: (dir: string) => void,
): void {
  for (const entry of readEntries(dir)) {
    if (!entry.isDirectory() || isSkipped(entry.name, excluded)) continue;
    walk(join(dir, entry.name), ancestorHasSkill, excluded, record);
  }
}

const readEntries = (dir: string): Dirent[] => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const isSkipped = (name: string, excluded: ReadonlySet<string>): boolean => {
  return name.startsWith(".") || excluded.has(name);
};

const canonical = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

const ancestorDirs = (cwd: string): string[] => {
  const start = resolve(cwd);
  const gitRoot = findGitRoot(start);
  const dirs: string[] = [];
  let dir = start;
  for (;;) {
    dirs.push(dir);
    if (gitRoot !== undefined && dir === gitRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
};

const findGitRoot = (start: string): string | undefined => {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};
