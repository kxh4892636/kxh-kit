import { mkdtemp, rm } from "fs/promises";
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
});
