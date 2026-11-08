import type { NanoFlowSettings } from "../contract.js";

const KB = 1024;

const formatKb = (bytes: number): string => {
  const value = bytes / KB;
  return Number.isInteger(value) ? `${value} KB` : `${value.toFixed(2)} KB`;
};

/**
 * 把当前设置渲染成「具体值」列表。
 * @param settings - 当前生效的设置。
 * @returns 具体值 Markdown 文本。
 */
export const buildLimitsValues = (settings: NanoFlowSettings): string => {
  return [
    `- spec.md ≤ ${formatKb(settings.specMaxBytes)}`,
    `- 单条 note ≤ ${formatKb(settings.noteMaxBytes)}`,
    `- description ≤ ${settings.noteDescriptionMaxChars} 字`,
    `- CONTEXT.md ≤ ${formatKb(settings.contextMaxBytes)}`,
    `- question ≤ ${formatKb(settings.questionMaxBytes)}`,
    `- ADR ≤ ${formatKb(settings.adrMaxBytes)}`,
    `- workflow ≤ ${formatKb(settings.workflowMaxBytes)}`,
    `- GUIDE.md ≤ ${formatKb(settings.guideMaxBytes)}`,
  ].join("\n");
};

/**
 * 把 `prompts/limit.md` 的静态模板与当前设置的具体值拼成注入块。
 *
 * 规则的措辞由 `prompts/limit.md` 维护；这里只负责追加来自
 * `nano-flow.json` 的数字，避免把具体值写死在提示词里。
 * @param template - `prompts/limit.md` 的正文。
 * @param settings - 当前生效的设置。
 * @returns 可直接拼接到 GUIDE 之后的 Markdown 文本。
 */
export const buildLimitsText = (template: string, settings: NanoFlowSettings): string => {
  return `${template.trim()}\n\n${buildLimitsValues(settings)}`;
};
