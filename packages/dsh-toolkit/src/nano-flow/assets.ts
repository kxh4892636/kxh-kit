import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_MARKER = join("prompts", "agents.md");

/**
 * 定位包内资产目录 `nano-flow/`。
 *
 * 构建产物可能落在 `dist/` 或 `dist/nano-flow/`，所以从模块文件所在目录逐级向上
 * 查找带 `prompts/agents.md` 的 `nano-flow/`，而不是写死相对层级。
 * @param start - 起始目录；缺省为当前模块文件所在目录。
 * @returns 资产目录的绝对路径。
 */
export const locateAssetsRoot = (start?: string): string => {
  let directory = start ?? dirname(fileURLToPath(import.meta.url));
  for (let step = 0; step < 8; step += 1) {
    const candidate = join(directory, "nano-flow");
    if (existsSync(join(candidate, ASSET_MARKER))) return candidate;
    const parent = resolve(directory, "..");
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`nano-flow: 找不到包内资产目录（含 ${ASSET_MARKER} 的 nano-flow/）`);
};

/**
 * 读取固定系统提示词。
 * @param assetsRoot - `nano-flow/` 目录。
 * @returns 去掉首尾空白的提示词正文。
 */
export const readPromptText = (assetsRoot: string): string => {
  return readFileSync(join(assetsRoot, "prompts", "agents.md"), "utf8").trim();
};

/**
 * 读取每次用户输入后追加的提示词。
 * @param assetsRoot - `nano-flow/` 目录。
 * @returns 去掉首尾空白的提示词正文。
 */
export const readUserPromptText = (assetsRoot: string): string => {
  return readFileSync(join(assetsRoot, "prompts", "user.md"), "utf8").trim();
};

/** 动态注入的 skill 根目录。 */
export const assetsSkillsRoot = (assetsRoot: string): string => join(assetsRoot, "skills");

/** 文档模板目录。 */
export const assetsTemplatesRoot = (assetsRoot: string): string => join(assetsRoot, "templates");

/** 工作区校验脚本的绝对路径。 */
export const assetsCheckScript = (assetsRoot: string): string =>
  join(assetsRoot, "scripts", "check-domain.mjs");
