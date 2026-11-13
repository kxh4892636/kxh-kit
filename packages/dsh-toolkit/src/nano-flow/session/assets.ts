import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 发布布局（dist/nano-flow）与源码布局（src/nano-flow）的资产路径。
 *
 * 源码按能力分目录（session / documents / dream），发布包保持
 * `prompts/ templates/ skills/ scripts/` 这四个稳定的运行时入口。
 */
const ASSETS = {
  system: ["prompts/system.md", "session/prompts/system.md"],
  user: ["prompts/user.md", "session/prompts/user.md"],
  limit: ["prompts/limit.md", "session/prompts/limit.md"],
  dream: ["prompts/dream.md", "dream/prompt.md"],
  templates: ["templates", "documents/templates"],
  skills: ["skills", "skills"],
  checkScript: ["scripts/check-domain.mjs", "documents/check-domain.mjs"],
} as const;

const pickAsset = (assetsRoot: string, candidates: readonly [string, string]): string => {
  const published = join(assetsRoot, candidates[0]);
  return existsSync(published) ? published : join(assetsRoot, candidates[1]);
};

/**
 * 定位包内资产目录 `nano-flow/`。
 *
 * 发布产物落在 `dist/nano-flow/`，源码在 `src/nano-flow/`；两种布局都带
 * 系统提示词，所以按它定位而不是写死层级。
 * @param start - 起始目录；缺省为当前模块文件所在目录。
 * @returns 资产目录的绝对路径。
 */
export const locateAssetsRoot = (start?: string): string => {
  let directory = start ?? dirname(fileURLToPath(import.meta.url));
  for (let step = 0; step < 8; step += 1) {
    const candidate = join(directory, "nano-flow");
    if (
      existsSync(join(candidate, "prompts", "system.md")) ||
      existsSync(join(candidate, "session", "prompts", "system.md"))
    ) {
      return candidate;
    }
    const parent = resolve(directory, "..");
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("nano-flow: 找不到包内资产目录（含系统提示词的 nano-flow/）");
};

/** 读取固定系统提示词。 */
export const readPromptText = (assetsRoot: string): string =>
  readFileSync(pickAsset(assetsRoot, ASSETS.system), "utf8").trim();

/** 读取每次用户输入后追加的提示词。 */
export const readUserPromptText = (assetsRoot: string): string =>
  readFileSync(pickAsset(assetsRoot, ASSETS.user), "utf8").trim();

/** 读取篇幅限制的静态模板；具体值由 `limits.ts` 追加。 */
export const readLimitTemplate = (assetsRoot: string): string =>
  readFileSync(pickAsset(assetsRoot, ASSETS.limit), "utf8").trim();

/** dream 任务的完整提示词路径。 */
export const assetsDreamPromptPath = (assetsRoot: string): string =>
  pickAsset(assetsRoot, ASSETS.dream);

/** 动态注入的 skill 根目录。 */
export const assetsSkillsRoot = (assetsRoot: string): string =>
  pickAsset(assetsRoot, ASSETS.skills);

/** 文档模板目录。 */
export const assetsTemplatesRoot = (assetsRoot: string): string =>
  pickAsset(assetsRoot, ASSETS.templates);

/** 工作区校验脚本的绝对路径。 */
export const assetsCheckScript = (assetsRoot: string): string =>
  pickAsset(assetsRoot, ASSETS.checkScript);
