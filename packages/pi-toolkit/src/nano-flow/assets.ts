/**
 * 随包资产定位：固定提示词、skill 根目录与校验脚本。
 *
 * 包由 pi 的 jiti 直接加载 TS，没有构建步骤，所以资产就在源码同级目录；
 * 用 `import.meta.url` 定位，不依赖进程工作目录。
 * @module @kxh4892636/pi-toolkit/nano-flow/assets
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** `nano-flow/` 资产目录。 */
export const assetsRoot = (): string => fileURLToPath(new URL("./", import.meta.url));

/** 固定提示词正文（去掉首尾空白）。 */
export const readPromptText = (): string => {
  return readFileSync(fileURLToPath(new URL("./prompt.md", import.meta.url)), "utf8").trim();
};

/** 随包 skill 根目录。 */
export const assetsSkillsRoot = (): string => fileURLToPath(new URL("./skills/", import.meta.url));

/** 领域校验脚本的绝对路径。 */
export const assetsCheckScript = (): string =>
  fileURLToPath(new URL("./scripts/check-domain.mjs", import.meta.url));
