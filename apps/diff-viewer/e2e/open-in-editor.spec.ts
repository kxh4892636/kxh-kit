// 验收用例 (issue 07): 本地会话的编辑器打开 —— 点击 diff 行的打开按钮, 主进程
// editor-adapter 生成 vscode://file/<绝对路径>:<行号> 并经 shell.openExternal 打开
// (e2e 用 monkey-patch 捕获, 不真正拉起 VSCode); split/unified 两种布局各点一次,
// 行号均为新侧 (工作区文件) 行号。fixture 中 a.txt 的本地改动在文件第 2 行。
import { join, resolve } from "node:path";

import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";

import { createFixtureRepo, makeWorkingTreeChange } from "../src/main/fixture-repo";

import { createIsolatedUserData } from "./isolated-user-data";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

// 与 src/main/editor/vscode-adapter.ts 的 URL 构造保持同一断言形状
const expectedUrl = (repoPath: string, file: string, line: number): string =>
  `vscode://file/${join(repoPath, file).replaceAll("\\", "/")}:${line}`;

// 主进程 openExternal 捕获桩: 返回读取捕获数组的轮询函数
const captureOpenExternal = async (app: ElectronApplication): Promise<() => Promise<string[]>> => {
  await app.evaluate(({ shell }) => {
    const capture = process as unknown as { capturedOpenExternalUrls: string[] };
    capture.capturedOpenExternalUrls = [];
    shell.openExternal = (async (url: string) => {
      capture.capturedOpenExternalUrls.push(url);
    }) as unknown as typeof shell.openExternal;
  });
  return async () =>
    (await app.evaluate(
      () =>
        (process as unknown as { capturedOpenExternalUrls?: string[] }).capturedOpenExternalUrls,
    )) ?? [];
};

test("本地会话点击打开按钮经 vscode:// 协议打开对应文件并定位行号", async () => {
  const fixture = await createFixtureRepo();
  const userData = await createIsolatedUserData();
  let app;
  try {
    await makeWorkingTreeChange(fixture.repoPath);
    app = await electron.launch({ args: [appPath, fixture.repoPath], env: userData.env });
    const window = await app.firstWindow();

    // 初始对比为 未提交改动 vs HEAD (a.txt 第 2 行本地修改)
    const changedRow = window.locator("tr", { hasText: "line two changed locally" }).first();
    await expect(changedRow).toBeVisible({ timeout: 30_000 });

    const captured = await captureOpenExternal(app);

    // split 布局 (默认): 点击该行新侧的打开按钮
    await changedRow.hover();
    await changedRow.locator('[data-open-in-editor-button="true"]').click();
    await expect
      .poll(captured, { timeout: 10_000 })
      .toEqual([expectedUrl(fixture.repoPath, "a.txt", 2)]);

    // unified 布局: 同一行再点一次, 行号一致 (新侧 = 工作区文件行号)
    await window.getByRole("button", { name: "Unified" }).click();
    const unifiedRow = window.locator("tr", { hasText: "line two changed locally" }).first();
    await unifiedRow.hover();
    await unifiedRow.locator('[data-open-in-editor-button="true"]').click();
    await expect
      .poll(captured, { timeout: 10_000 })
      .toEqual([
        expectedUrl(fixture.repoPath, "a.txt", 2),
        expectedUrl(fixture.repoPath, "a.txt", 2),
      ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
    await userData.cleanup();
  }
});
