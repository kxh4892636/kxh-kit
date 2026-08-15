// 验收用例 (issue 02): 默认对比。
// 1) feature 分支 + 有远程 → 默认展示当前分支与远程默认分支的三点 diff;
// 2) 无远程 → 默认展示未提交改动 vs HEAD。
import { resolve } from "node:path";

import { test, expect, _electron as electron } from "@playwright/test";

import {
  createFixtureRepo,
  createFixtureRepoWithOrigin,
  makeWorkingTreeChange,
} from "../src/main/fixture-repo";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

test("feature 分支仓库默认展示与远程默认分支的三点 diff", async () => {
  const fixture = await createFixtureRepoWithOrigin();
  let app;
  try {
    app = await electron.launch({ args: [appPath, fixture.repoPath] });
    const window = await app.firstWindow();

    // 快捷菜单标签即为当前对比: 默认 = origin/main...feature 的三点对比
    await expect(
      window.getByRole("button", { name: "Revision menu: origin/main...feature (merge-base)" }),
    ).toBeVisible({ timeout: 30_000 });

    // 三点对比只含 feature 自分叉点后的改动: feature.txt 在;
    // 默认分支后来对 a.txt 的改动不在 (两点对比才会带上)
    await expect(window.getByText("feature.txt").first()).toBeVisible();
    await expect(window.locator("tr", { hasText: "feature work" }).first()).toBeVisible();
    await expect(window.getByText("a.txt", { exact: true })).toHaveCount(0);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test("无远程仓库默认展示未提交改动 vs HEAD", async () => {
  const fixture = await createFixtureRepo();
  let app;
  try {
    await makeWorkingTreeChange(fixture.repoPath);
    app = await electron.launch({ args: [appPath, fixture.repoPath] });
    const window = await app.firstWindow();

    await expect(
      window.getByRole("button", { name: "Revision menu: HEAD...Uncommitted Changes" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(window.getByText("a.txt").first()).toBeVisible();
    await expect(
      window.locator("tr", { hasText: "line two changed locally" }).first(),
    ).toBeVisible();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
