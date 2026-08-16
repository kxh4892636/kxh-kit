// 按仓库 keyed 的多 parser 会话管理 (issue 04): 每个已激活仓库一个会话
// (parser + 激活对比 + 评论基线选择 + generated 缓存), 切换仓库互不覆盖。
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DiffSelection } from "../types/diff.js";
import { createFixtureRepo, type FixtureRepo } from "./fixture-repo.js";
import { GitDiffParser } from "./git-diff.js";

import { createRepoSessionManager, type RepoSessionManager } from "./repo-sessions.js";

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
