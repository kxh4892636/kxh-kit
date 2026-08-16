// 验收用例 (issue 04): 多仓库文件树与同视图 diff。
// 勾选根仓库与仓中仓 (≥2), 各自独立设置激活对比 (根 = 默认未提交改动,
// 仓中仓 = HEAD^...HEAD), 文件树顶层按仓库分组展示全部变更文件;
// 点击另一仓库分组的文件 → 聚焦该仓库并渲染其 diff, 头部对比标签随仓库恢复。
import { resolve } from "node:path";

import { test, expect, _electron as electron } from "@playwright/test";

import { createNestedRepoFixture, runFixtureGit } from "../src/main/fixture-repo";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

test("勾选两个仓库各自设置对比: 文件树按仓库分组, 点击文件渲染对应仓库的 diff", async () => {
  const fixture = await createNestedRepoFixture();
  // 仓中仓的未提交改动提交为第二个 commit, 使其可设置 HEAD^...HEAD 对比
  // (nested.txt: "nested one\n" → "nested one\nnested two\n")
  runFixtureGit(fixture.nestedPath, ["add", "nested.txt"]);
  runFixtureGit(fixture.nestedPath, ["commit", "-m", "nested second"]);

  let app;
  try {
    app = await electron.launch({ args: [appPath, fixture.rootPath] });
    const window = await app.firstWindow();
    const main = window.locator("main");
    const sidebar = window.locator("aside#file-tree-panel");

    // 启动目录 (根仓库) 自动勾选并聚焦: 默认对比 = 未提交改动, 展示 a.txt
    await expect(window.getByTestId(`repo-row-${fixture.rootName}`)).toHaveAttribute(
      "data-active",
      "true",
      { timeout: 30_000 },
    );
    await expect(
      window.getByRole("button", { name: "Revision menu: HEAD...Uncommitted Changes" }),
    ).toBeVisible({ timeout: 30_000 });
    const rootGroup = window.getByTestId(`file-tree-repo-${fixture.rootName}`);
    await expect(rootGroup.getByText("a.txt", { exact: true })).toBeVisible({ timeout: 30_000 });

    // 勾选仓中仓 → 聚焦之; 其默认对比 (未提交改动) 为空, 分组头已出现
    await window.getByTestId(`repo-row-${fixture.nestedName}`).getByRole("checkbox").click();
    const nestedGroup = window.getByTestId(`file-tree-repo-${fixture.nestedName}`);
    await expect(nestedGroup).toBeVisible({ timeout: 30_000 });
    await expect(window.getByTestId(`repo-row-${fixture.nestedName}`)).toHaveAttribute(
      "data-active",
      "true",
    );
    // 多仓库同视图: 根仓库分组保持可见
    await expect(rootGroup.getByText("a.txt", { exact: true })).toBeVisible();

    // 为仓中仓设置对比 HEAD^...HEAD (quick menu 的 Previous commit)
    await window.getByRole("button", { name: /Revision menu: / }).click();
    await window.getByRole("button", { name: "Previous commit" }).click();
    // 菜单标签 = 解析后的 tip commit (短哈希 + 提交信息)
    await expect(
      window.getByRole("button", { name: /Revision menu: \S+ nested second/ }),
    ).toBeVisible({ timeout: 30_000 });
    // 仓中仓的 diff 渲染 (nested.txt 新增 nested two 行), 文件树分组同步出现该文件
    await expect(main.getByText("nested.txt").first()).toBeVisible({ timeout: 30_000 });
    await expect(main.locator("tr", { hasText: "nested two" }).first()).toBeVisible();
    await expect(nestedGroup.getByText("nested.txt", { exact: true })).toBeVisible();

    // 点击根仓库分组的 a.txt → 聚焦根仓库, 渲染其 diff (未提交改动), 对比标签切回
    await sidebar
      .getByTestId(`file-tree-repo-${fixture.rootName}`)
      .getByText("a.txt", { exact: true })
      .click();
    await expect(
      window.getByRole("button", { name: "Revision menu: HEAD...Uncommitted Changes" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(main.locator("tr", { hasText: "root two changed" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(main.getByText("nested.txt", { exact: true })).toHaveCount(0);

    // 点击仓中仓分组的 nested.txt → 聚焦仓中仓, 其手选对比 (HEAD^...HEAD) 恢复,
    // 不被根仓库的对比覆盖 (每仓库独立激活对比)
    await nestedGroup.getByText("nested.txt", { exact: true }).click();
    await expect(
      window.getByRole("button", { name: /Revision menu: \S+ nested second/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(main.locator("tr", { hasText: "nested two" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(main.getByText("a.txt", { exact: true })).toHaveCount(0);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
