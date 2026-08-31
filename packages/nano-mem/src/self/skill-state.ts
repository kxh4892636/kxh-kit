import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ManagedSkill, SkillState } from "./skill-catalog";
import { hashSkillFiles, managedMarkerName, readSkillFiles } from "./skill-files";

/** .nano-mem-managed.json 内容：安装写入的来源版本与内容哈希。 */
export interface ManagedMarker {
  readonly name: string;
  readonly version: string;
  readonly contentHash: string;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** 读取目录内 marker；缺失或 JSON 非法视为无受管记录（返回 null）。 */
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
    throw new Error(`无法读取受管技能标记 ${directory}`, { cause: error });
  }
};

/**
 * 四态判定（与 loopx skill-state 语义一致，ADR-0003）：
 * - not_installed：目标目录不存在；
 * - modified：目录存在但无 marker / marker 不属于该技能 / 目录内容哈希 ≠ marker.contentHash
 *   （含「本地修改过」与「来自其他来源的非受管目录」两种情况）；
 * - current：未修改，且 marker.version == 包版本 && marker.contentHash == 包内容哈希；
 * - outdated：未修改，但 marker.version ≠ 包版本（包已升级，安装的仍是旧版本内容）。
 */
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
    throw new Error(`无法检查技能 ${target}`, { cause: error });
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
