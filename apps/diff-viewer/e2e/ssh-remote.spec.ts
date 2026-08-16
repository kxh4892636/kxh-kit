// 验收用例 (issue 06): SSH 远程视图。
// 本机无可用 SSH 主机, 传输层经 DIFF_VIEWER_FAKE_SSH* 环境变量替换为语义等价的
// fake executor (git 命令在映射的本机目录真实执行, 扫描脚本由本地扫描器产出同格式
// 输出再走真解析器回路 —— 见 src/main/remote/fake-ssh-executor.ts); 真实 SSH 主机
// 的传输层证据由 scripts/ssh-smoke.mjs 补齐。
// 单条全链路: 连接 fake-host:/remote/ws → 仓库树替换为远程树 (含仓中仓/submodule 形态,
// node_modules 未遍历) → 根仓库自动激活展示未提交改动 → 勾选仓中仓聚焦其 diff →
// 写评论落盘到 sha256(ssh:// 会话键).json → 编辑器按钮产出 vscode-remote URL →
// 历史连接落盘; 同 userData 重启后历史条目可见并点击重连。
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";

import { createFixtureRepo, createNestedRepoFixture } from "../src/main/fixture-repo";

import { createIsolatedUserData } from "./isolated-user-data";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

const FAKE_TARGET = "fake-host";
const FAKE_REMOTE_PATH = "/remote/ws";
// 远程根仓库的会话键 (主进程 remote-repo-scanner: keyBase + 远程路径)
const REMOTE_ROOT_KEY = `ssh://${FAKE_TARGET}${FAKE_REMOTE_PATH}`;

const COMMENT_BODY = "e2e ssh remote comment";

// 在 unified 视图 "root two changed" 行上写一条评论 (与 05 验收相同的行内交互)
const addCommentOnRootChange = async (
  window: Awaited<ReturnType<ElectronApplication["firstWindow"]>>,
): Promise<void> => {
  await window.getByRole("button", { name: "Unified" }).click();

  const changedRow = window.locator("tr", { hasText: "root two changed" }).first();
  await expect(changedRow).toBeVisible({ timeout: 30_000 });
  await changedRow.hover();
  await changedRow.locator('[data-comment-button="true"]').click();

  const textarea = window.getByPlaceholder("Leave a comment...");
  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await textarea.fill(COMMENT_BODY);
  await window.getByRole("button", { name: "Submit" }).click();
  await expect(window.getByText(COMMENT_BODY).first()).toBeVisible({ timeout: 10_000 });
};

test("SSH 连接远程主机: 扫描/激活/评论落盘/编辑器 URL/历史重连 全链路", async () => {
  // 启动目录 (本地): 远程连接前的落地上下文
  const initial = await createFixtureRepo();
  // 远程侧夹具: 根仓库 (含未提交改动) + 仓中仓 + submodule 形态 + node_modules 隐藏仓库
  const remote = await createNestedRepoFixture();
  const userData = await createIsolatedUserData();
  const launchEnv = {
    ...userData.env,
    DIFF_VIEWER_FAKE_SSH: "1",
    DIFF_VIEWER_FAKE_SSH_REMOTE: FAKE_REMOTE_PATH,
    DIFF_VIEWER_FAKE_SSH_LOCAL: remote.rootPath,
  };
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [appPath, initial.repoPath], env: launchEnv });
    let window = await app.firstWindow();

    // 初始本地扫描就位后, 经 SSH 面板连接远程主机
    await expect(window.getByTestId("repository-tree")).toBeVisible({ timeout: 30_000 });
    await window.getByTestId("ssh-connect-toggle").click();
    await window.getByTestId("ssh-target-input").fill(FAKE_TARGET);
    await window.getByTestId("ssh-path-input").fill(FAKE_REMOTE_PATH);
    await window.getByTestId("ssh-connect-submit").click();

    // 连接成功: 仓库树整体替换为远程树 (父子层级; node_modules 未被遍历)
    const rootNode = window.getByTestId("repo-node-ws");
    await expect(rootNode).toBeVisible({ timeout: 30_000 });
    await expect(rootNode.getByTestId("repo-node-nested-lib")).toBeVisible();
    await expect(rootNode.getByTestId("repo-node-sub-lib")).toBeVisible();
    await expect(window.getByTestId("repo-node-heavy-dep")).toHaveCount(0);

    // 远程根仓库自动激活: 默认对比 (无远程降级) 展示其未提交改动
    await expect(
      window.getByRole("button", { name: "Revision menu: HEAD...Uncommitted Changes" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(window.locator("tr", { hasText: "root two changed" }).first()).toBeVisible({
      timeout: 30_000,
    });

    await addCommentOnRootChange(window);

    // 外部观察: 评论落盘文件名 = sha256(ssh:// 会话键) —— 远程仓库的评论隔离键
    const expectedCommentFile = join(
      userData.commentsDir,
      `${createHash("sha256").update(REMOTE_ROOT_KEY).digest("hex")}.json`,
    );
    let persistedContent = "";
    await expect
      .poll(
        async () => {
          try {
            persistedContent = await readFile(expectedCommentFile, "utf-8");
          } catch {
            return false;
          }
          return persistedContent.includes(COMMENT_BODY);
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // 编辑器按钮: 捕获主进程 shell.openExternal 的 URL (替换为记录桩)
    await app.evaluate(({ shell }) => {
      const capture = process as unknown as { capturedOpenExternalUrls: string[] };
      capture.capturedOpenExternalUrls = [];
      shell.openExternal = (async (url: string) => {
        capture.capturedOpenExternalUrls.push(url);
      }) as unknown as typeof shell.openExternal;
    });
    const changedRow = window.locator("tr", { hasText: "root two changed" }).first();
    await changedRow.hover();
    await changedRow.locator('[data-open-in-editor-button="true"]').click();
    await expect
      .poll(
        async () =>
          (await app!.evaluate(
            () =>
              (process as unknown as { capturedOpenExternalUrls?: string[] })
                .capturedOpenExternalUrls,
          )) ?? [],
        { timeout: 10_000 },
      )
      .toEqual(["vscode://vscode-remote/ssh-remote+fake-host/remote/ws/a.txt:2"]);

    // 勾选仓中仓 → 聚焦切换, 展示其未提交改动 (远程 git 数据面);
    // 注意根仓库已自动勾选, 切聚焦不能再点其 checkbox (那是 toggle 会取消勾选)
    await window.getByTestId("repo-row-nested-lib").getByRole("checkbox").click();
    await expect(window.locator("tr", { hasText: "nested two" }).first()).toBeVisible({
      timeout: 30_000,
    });

    // 历史连接落盘到 userData
    const historyFile = join(userData.env.DIFIT_USER_DATA_DIR!, "ssh-connections.json");
    const persistedHistory = JSON.parse(await readFile(historyFile, "utf-8")) as {
      connections: Array<{ target: string; path: string }>;
    };
    expect(persistedHistory.connections[0]).toMatchObject({
      target: FAKE_TARGET,
      path: FAKE_REMOTE_PATH,
    });

    await app.close();
    app = undefined;

    // 同 userData 重启: 历史条目可见, 点击回填并直接重连
    app = await electron.launch({ args: [appPath, initial.repoPath], env: launchEnv });
    window = await app.firstWindow();
    await expect(window.getByTestId("repository-tree")).toBeVisible({ timeout: 30_000 });
    await window.getByTestId("ssh-connect-toggle").click();
    const historyList = window.getByTestId("ssh-history-list");
    await expect(historyList).toBeVisible({ timeout: 30_000 });
    await expect(historyList).toContainText(`${FAKE_TARGET} ${FAKE_REMOTE_PATH}`);

    await window.getByTestId("ssh-history-entry-0").click();
    await expect(window.getByTestId("repo-node-ws")).toBeVisible({ timeout: 30_000 });
    await expect(window.locator("tr", { hasText: "root two changed" }).first()).toBeVisible({
      timeout: 30_000,
    });
    // 重连后评论仍在 (同一会话键 → 同一落盘文件, 重启即回读);
    // 评论线程不渲染在 <main> 内, 用窗口级选择器 (与 05 验收一致)
    await expect(window.getByText(COMMENT_BODY).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await app?.close();
    await initial.cleanup();
    await remote.cleanup();
    await userData.cleanup();
  }
});
