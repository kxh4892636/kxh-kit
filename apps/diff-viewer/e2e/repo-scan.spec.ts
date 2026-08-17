// 验收用例 (issue 03): 目录打开与嵌套仓库扫描。
// 1) 打开含嵌套仓库 (仓中仓 + submodule 形态) 的目录: 全部仓库以父子层级列出,
//    node_modules 未被遍历, 扫描期间有进度指示; 勾选仓库聚焦其 diff
//    (issue 04 起已勾选仓库保留在文件树分组中, 不再互相替换)。
// 2) 目录选择对话框 → 打开新目录 → 重新扫描并切换。
// 3) issue 01(阅读体验优化): 切换 Ignore Whitespace 只以新参数重取 diff ——
//    不触发重扫, 仓库列表/勾选/聚焦全程不变 (回归: 回调链曾经 [startScan] 依赖
//    重启启动扫描, 远程视图下远程树被本地扫描结果替换)。
// DIFF_VIEWER_SCAN_DELAY_MS: 夹具目录很小, 真实扫描瞬间完成, 无法稳定断言
// "扫描期间"的进度指示; 用每目录延迟把扫描拉长到可观测窗口 (仅 e2e 设置)。
import { promises as fs } from "node:fs";
import { basename, join, resolve } from "node:path";

import { test, expect, _electron as electron } from "@playwright/test";

import {
  createFixtureRepo,
  createNestedRepoFixture,
  runFixtureGit,
} from "../src/main/fixture-repo";

import { createIsolatedUserData } from "./isolated-user-data";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

test("打开含嵌套仓库的目录: 父子层级全部列出, node_modules 未遍历, 扫描有进度指示", async () => {
  const fixture = await createNestedRepoFixture();
  const userData = await createIsolatedUserData();
  let app;
  try {
    app = await electron.launch({
      args: [appPath, fixture.rootPath],
      env: { ...userData.env, DIFF_VIEWER_SCAN_DELAY_MS: "40" },
    });
    const window = await app.firstWindow();

    // 扫描期间有进度指示, 完成后消失
    await expect(window.getByTestId("scan-progress")).toBeVisible({ timeout: 30_000 });
    await expect(window.getByTestId("scan-progress")).toBeHidden({ timeout: 30_000 });

    // 全部仓库以父子层级列出: 根仓库为父, 仓中仓与 submodule 为其后代
    const rootNode = window.getByTestId(`repo-node-${fixture.rootName}`);
    await expect(rootNode).toBeVisible();
    await expect(rootNode.getByTestId(`repo-node-${fixture.nestedName}`)).toBeVisible();
    await expect(rootNode.getByTestId(`repo-node-${fixture.submoduleName}`)).toBeVisible();
    // node_modules 内的仓库未被遍历 (未出现在树中)
    await expect(window.getByTestId(`repo-node-${fixture.hiddenName}`)).toHaveCount(0);

    // 启动目录即聚焦仓库: 默认对比 (无远程降级为未提交改动) 展示根仓库的 a.txt
    await expect(
      window.getByRole("button", { name: "Revision menu: HEAD...Uncommitted Changes" }),
    ).toBeVisible({ timeout: 30_000 });
    const main = window.locator("main");
    const sidebar = window.locator("aside#file-tree-panel");
    await expect(main.getByText("a.txt", { exact: true }).first()).toBeVisible();

    // 勾选仓中仓 → 聚焦切换, 主视图展示其 diff; 04 起根仓库保留在文件树分组中
    await window.getByTestId(`repo-row-${fixture.nestedName}`).getByRole("checkbox").click();
    await expect(main.getByText("nested.txt").first()).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText("a.txt", { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText("a.txt", { exact: true })).toBeVisible();
    await expect(window.getByTestId(`file-tree-repo-${fixture.nestedName}`)).toBeVisible();

    // 勾选 submodule 形态仓库 → gitfile 解析正常, 聚焦展示其 diff
    await window.getByTestId(`repo-row-${fixture.submoduleName}`).getByRole("checkbox").click();
    await expect(main.getByText("submodule.txt").first()).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText("nested.txt", { exact: true })).toHaveCount(0);
  } finally {
    await app?.close();
    await fixture.cleanup();
    await userData.cleanup();
  }
});

test("目录选择对话框打开新目录: 重新扫描并自动激活新目录的根仓库", async () => {
  const initial = await createFixtureRepo();
  const nested = await createNestedRepoFixture();
  const userData = await createIsolatedUserData();
  let app;
  try {
    app = await electron.launch({
      args: [appPath, initial.repoPath],
      env: { ...userData.env, DIFF_VIEWER_SCAN_DELAY_MS: "40" },
    });
    const window = await app.firstWindow();

    // 初始目录的扫描结果就位
    await expect(window.getByTestId(`repo-node-${basename(initial.repoPath)}`)).toBeVisible({
      timeout: 30_000,
    });

    // 原生目录对话框无法自动化, 替换为返回夹具路径
    await app.evaluate(({ dialog }, directoryPath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [directoryPath],
      })) as typeof dialog.showOpenDialog;
    }, nested.rootPath);

    await window.getByTestId("open-folder-button").click();

    // 重新扫描: 新目录的仓库树替换旧树
    await expect(window.getByTestId(`repo-node-${nested.rootName}`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      window
        .getByTestId(`repo-node-${nested.rootName}`)
        .getByTestId(`repo-node-${nested.nestedName}`),
    ).toBeVisible();

    // 新根仓库被自动激活: 展示其未提交改动 (root two changed)
    await expect(window.getByText("a.txt", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(window.locator("tr", { hasText: "root two changed" }).first()).toBeVisible();
  } finally {
    await app?.close();
    await initial.cleanup();
    await nested.cleanup();
    await userData.cleanup();
  }
});

test("切换 Ignore Whitespace 不触发重扫: 仓库树与聚焦不变, diff 以新参数重取", async () => {
  const fixture = await createNestedRepoFixture();
  // c.txt: 提交后仅作行尾空格改动 —— 默认 ignore whitespace 下不产生 diff,
  // 取消勾选后应出现, 重新勾选后应消失 (diff 以新参数重取的用户可感知信号)
  await fs.writeFile(join(fixture.rootPath, "c.txt"), "alpha\nbeta\n");
  runFixtureGit(fixture.rootPath, ["add", "c.txt"]);
  runFixtureGit(fixture.rootPath, ["commit", "-m", "add c.txt"]);
  await fs.writeFile(join(fixture.rootPath, "c.txt"), "alpha\nbeta  \n");

  const userData = await createIsolatedUserData();
  let app;
  try {
    app = await electron.launch({
      args: [appPath, fixture.rootPath],
      // 加大每目录扫描延迟: 若错误触发重扫, scan-progress 在断言窗口内必然可见
      env: { ...userData.env, DIFF_VIEWER_SCAN_DELAY_MS: "200" },
    });
    const window = await app.firstWindow();

    const main = window.locator("main");
    const rootRow = window.getByTestId(`repo-row-${fixture.rootName}`);
    const nestedRow = window.getByTestId(`repo-row-${fixture.nestedName}`);
    const scanProgress = window.getByTestId("scan-progress");
    const whitespaceToggle = window.getByRole("checkbox", { name: "Ignore Whitespace" });

    // 初始: 扫描完成, 根仓库勾选并聚焦, c.txt 因 whitespace-only 改动被忽略
    await expect(scanProgress).toBeHidden({ timeout: 30_000 });
    await expect(rootRow).toHaveAttribute("data-active", "true");
    await expect(rootRow.getByRole("checkbox")).toBeChecked();
    await expect(main.getByText("a.txt", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(main.getByText("c.txt", { exact: true })).toHaveCount(0);

    // 取消勾选 → diff 以关闭 -w 重取: c.txt 出现; 全程无重扫, 勾选与聚焦不变
    await whitespaceToggle.click();
    await expect(main.getByText("c.txt", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(scanProgress).toHaveCount(0);
    await expect(rootRow).toHaveAttribute("data-active", "true");
    await expect(rootRow.getByRole("checkbox")).toBeChecked();
    await expect(window.getByTestId(`repo-node-${fixture.nestedName}`)).toBeVisible();
    await expect(window.getByTestId(`repo-node-${fixture.submoduleName}`)).toBeVisible();

    // 重新勾选 → c.txt 再次消失; 仍无重扫
    await whitespaceToggle.click();
    await expect(main.getByText("c.txt", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(scanProgress).toHaveCount(0);

    // 聚焦仓中仓后再切换: 聚焦不被拽回根仓库, 主视图保持 nested diff
    await nestedRow.getByRole("checkbox").click();
    await expect(main.getByText("nested.txt").first()).toBeVisible({ timeout: 30_000 });
    await expect(nestedRow.getByRole("checkbox")).toBeChecked();
    await whitespaceToggle.click();
    // 覆盖一次完整重扫的时长: 错误重扫在此期间必然可见 (scan-progress / 聚焦跳变)
    await window.waitForTimeout(1000);
    await expect(scanProgress).toHaveCount(0);
    await expect(nestedRow).toHaveAttribute("data-active", "true");
    await expect(nestedRow.getByRole("checkbox")).toBeChecked();
    await expect(rootRow.getByRole("checkbox")).toBeChecked();
    await expect(main.getByText("nested.txt").first()).toBeVisible();
    await expect(main.getByText("a.txt", { exact: true })).toHaveCount(0);
  } finally {
    await app?.close();
    await fixture.cleanup();
    await userData.cleanup();
  }
});
