import type { NanoFlowSettings } from "../contract.js";

const KB = 1024;

const formatKb = (bytes: number): string => {
  const value = bytes / KB;
  return Number.isInteger(value) ? `${value} KB` : `${value.toFixed(2)} KB`;
};

/**
 * 把当前设置渲染成注入系统提示词顶部的篇幅限制块。
 *
 * 结构固定为「规则 + 概述 + 具体值」，数值全部来自 `nano-flow.json`，
 * 不把具体数字写死在提示词里。
 * @param settings - 当前生效的设置。
 * @returns 可直接拼接到固定提示词后的 Markdown 文本。
 */
export const buildLimitsText = (settings: NanoFlowSettings): string => {
  return [
    "## 篇幅限制",
    "",
    "规则：超过上限时先压缩；只允许删除能由 note、领域文档、代码或命令重新查到的内容，并在删除处留下指针；压缩后仍有事实无处可查时，拆成 note 或领域文档。",
    "",
    "概述：spec、note、CONTEXT、question、ADR、workflow 有字节上限；description 有字数上限；ADR 数量与追踪 Note 行数不限制。",
    "",
    "具体值：",
    `- spec.md ≤ ${formatKb(settings.specMaxBytes)}`,
    `- 单条 note ≤ ${formatKb(settings.noteMaxBytes)}`,
    `- description ≤ ${settings.noteDescriptionMaxChars} 字`,
    `- CONTEXT.md ≤ ${formatKb(settings.contextMaxBytes)}`,
    `- question ≤ ${formatKb(settings.questionMaxBytes)}`,
    `- ADR ≤ ${formatKb(settings.adrMaxBytes)}`,
    `- workflow ≤ ${formatKb(settings.workflowMaxBytes)}`,
  ].join("\n");
};
