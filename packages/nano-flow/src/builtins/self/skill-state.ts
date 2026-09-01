import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ManagedSkill, SkillState } from "./skill-catalog";
import { hashSkillFiles, managedMarkerName, readSkillFiles } from "./skill-files";

export interface ManagedMarker {
  readonly name: string;
  readonly version: string;
  readonly contentHash: string;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const readManagedMarker = async (directory: string): Promise<ManagedMarker | null> => {
  try {
    const value: unknown = JSON.parse(
      await readFile(path.join(directory, managedMarkerName), "utf8"),
    );
    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string" &&
      "version" in value &&
      typeof value.version === "string" &&
      "contentHash" in value &&
      typeof value.contentHash === "string"
    ) {
      return { name: value.name, version: value.version, contentHash: value.contentHash };
    }
    return null;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return null;
    throw new Error(`Unable to read managed skill marker at ${directory}`, { cause: error });
  }
};

export const inspectSkill = async (
  skill: ManagedSkill,
  targetRoot: string,
): Promise<SkillState> => {
  const target = path.resolve(targetRoot, skill.name);
  let files: Awaited<ReturnType<typeof readSkillFiles>>;
  try {
    files = await readSkillFiles(target);
  } catch (error) {
    if (isMissing(error))
      return { name: skill.name, version: skill.version, target, status: "not_installed" };
    throw new Error(`Unable to inspect skill at ${target}`, { cause: error });
  }
  const marker = await readManagedMarker(target);
  const actualHash = hashSkillFiles(files);
  if (marker === null || marker.name !== skill.name || marker.contentHash !== actualHash) {
    return { name: skill.name, version: skill.version, target, status: "modified" };
  }
  const status =
    marker.version === skill.version && marker.contentHash === skill.contentHash
      ? "current"
      : "outdated";
  return { name: skill.name, version: skill.version, target, status };
};
