// 验收用例 (issue 02 阅读体验优化): 无用户偏好的全新启动默认 light 主题 ——
// 首屏 bootstrap 与 React 设置默认均为 light, 不跟随系统; 语法高亮默认 GitHub Light。
import { resolve } from "node:path";

import { test, expect, _electron as electron } from "@playwright/test";

import { createFixtureRepo, makeWorkingTreeChange } from "../src/main/fixture-repo";

import { createIsolatedUserData } from "./isolated-user-data";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

test("全新启动 (无任何偏好存储): 根元素 data-theme 为 light 且 diff 正常渲染", async () => {
  const fixture = await createFixtureRepo();
  await makeWorkingTreeChange(fixture.repoPath);
  const userData = await createIsolatedUserData();
  let app;
  try {
    // 隔离 userData = 无 server 持久化设置; 新 Electron profile = 无 localStorage
    app = await electron.launch({
      args: [appPath, fixture.repoPath],
      env: { ...userData.env },
    });
    const window = await app.firstWindow();

    // bootstrap 首屏即 light (不跟随系统), React 设置层默认同为 light
    await expect(window.locator("html")).toHaveAttribute("data-theme", "light", {
      timeout: 30_000,
    });
    // diff 管道在 light 默认下照常渲染
    await expect(window.locator("main").getByText("a.txt", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await app?.close();
    await fixture.cleanup();
    await userData.cleanup();
  }
});
