import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { ApiBridgeResponse } from "../api-bridge/api-bridge-types.js";
import type { DiffResponse } from "../types/diff.js";

import { createApiRouter, type ApiRouter } from "./api-router.js";
import { createFixtureRepo, makeWorkingTreeChange, type FixtureRepo } from "./fixture-repo.js";
import { GitDiffParser } from "./git-diff.js";

const readJson = (response: ApiBridgeResponse): unknown =>
  JSON.parse(response.body ?? "null") as unknown;

describe("api-router", () => {
  let fixture: FixtureRepo;
  let router: ApiRouter;
  let configDir: string;
  let broadcasts: string[];

  beforeEach(async () => {
    fixture = await createFixtureRepo();
    configDir = await mkdtemp(join(tmpdir(), "diff-viewer-config-"));
    broadcasts = [];
    router = createApiRouter({
      parser: new GitDiffParser(fixture.repoPath),
      repoPath: fixture.repoPath,
      initialSelection: { baseCommitish: "HEAD^", targetCommitish: "HEAD" },
      configPath: join(configDir, "config.json"),
      commentsDir: join(configDir, "comments"),
      broadcast: (payload) => broadcasts.push(payload),
    });
  });

  afterEach(async () => {
    await fixture.cleanup();
    await rm(configDir, { recursive: true, force: true });
  });

  it("GET /api/diff 返回初始对比的 diff", async () => {
    const response = await router.handle({ method: "GET", path: "/api/diff", query: {} });
    expect(response.status).toBe(200);

    const body = readJson(response) as DiffResponse;
    expect(body.files.map((file) => file.path)).toEqual(["b.txt"]);
    expect(body.isEmpty).toBe(false);
    expect(body.openInEditorAvailable).toBe(false);
    expect(typeof body.repositoryId).toBe("string");
  });

  it("GET /api/diff 支持 base/target 参数切换对比", async () => {
    const response = await router.handle({
      method: "GET",
      path: "/api/diff",
      query: { base: "HEAD~2", target: "HEAD" },
    });
    expect(response.status).toBe(200);

    const body = readJson(response) as DiffResponse;
    expect(body.files.map((file) => file.path).sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("GET /api/diff 对非法 commitish 返回 500 与错误信息", async () => {
    const response = await router.handle({
      method: "GET",
      path: "/api/diff",
      query: { base: "no-such-ref", target: "HEAD" },
    });
    expect(response.status).toBe(500);
    expect(readJson(response)).toHaveProperty("error");
  });

  it("GET /api/revisions 返回分支与提交列表", async () => {
    const response = await router.handle({ method: "GET", path: "/api/revisions", query: {} });
    expect(response.status).toBe(200);

    const body = readJson(response) as {
      specialOptions: unknown[];
      branches: Array<{ name: string; current: boolean }>;
      commits: unknown[];
    };
    expect(body.specialOptions).toHaveLength(3);
    expect(body.branches.map((branch) => branch.name)).toContain("feature");
    expect(body.branches.find((branch) => branch.current)?.name).toBe("main");
    expect(body.commits.length).toBeGreaterThan(0);
  });

  it("GET /api/blob/<path> 经 IPC 返回 ArrayBuffer 与 content type", async () => {
    const response = await router.handle({
      method: "GET",
      path: "/api/blob/b.txt",
      query: { ref: "HEAD" },
    });
    expect(response.status).toBe(200);
    expect(response.headers?.["Content-Type"]).toBe("application/octet-stream");
    expect(response.blob).toBeInstanceOf(ArrayBuffer);
    expect(Buffer.from(response.blob as ArrayBuffer).toString("utf8")).toBe("beta one\nbeta two\n");
  });

  it("GET /api/blob 拒绝仓库外路径", async () => {
    const response = await router.handle({
      method: "GET",
      path: "/api/blob/..%2F..%2Fetc%2Fpasswd",
      query: { ref: "HEAD" },
    });
    expect(response.status).toBe(400);
  });

  it("POST /api/comments 与 GET /api/comments-json 往返, 版本递增并广播", async () => {
    const push = await router.handle({
      method: "POST",
      path: "/api/comments",
      query: {},
      body: JSON.stringify({
        threads: [
          {
            id: "t1",
            filePath: "b.txt",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            position: { side: "new", line: 1 },
            messages: [
              {
                id: "t1",
                body: "note",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
      }),
    });
    expect(push.status).toBe(200);
    expect(readJson(push)).toMatchObject({ success: true, version: 1 });

    const read = await router.handle({ method: "GET", path: "/api/comments-json", query: {} });
    const payload = readJson(read) as { version: number; threads: Array<{ id: string }> };
    expect(payload.version).toBe(1);
    expect(payload.threads.map((thread) => thread.id)).toEqual(["t1"]);

    // 评论变化经 watch 通道广播 commentsChanged
    expect(broadcasts.map((item) => JSON.parse(item))).toEqual([
      expect.objectContaining({ type: "commentsChanged", version: 1 }),
    ]);
  });

  it("DELETE /api/comments/:threadId 对不存在的 thread 返回 404", async () => {
    const response = await router.handle({
      method: "DELETE",
      path: "/api/comments/missing",
      query: {},
    });
    expect(response.status).toBe(404);
  });

  describe("评论落盘持久化 (issue 05)", () => {
    const pushThread = (target: ApiRouter, threadId: string, repo?: string) =>
      target.handle({
        method: "POST",
        path: "/api/comments",
        query: repo ? { repo } : {},
        body: JSON.stringify({
          threads: [
            {
              id: threadId,
              filePath: "b.txt",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              position: { side: "new", line: 1 },
              codeSnapshot: { content: "beta one" },
              messages: [
                {
                  id: threadId,
                  body: `note ${threadId}`,
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                },
              ],
            },
          ],
        }),
      });

    it("POST 后新建 router (模拟重启) 仍能读出相同 threads 与 version", async () => {
      const push = await pushThread(router, "t1");
      expect(push.status).toBe(200);

      // 落盘文件位于 commentsDir, 文件名即 repositoryId
      const commentsDir = join(configDir, "comments");
      const files = await readdir(commentsDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^[0-9a-f]{64}\.json$/);

      const restarted = createApiRouter({
        parser: new GitDiffParser(fixture.repoPath),
        repoPath: fixture.repoPath,
        initialSelection: { baseCommitish: "HEAD^", targetCommitish: "HEAD" },
        configPath: join(configDir, "config.json"),
        commentsDir,
      });
      const read = await restarted.handle({
        method: "GET",
        path: "/api/comments-json",
        query: {},
      });
      const payload = readJson(read) as {
        version: number;
        threads: Array<{ id: string; codeSnapshot?: { content: string } }>;
      };
      expect(payload.version).toBe(1);
      expect(payload.threads.map((thread) => thread.id)).toEqual(["t1"]);
      expect(payload.threads[0]?.codeSnapshot?.content).toBe("beta one");
    });

    it("两个仓库的评论各落各的文件 (按仓库隔离的键组织)", async () => {
      const second = await createFixtureRepo();
      try {
        await router.handle({
          method: "POST",
          path: "/api/active-repository",
          query: {},
          body: JSON.stringify({ path: second.repoPath }),
        });

        expect((await pushThread(router, "t-first", fixture.repoPath)).status).toBe(200);
        expect((await pushThread(router, "t-second", second.repoPath)).status).toBe(200);

        const files = await readdir(join(configDir, "comments"));
        expect(files).toHaveLength(2);

        const restarted = createApiRouter({
          parser: new GitDiffParser(fixture.repoPath),
          repoPath: fixture.repoPath,
          initialSelection: { baseCommitish: "HEAD^", targetCommitish: "HEAD" },
          configPath: join(configDir, "config.json"),
          commentsDir: join(configDir, "comments"),
        });
        const firstRead = await restarted.handle({
          method: "GET",
          path: "/api/comments-json",
          query: { repo: fixture.repoPath },
        });
        expect(
          (readJson(firstRead) as { threads: Array<{ id: string }> }).threads.map(
            (thread) => thread.id,
          ),
        ).toEqual(["t-first"]);
      } finally {
        await second.cleanup();
      }
    });
  });

  it("GET/PUT /api/user-settings 读写设置", async () => {
    const initial = await router.handle({ method: "GET", path: "/api/user-settings", query: {} });
    expect(readJson(initial)).toEqual({ version: 1, client: {} });

    const written = await router.handle({
      method: "PUT",
      path: "/api/user-settings",
      query: {},
      body: JSON.stringify({ client: { fontSize: 16 } }),
    });
    expect(written.status).toBe(200);

    const after = await router.handle({ method: "GET", path: "/api/user-settings", query: {} });
    expect(readJson(after)).toEqual({ version: 1, client: { fontSize: 16 } });
  });

  it("POST /api/open-in-editor 固定返回 400 (编辑器打开属于后续 issue)", async () => {
    const response = await router.handle({
      method: "POST",
      path: "/api/open-in-editor",
      query: {},
      body: JSON.stringify({ filePath: "b.txt" }),
    });
    expect(response.status).toBe(400);
  });

  it("未知端点返回 404", async () => {
    const response = await router.handle({ method: "GET", path: "/api/nope", query: {} });
    expect(response.status).toBe(404);
  });

  it("watch stub: 连接后只推送 connected 事件, 不做文件监听", () => {
    const events = router.getInitialWatchEvents().map((item) => JSON.parse(item));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "connected", diffMode: "specific" });
  });

  it("工作区改动后的 /api/diff 实时反映 (无缓存过期问题)", async () => {
    await makeWorkingTreeChange(fixture.repoPath);
    const response = await router.handle({
      method: "GET",
      path: "/api/diff",
      query: { base: "HEAD", target: "." },
    });
    const body = readJson(response) as DiffResponse;
    expect(body.files.map((file) => file.path)).toContain("a.txt");
  });

  // issue 03: 勾选侧栏仓库树条目后, 经此端点把激活仓库切到所选仓库,
  // 后续 /api/diff 与 /api/revisions 全部面向新仓库 (单仓库管道承接)
  describe("POST /api/active-repository", () => {
    it("切换激活仓库后, diff 指向新仓库的默认对比且 repositoryId 变化", async () => {
      const before = await router.handle({ method: "GET", path: "/api/diff", query: {} });
      const beforeBody = readJson(before) as DiffResponse;

      const second = await createFixtureRepo();
      try {
        await makeWorkingTreeChange(second.repoPath);
        const switched = await router.handle({
          method: "POST",
          path: "/api/active-repository",
          query: {},
          body: JSON.stringify({ path: second.repoPath }),
        });
        expect(switched.status).toBe(200);
        // 第二夹具无远程: 默认对比降级为未提交改动 vs HEAD
        expect(readJson(switched)).toMatchObject({
          path: second.repoPath,
          selection: { baseCommitish: "HEAD", targetCommitish: "." },
        });

        // 不带参数的请求回落到新仓库的激活对比
        const after = await router.handle({ method: "GET", path: "/api/diff", query: {} });
        const afterBody = readJson(after) as DiffResponse;
        expect(afterBody.files.map((file) => file.path)).toContain("a.txt");
        expect(afterBody.repositoryId).not.toBe(beforeBody.repositoryId);
      } finally {
        await second.cleanup();
      }
    });

    it("目标路径不是 git 仓库时返回 400, 激活仓库保持不变", async () => {
      const plainDir = await mkdtemp(join(tmpdir(), "diff-viewer-plain-"));
      try {
        const response = await router.handle({
          method: "POST",
          path: "/api/active-repository",
          query: {},
          body: JSON.stringify({ path: plainDir }),
        });
        expect(response.status).toBe(400);

        // 原激活仓库的初始对比 (HEAD^...HEAD → b.txt) 不受影响
        const after = await router.handle({ method: "GET", path: "/api/diff", query: {} });
        const afterBody = readJson(after) as DiffResponse;
        expect(afterBody.files.map((file) => file.path)).toEqual(["b.txt"]);
      } finally {
        await rm(plainDir, { recursive: true, force: true });
      }
    });

    it("非法 body (缺 path / 相对路径 / 非 JSON) 一律 400", async () => {
      const missingPath = await router.handle({
        method: "POST",
        path: "/api/active-repository",
        query: {},
        body: JSON.stringify({}),
      });
      expect(missingPath.status).toBe(400);

      const relativePath = await router.handle({
        method: "POST",
        path: "/api/active-repository",
        query: {},
        body: JSON.stringify({ path: "relative/dir" }),
      });
      expect(relativePath.status).toBe(400);

      const notJson = await router.handle({
        method: "POST",
        path: "/api/active-repository",
        query: {},
        body: "not-json",
      });
      expect(notJson.status).toBe(400);
    });
  });

  // issue 04: /api/* 携带 repo 参数 (已 resolve 绝对路径) 路由到对应仓库会话;
  // 省略时落到当前聚焦会话 (POST /api/active-repository 移动的指针)
  describe("按仓库路由 (issue 04)", () => {
    it("GET /api/diff?repo= 指向未激活仓库时返回 400", async () => {
      const response = await router.handle({
        method: "GET",
        path: "/api/diff",
        query: { repo: join(fixture.repoPath, "never-activated") },
      });
      expect(response.status).toBe(400);
      expect(readJson(response)).toHaveProperty("error");
    });

    it("两仓库激活后按 repo 参数各自路由, 激活对比互不影响", async () => {
      const second = await createFixtureRepo();
      try {
        await makeWorkingTreeChange(second.repoPath);
        const activated = await router.handle({
          method: "POST",
          path: "/api/active-repository",
          query: {},
          body: JSON.stringify({ path: second.repoPath }),
        });
        expect(activated.status).toBe(200);

        // 第一仓库切换到 HEAD~2...HEAD
        const firstDiff = await router.handle({
          method: "GET",
          path: "/api/diff",
          query: { repo: fixture.repoPath, base: "HEAD~2", target: "HEAD" },
        });
        expect(firstDiff.status).toBe(200);
        const firstBody = readJson(firstDiff) as DiffResponse;
        expect(firstBody.files.map((file) => file.path).sort()).toEqual(["a.txt", "b.txt"]);

        // 无 repo 参数落到聚焦的第二仓库: 默认对比 (未提交改动 → 仅 a.txt)
        const focused = await router.handle({ method: "GET", path: "/api/diff", query: {} });
        const focusedBody = readJson(focused) as DiffResponse;
        expect(focusedBody.files.map((file) => file.path)).toEqual(["a.txt"]);
        expect(focusedBody.repositoryId).not.toBe(firstBody.repositoryId);

        // 第一仓库的激活对比保持 HEAD~2...HEAD, 不被第二仓库的请求覆盖
        const firstAgain = await router.handle({
          method: "GET",
          path: "/api/diff",
          query: { repo: fixture.repoPath },
        });
        const firstAgainBody = readJson(firstAgain) as DiffResponse;
        expect(firstAgainBody.files.map((file) => file.path).sort()).toEqual(["a.txt", "b.txt"]);
        expect(firstAgainBody.repositoryId).toBe(firstBody.repositoryId);
      } finally {
        await second.cleanup();
      }
    });

    it("GET /api/revisions?repo= 未激活仓库 400, 已激活仓库 200", async () => {
      const unknown = await router.handle({
        method: "GET",
        path: "/api/revisions",
        query: { repo: join(fixture.repoPath, "never-activated") },
      });
      expect(unknown.status).toBe(400);

      const known = await router.handle({
        method: "GET",
        path: "/api/revisions",
        query: { repo: fixture.repoPath },
      });
      expect(known.status).toBe(200);
    });

    it("评论会话按仓库隔离", async () => {
      const second = await createFixtureRepo();
      try {
        await router.handle({
          method: "POST",
          path: "/api/active-repository",
          query: {},
          body: JSON.stringify({ path: second.repoPath }),
        });

        const push = await router.handle({
          method: "POST",
          path: "/api/comments",
          query: { repo: fixture.repoPath },
          body: JSON.stringify({
            threads: [
              {
                id: "t1",
                filePath: "b.txt",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                position: { side: "new", line: 1 },
                messages: [
                  {
                    id: "t1",
                    body: "note",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                ],
              },
            ],
          }),
        });
        expect(push.status).toBe(200);

        // 无 repo 参数落到聚焦的第二仓库: 看不到第一仓库的评论
        const focusedRead = await router.handle({
          method: "GET",
          path: "/api/comments-json",
          query: {},
        });
        expect((readJson(focusedRead) as { threads: unknown[] }).threads).toHaveLength(0);

        const firstRead = await router.handle({
          method: "GET",
          path: "/api/comments-json",
          query: { repo: fixture.repoPath },
        });
        expect((readJson(firstRead) as { threads: unknown[] }).threads).toHaveLength(1);
      } finally {
        await second.cleanup();
      }
    });
  });
});
