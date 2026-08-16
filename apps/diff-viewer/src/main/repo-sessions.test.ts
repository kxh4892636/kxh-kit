// 按仓库 keyed 的多 parser 会话管理 (issue 04): 每个已激活仓库一个会话
// (parser + 激活对比 + 评论基线选择 + generated 缓存), 切换仓库互不覆盖。
// issue 06 增补: ssh:// 远程仓库键的规范化/激活/远程 parser 工厂。
import { createHash } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DiffSelection } from "../types/diff.js";

import type { DiffParser } from "./diff-parser.js";
import { createFixtureRepo, type FixtureRepo } from "./fixture-repo.js";
import { GitDiffParser } from "./git-diff.js";
import {
  createRepoSessionManager,
  normalizeRepoSessionKey,
  type RepoSessionManager,
} from "./repo-sessions.js";

const INITIAL_SELECTION: DiffSelection = { baseCommitish: "HEAD^", targetCommitish: "HEAD" };

describe("repo-sessions", () => {
  let fixture: FixtureRepo;
  let manager: RepoSessionManager;

  beforeEach(async () => {
    fixture = await createFixtureRepo();
    manager = createRepoSessionManager({
      repoPath: fixture.repoPath,
      parser: new GitDiffParser(fixture.repoPath),
      initialSelection: INITIAL_SELECTION,
    });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("启动仓库即初始聚焦会话, 无 repo 参数的请求落到它", () => {
    const result = manager.resolveForRequest();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.repoPath).toBe(resolve(fixture.repoPath));
    expect(result.session.currentSelection).toEqual(INITIAL_SELECTION);
    expect(result.session.repositoryId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("activate 新仓库创建会话并移动聚焦指针, 默认对比为未提交改动 (无远程降级)", async () => {
    const second = await createFixtureRepo();
    try {
      const activated = await manager.activate(second.repoPath);
      expect(activated.ok).toBe(true);
      if (!activated.ok) return;
      expect(activated.session.repoPath).toBe(resolve(second.repoPath));
      expect(activated.session.currentSelection).toEqual({
        baseCommitish: "HEAD",
        targetCommitish: ".",
      });

      const focused = manager.resolveForRequest();
      expect(focused.ok && focused.session.repoPath).toBe(resolve(second.repoPath));

      // 原会话仍按 key 可取, repositoryId 不同
      const first = manager.resolveForRequest(fixture.repoPath);
      expect(first.ok && first.session.repositoryId).not.toBe(activated.session.repositoryId);
    } finally {
      await second.cleanup();
    }
  });

  it("重复 activate 已有会话: 不重置其激活对比, 仅移动聚焦指针", async () => {
    const second = await createFixtureRepo();
    try {
      const firstActivation = await manager.activate(second.repoPath);
      expect(firstActivation.ok).toBe(true);
      if (!firstActivation.ok) return;

      // 模拟用户在该仓库切换过对比 (api-router 的 /api/diff 会写 currentSelection)
      const userSelection: DiffSelection = {
        baseCommitish: "HEAD~2",
        targetCommitish: "HEAD",
      };
      firstActivation.session.currentSelection = userSelection;

      // 聚焦回启动仓库, 再 activate 第二仓库
      await manager.activate(fixture.repoPath);
      const reactivated = await manager.activate(second.repoPath);
      expect(reactivated.ok).toBe(true);
      if (!reactivated.ok) return;
      expect(reactivated.session.currentSelection).toEqual(userSelection);
      expect(manager.resolveForRequest().ok).toBe(true);
    } finally {
      await second.cleanup();
    }
  });

  it("activate 非 git 目录返回错误且聚焦不变", async () => {
    const plainDir = await mkdtemp(join(tmpdir(), "diff-viewer-plain-"));
    try {
      const result = await manager.activate(plainDir);
      expect(result.ok).toBe(false);

      const focused = manager.resolveForRequest();
      expect(focused.ok && focused.session.repoPath).toBe(resolve(fixture.repoPath));
    } finally {
      await rm(plainDir, { recursive: true, force: true });
    }
  });

  it("resolveForRequest 按路径取未激活仓库返回错误", () => {
    const result = manager.resolveForRequest(join(fixture.repoPath, "never-activated"));
    expect(result.ok).toBe(false);
  });
});

describe("repo-sessions 远程会话 (issue 06)", () => {
  let fixture: FixtureRepo;

  beforeEach(async () => {
    fixture = await createFixtureRepo();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  const createRemoteParserStub = (overrides: Partial<DiffParser> = {}): DiffParser => ({
    parseDiff: async () => {
      throw new Error("not implemented in stub");
    },
    getRevisionOptions: async () => ({ branches: [], commits: [] }),
    normalizeRepositoryRelativePath: (filepath: string) => filepath,
    getGeneratedStatus: async () => ({ isGenerated: false, source: "path" }),
    getLineCount: async () => 0,
    getBlobContent: async () => Buffer.alloc(0),
    getCurrentBranch: async () => "main",
    getOriginDefaultBranch: async () => null,
    ...overrides,
  });

  const createManagerWithRemote = (parserFactory?: (key: string) => DiffParser) =>
    createRepoSessionManager({
      repoPath: fixture.repoPath,
      parser: new GitDiffParser(fixture.repoPath),
      initialSelection: { baseCommitish: "HEAD^", targetCommitish: "HEAD" },
      createRemoteParser: parserFactory,
    });

  it("ssh:// 键激活远程会话: 不经本地路径 resolve, 会话带 remote 定位信息", async () => {
    const capturedKeys: string[] = [];
    const manager = createManagerWithRemote((key) => {
      capturedKeys.push(key);
      return createRemoteParserStub();
    });

    const key = "ssh://git@example.com:2222/srv/work/repo";
    const activated = await manager.activate(key);
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;

    expect(capturedKeys).toEqual([key]);
    expect(activated.session.repoPath).toBe(key);
    expect(activated.session.remote).toEqual({
      target: { host: "example.com", user: "git", port: 2222 },
      remotePath: "/srv/work/repo",
    });
    // 评论存储键: repositoryId = sha256(规范远程键), 不混入本地路径语义
    expect(activated.session.repositoryId).toBe(createHash("sha256").update(key).digest("hex"));
    // 远程键绝不能被本地路径 resolve 改写
    expect(activated.session.repoPath.startsWith("ssh://")).toBe(true);

    const focused = manager.resolveForRequest();
    expect(focused.ok && focused.session.repoPath).toBe(key);
  });

  it("键规范化: 尾斜杠等形态差异命中同一会话, 不重复建会话", async () => {
    let factoryCalls = 0;
    const manager = createManagerWithRemote(() => {
      factoryCalls += 1;
      return createRemoteParserStub();
    });

    const first = await manager.activate("ssh://git@example.com/srv/work/");
    expect(first.ok).toBe(true);
    const second = await manager.activate("ssh://git@example.com/srv/work");
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.session).toBe(second.session);
    }
    expect(factoryCalls).toBe(1);

    // resolveForRequest 同样规范化
    const resolved = manager.resolveForRequest("ssh://git@example.com/srv/work/");
    expect(resolved.ok && resolved.session.repoPath).toBe("ssh://git@example.com/srv/work");

    expect(normalizeRepoSessionKey("ssh://git@example.com/srv/work/")).toBe(
      "ssh://git@example.com/srv/work",
    );
  });

  it("远程键的初始对比: 当前分支 + origin 默认分支 → 三点对比", async () => {
    const manager = createManagerWithRemote(() =>
      createRemoteParserStub({
        getCurrentBranch: async () => "feature",
        getOriginDefaultBranch: async () => "origin/main",
      }),
    );

    const activated = await manager.activate("ssh://git@example.com/srv/work");
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.session.currentSelection).toEqual({
      baseCommitish: "origin/main",
      targetCommitish: "feature",
      baseMode: "merge-base",
    });
  });

  it("createRemoteParser 未提供时远程键激活失败", async () => {
    const manager = createManagerWithRemote(undefined);

    const result = await manager.activate("ssh://git@example.com/srv/work");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ssh://git@example.com/srv/work");
  });

  it("远程初始对比解析失败 (远端非 git 仓库或连接失败) 返回错误且聚焦不变", async () => {
    const manager = createManagerWithRemote(() =>
      createRemoteParserStub({
        getCurrentBranch: async () => {
          throw new Error("git symbolic-ref failed on remote (exit 128): not a git repository");
        },
      }),
    );

    const result = await manager.activate("ssh://git@example.com/srv/work");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not a git repository");

    const focused = manager.resolveForRequest();
    expect(focused.ok && focused.session.repoPath).toBe(resolve(fixture.repoPath));
  });
});
