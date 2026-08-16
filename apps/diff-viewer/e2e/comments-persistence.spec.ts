// 验收用例 (issue 05): 评论持久化与一键复制。
// 1) 在 diff 行写评论 → 评论落盘到 userData JSON (DIFIT_COMMENTS_DIR 隔离到临时目录,
//    断言文件存在且含评论内容) → 关闭并以同一 userData 重启 Electron 实例 → 评论仍在;
//    仓库目录全程无新增文件 (不污染仓库)。
// 2) 一键复制全部评论 → 系统剪贴板得到 Markdown 列表: 每条含 `文件:行号`、
//    引用代码块 (行快照) 与评论正文。
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";

import { createFixtureRepo, makeWorkingTreeChange } from "../src/main/fixture-repo";

import { createIsolatedUserData } from "./isolated-user-data";

// playwright 以配置文件所在目录为 cwd, 包根即 Electron 应用入口目录
const appPath = resolve(__dirname, "..");

const COMMENT_BODY = "e2e persistence check";

// 在 unified 视图的目标行上写一条评论 (hover 出行内按钮 → 点开表单 → 提交)
const addCommentOnChangedLine = async (
  window: Awaited<ReturnType<ElectronApplication["firstWindow"]>>,
): Promise<void> => {
  await window.getByRole("button", { name: "Unified" }).click();

  const changedRow = window.locator("tr", { hasText: "line two changed locally" }).first();
  await expect(changedRow).toBeVisible({ timeout: 30_000 });
  await changedRow.hover();
  await changedRow.locator('[data-comment-button="true"]').click();

  const textarea = window.getByPlaceholder("Leave a comment...");
  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await textarea.fill(COMMENT_BODY);
  await window.getByRole("button", { name: "Submit" }).click();

  await expect(window.getByText(COMMENT_BODY).first()).toBeVisible({ timeout: 10_000 });
};

test("写评论后重启应用评论仍在: 落盘 userData JSON, 不污染仓库", async () => {
  const fixture = await createFixtureRepo();
  const userData = await createIsolatedUserData();
  const { commentsDir } = userData;
  let app: ElectronApplication | undefined;
  try {
    await makeWorkingTreeChange(fixture.repoPath);
    const repoEntriesBefore = (await readdir(fixture.repoPath)).sort();
    const launchEnv = userData.env;

    app = await electron.launch({ args: [appPath, fixture.repoPath], env: launchEnv });
    let window = await app.firstWindow();
    await expect(window.getByText("a.txt").first()).toBeVisible({ timeout: 30_000 });
    await addCommentOnChangedLine(window);

    // 外部观察: 评论已落盘到 userData (每仓库一个 <repositoryId>.json), 内容含评论
    let persistedContent = "";
    await expect
      .poll(
        async () => {
          const files = (await readdir(commentsDir)).filter((name) => name.endsWith(".json"));
          if (files.length !== 1) {
            return false;
          }
          persistedContent = await readFile(join(commentsDir, files[0]!), "utf-8");
          return persistedContent.includes(COMMENT_BODY);
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    // 锚点形状: 仓库 (文件名即 repositoryId) + 文件路径 + 行号 + side + 代码快照
    const persisted = JSON.parse(persistedContent) as {
      version: number;
      repoPath: string;
      sessions: Record<
        string,
        {
          threads: Array<{
            filePath: string;
            position: { side: string; line: number };
            codeSnapshot?: { content: string };
          }>;
        }
      >;
    };
    expect(persisted.version).toBe(1);
    const persistedThreads = Object.values(persisted.sessions).flatMap((s) => s.threads);
    expect(persistedThreads).toHaveLength(1);
    expect(persistedThreads[0]?.filePath).toBe("a.txt");
    expect(persistedThreads[0]?.position).toEqual({ side: "new", line: 2 });
    expect(persistedThreads[0]?.codeSnapshot?.content).toContain("line two changed locally");

    await app.close();
    app = undefined;

    // 重启: 同一 userData (commentsDir), 评论仍在
    app = await electron.launch({ args: [appPath, fixture.repoPath], env: launchEnv });
    window = await app.firstWindow();
    await expect(window.getByText("a.txt").first()).toBeVisible({ timeout: 30_000 });
    await expect(window.getByText(COMMENT_BODY).first()).toBeVisible({ timeout: 30_000 });

    // 不污染仓库: 目录内容全程无变化
    expect((await readdir(fixture.repoPath)).sort()).toEqual(repoEntriesBefore);
  } finally {
    await app?.close();
    await fixture.cleanup();
    await userData.cleanup();
  }
});

test("一键复制全部评论为 Markdown 列表: 每条含 文件:行号 + 代码块 + 正文", async () => {
  const fixture = await createFixtureRepo();
  const userData = await createIsolatedUserData();
  let app: ElectronApplication | undefined;
  try {
    await makeWorkingTreeChange(fixture.repoPath);
    app = await electron.launch({
      args: [appPath, fixture.repoPath],
      env: userData.env,
    });
    const window = await app.firstWindow();
    await expect(window.getByText("a.txt").first()).toBeVisible({ timeout: 30_000 });
    await addCommentOnChangedLine(window);

    await window.getByRole("button", { name: /Copy All Prompt/ }).click();

    let clipboardText = "";
    await expect
      .poll(
        async () => {
          clipboardText = await app!.evaluate(({ clipboard }) => clipboard.readText());
          return clipboardText.includes(COMMENT_BODY);
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // Windows 剪贴板 round-trip 会把 \n 归一为 \r\n; 逐字符的 LF 格式由
    // comments-markdown 单测钉住, 这里剥离 \r 后断言用户可感知的内容结构
    const normalized = clipboardText.replace(/\r/g, "");
    expect(normalized).toContain("- `a.txt:L2`");
    expect(normalized).toContain("  ```\n  line two changed locally\n  ```");
    expect(normalized).toContain(`  ${COMMENT_BODY}`);
  } finally {
    await app?.close();
    await fixture.cleanup();
    await userData.cleanup();
  }
});
