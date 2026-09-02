import type { Dirent } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import ignore from "ignore";

const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

type IgnoreMatcher = ReturnType<typeof ignore>;

export const discoverNestedSkillPaths = async (
  nativeSkillPaths: readonly string[],
): Promise<string[]> => {
  const nestedSkillPaths: string[] = [];
  const canonicalPaths = new Set<string>();
  for (const nativeSkillPath of nativeSkillPaths) {
    const canonicalPath = await canonicalizePath(nativeSkillPath);
    if (canonicalPath !== undefined) canonicalPaths.add(canonicalPath);
  }
  for (const nativeSkillPath of nativeSkillPaths) {
    const nativeSkillRoot = dirname(nativeSkillPath);
    const discoveredForParent: string[] = [];
    await collectNestedSkillPaths(
      nativeSkillRoot,
      nativeSkillRoot,
      true,
      ignore(),
      discoveredForParent,
    );
    discoveredForParent.sort((left: string, right: string): number =>
      compareOrdinal(
        toPosixPath(relative(nativeSkillRoot, left)),
        toPosixPath(relative(nativeSkillRoot, right)),
      ),
    );
    for (const discoveredPath of discoveredForParent) {
      const canonicalPath = await canonicalizePath(discoveredPath);
      if (canonicalPath === undefined || canonicalPaths.has(canonicalPath)) continue;
      canonicalPaths.add(canonicalPath);
      nestedSkillPaths.push(discoveredPath);
    }
  }
  return nestedSkillPaths;
};

const collectNestedSkillPaths = async (
  directory: string,
  root: string,
  isNativeSkillRoot: boolean,
  ignoreMatcher: IgnoreMatcher,
  result: string[],
): Promise<void> => {
  let entries: Dirent[];
  try {
    await addIgnoreRules(ignoreMatcher, directory, root);
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.sort((left: Dirent, right: Dirent): number =>
    compareOrdinal(left.name, right.name),
  )) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const entryPath = join(directory, entry.name);
    const kind = await entryKind(entry, entryPath);
    if (kind === undefined) continue;
    const relativePath = toPosixPath(relative(root, entryPath));
    if (ignoreMatcher.ignores(kind === "directory" ? `${relativePath}/` : relativePath)) continue;
    if (kind === "directory") {
      await collectNestedSkillPaths(entryPath, root, false, ignoreMatcher, result);
      continue;
    }
    if (!isNativeSkillRoot && entry.name === "SKILL.md") result.push(entryPath);
  }
};

const addIgnoreRules = async (
  ignoreMatcher: IgnoreMatcher,
  directory: string,
  root: string,
): Promise<void> => {
  const relativeDirectory = relative(root, directory);
  const prefix = relativeDirectory ? `${toPosixPath(relativeDirectory)}/` : "";
  for (const fileName of IGNORE_FILE_NAMES) {
    let content: string;
    try {
      content = await readFile(join(directory, fileName), "utf8");
    } catch {
      continue;
    }
    const patterns = content
      .split(/\r?\n/)
      .map((line: string): string | undefined => prefixIgnorePattern(line, prefix))
      .filter((line: string | undefined): line is string => line !== undefined);
    if (patterns.length > 0) ignoreMatcher.add(patterns);
  }
};

const prefixIgnorePattern = (line: string, prefix: string): string | undefined => {
  const trimmed = line.trim();
  if (!trimmed || (trimmed.startsWith("#") && !trimmed.startsWith("\\#"))) return undefined;
  let pattern = line;
  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith("\\!")) {
    pattern = pattern.slice(1);
  }
  if (pattern.startsWith("/")) pattern = pattern.slice(1);
  const prefixed = `${prefix}${pattern}`;
  return negated ? `!${prefixed}` : prefixed;
};

const entryKind = async (
  entry: Dirent,
  entryPath: string,
): Promise<"directory" | "file" | undefined> => {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  if (!entry.isSymbolicLink()) return undefined;
  try {
    const information = await stat(entryPath);
    // 目录链接可能形成环；文件链接仍可作为 skill 声明并由 canonical path 去重。
    return information.isFile() ? "file" : undefined;
  } catch {
    return undefined;
  }
};

const canonicalizePath = async (path: string): Promise<string | undefined> => {
  try {
    const canonicalPath = await realpath(path);
    return process.platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
  } catch {
    return undefined;
  }
};

const toPosixPath = (path: string): string => path.split(sep).join("/");

const compareOrdinal = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};
