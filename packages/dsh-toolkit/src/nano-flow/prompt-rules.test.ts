import { describe, expect, it } from "vite-plus/test";

import { locateAssetsRoot, readPromptText, readUserPromptText } from "./assets.js";

const assetsRoot = locateAssetsRoot();
const prompt = readPromptText(assetsRoot);
const userPrompt = readUserPromptText(assetsRoot);

/**
 * 固定提示词就是行为规范：改文本时这些断言会先红，避免实现与口径悄悄分叉。
 * 2026-11-13 起与 pi-toolkit 的 system.md / user.md 对齐，规则集以 pi 版为准。
 */
describe("固定提示词的硬规则", () => {
  it("保留一个会话一个绑定的约束", () => {
    expect(prompt).toContain("一个会话只有一个 plan 绑定");
    expect(prompt).toContain("默认复用当前绑定 plan");
  });

  it("保留新建 Plan 必须确认的约束", () => {
    expect(prompt).toContain("新建 plan 显式向用户确认");
  });

  it("保留 note 按交付单元划分的口径", () => {
    expect(prompt).toContain("可独立验收的交付单元");
  });

  it("保留维护循环与 nano_flow_check", () => {
    expect(prompt).toContain("维护循环");
    expect(prompt).toContain("nano_flow_check");
  });

  it("用户提示词仍是每轮注入的短文本，且带批量写与 plain language", () => {
    expect(userPrompt.length).toBeGreaterThan(0);
    expect(userPrompt.length).toBeLessThan(2_000);
    expect(userPrompt).toContain("每个会话轮次开始和结束各执行一次");
    expect(userPrompt).toContain("ISO 24495-1:2023");
  });
});
