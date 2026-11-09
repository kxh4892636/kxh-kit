import { describe, expect, it } from "vite-plus/test";

import { locateAssetsRoot, readPromptText, readUserPromptText } from "./assets.js";

const prompt = readPromptText(locateAssetsRoot());
const userPrompt = readUserPromptText(locateAssetsRoot());

/**
 * 固定提示词就是行为规范：改文本时这些断言会先红，避免实现与口径悄悄分叉。
 * 只断言「规则还在」，不锁定措辞顺序。
 */
describe("固定提示词的硬规则", () => {
  it("保留每轮两次批量写的节奏", () => {
    expect(prompt).toContain("每轮最多两次批量写");
    expect(prompt).toContain("一轮之内允许滞后");
  });

  it("保留新建 Plan 必须确认的约束", () => {
    expect(prompt).toContain("新建 Plan 必须先得到用户显式确认");
  });

  it("保留 note 按交付单元划分的口径", () => {
    expect(prompt).toContain("一个可独立验收的交付单元");
  });

  it("保留绑定只能经 nano_flow_bind 的约定", () => {
    expect(prompt).toContain("绑定只有一条路径");
  });

  it("保留 GUIDE 只由 dream 写的边界", () => {
    expect(prompt).toContain("只由 dream 维护正文");
  });

  it("用户提示词仍是每轮注入的短文本", () => {
    expect(userPrompt.length).toBeGreaterThan(0);
    expect(userPrompt.length).toBeLessThan(2_000);
  });
});
