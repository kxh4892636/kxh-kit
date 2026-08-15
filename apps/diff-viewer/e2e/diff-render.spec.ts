// 验收用例 (issue 01): 临时目录脚本化创建 fixture 仓库 → 以启动参数指向它启动
// Electron 应用 → 断言 diff 端到端渲染 → 切换 unified/split 布局。
import { resolve } from "node:path";

import { test, expect, _electron as electron } from "@playwright/test";

import { createFixtureRepo } from "../src/main/fixture-repo";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

test("渲染 fixture 仓库的 diff 并可切换 unified/split", async () => {
  const fixture = await createFixtureRepo();
  let app;
  try {
    app = await electron.launch({ args: [appPath, fixture.repoPath] });
    const window = await app.firstWindow();

    // 初始对比为 HEAD^..HEAD (fixture 最后一个 commit 扩展了 b.txt)
    await expect(window.getByText("b.txt").first()).toBeVisible({ timeout: 30_000 });
    const changedRow = window.locator("tr", { hasText: "beta two" }).first();
    await expect(changedRow).toBeVisible();

    // 默认 split 布局: 内容行 4 个 td (旧行号/旧内容/新行号/新内容)
    await expect.poll(async () => changedRow.locator("td").count(), { timeout: 10_000 }).toBe(4);

    await window.getByRole("button", { name: "Unified" }).click();
    await expect.poll(async () => changedRow.locator("td").count(), { timeout: 10_000 }).toBe(3);

    await window.getByRole("button", { name: "Split" }).click();
    await expect.poll(async () => changedRow.locator("td").count(), { timeout: 10_000 }).toBe(4);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
