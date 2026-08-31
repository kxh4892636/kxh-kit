import { readdir } from "node:fs/promises";
import path from "node:path";
import { hashSkillFiles, readSkillFiles } from "./skill-files";

/** 受管技能树中的单个文件（相对路径 + utf8 内容）。 */
export interface ManagedSkillFile {
  readonly path: string;
  readonly content: string;
}

/** 包内受管技能：files 为包内 `skills/<name>/` 的全部普通文件（不含 marker）。 */
export interface ManagedSkill {
  readonly name: string;
  readonly version: string;
  readonly contentHash: string;
  readonly files: readonly ManagedSkillFile[];
}

/** 安装状态四值：not_installed / current / outdated / modified（语义见 skill-state.ts）。 */
export type SkillStatus = "not_installed" | "current" | "outdated" | "modified";

export interface SkillState {
  readonly name: string;
  readonly version: string;
  readonly target: string;
  readonly status: SkillStatus;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/**
 * 读取包内受管技能目录：`skills/` 下每个非隐藏子目录为一个技能（name=目录名），
 * version 取包版本（ADR-0003：skill 与 CLI 同版发布）。
 * `root` 由调用方给出（CLI 层按包根解析；打包后代码全部合入 dist/main.mjs，
 * 相对包根的位置随打包变化，不能由本模块推断）。
 */
export const loadSkillCatalog = async (options: {
  readonly version: string;
  readonly root: string;
}): Promise<readonly ManagedSkill[]> => {
  const root = options.root;
  let names: string[];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    names = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissing(error)) throw new Error(`技能目录不存在: ${root}`, { cause: error });
    throw error;
  }
  const skills: ManagedSkill[] = [];
  for (const name of names) {
    const files = await readSkillFiles(path.join(root, name));
    skills.push({ name, version: options.version, contentHash: hashSkillFiles(files), files });
  }
  return skills;
};
