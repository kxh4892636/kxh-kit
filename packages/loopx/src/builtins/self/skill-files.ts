import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ManagedSkillFile } from "./skill-catalog";

export const managedMarkerName = ".loopx-managed.json";

export const readSkillFiles = async (
  directory: string,
  prefix = "",
): Promise<readonly ManagedSkillFile[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: ManagedSkillFile[] = [];
  for (const entry of entries.sort((left: Dirent, right: Dirent): number =>
    left.name.localeCompare(right.name),
  )) {
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await readSkillFiles(absolutePath, relativePath)));
    else if (entry.isFile() && entry.name !== managedMarkerName) {
      files.push({ path: relativePath, content: await readFile(absolutePath, "utf8") });
    }
  }
  return files;
};

export const hashSkillFiles = (files: readonly ManagedSkillFile[]): string => {
  const hash = createHash("sha256");
  for (const file of files) hash.update(file.path).update("\0").update(file.content).update("\0");
  return hash.digest("hex");
};
