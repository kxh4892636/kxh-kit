import { tmpdir } from "os";

import { describe, it, expect, afterEach } from "vitest";

import {
  createFixtureRepo,
  createFixtureRepoWithOrigin,
  makeWorkingTreeChange,
  runFixtureGit,
  type FixtureRepo,
} from "./fixture-repo.js";
import { GitDiffParser } from "./git-diff.js";
import { resolveInitialSelection } from "./initial-selection.js";

describe("resolveInitialSelection", () => {
  let fixtures: FixtureRepo[] = [];

  afterEach(async () => {
    for (const fixture of fixtures) {
      await fixture.cleanup();
    }
    fixtures = [];
  });

  it("origin/HEAD symref 优先于 origin/main: 当前分支与其指向分支三点对比", async () => {
    // origin 同时有 main 与 develop, symref 指向 develop
    const fixture = await createFixtureRepoWithOrigin({
      remoteBranches: ["develop"],
      originHead: "develop",
    });
    fixtures.push(fixture);

    await expect(resolveInitialSelection(new GitDiffParser(fixture.repoPath))).resolves.toEqual({
      baseCommitish: "origin/develop",
      targetCommitish: "feature",
      baseMode: "merge-base",
    });
  });

  it("无 origin/HEAD symref 时回退 origin/main", async () => {
    const fixture = await createFixtureRepoWithOrigin();
    fixtures.push(fixture);

    await expect(resolveInitialSelection(new GitDiffParser(fixture.repoPath))).resolves.toEqual({
      baseCommitish: "origin/main",
      targetCommitish: "feature",
      baseMode: "merge-base",
    });
  });

  it("无 origin/main 时回退 origin/master", async () => {
    const fixture = await createFixtureRepoWithOrigin({ defaultBranch: "master" });
    fixtures.push(fixture);

    await expect(resolveInitialSelection(new GitDiffParser(fixture.repoPath))).resolves.toEqual({
      baseCommitish: "origin/master",
      targetCommitish: "feature",
      baseMode: "merge-base",
    });
  });

  it("main/master 都不存在时用第一个远程分支", async () => {
    const fixture = await createFixtureRepoWithOrigin({ defaultBranch: "zebra" });
    fixtures.push(fixture);

    await expect(resolveInitialSelection(new GitDiffParser(fixture.repoPath))).resolves.toEqual({
      baseCommitish: "origin/zebra",
      targetCommitish: "feature",
      baseMode: "merge-base",
    });
  });

  it("无远程时降级为 未提交改动 vs HEAD", async () => {
    const fixture = await createFixtureRepo();
    fixtures.push(fixture);
    await makeWorkingTreeChange(fixture.repoPath);

    await expect(resolveInitialSelection(new GitDiffParser(fixture.repoPath))).resolves.toEqual({
      baseCommitish: "HEAD",
      targetCommitish: ".",
    });
  });

  it("detached HEAD 即使有远程也降级为 未提交改动 vs HEAD", async () => {
    const fixture = await createFixtureRepoWithOrigin();
    fixtures.push(fixture);
    runFixtureGit(fixture.repoPath, ["checkout", "--detach", "HEAD"]);

    await expect(resolveInitialSelection(new GitDiffParser(fixture.repoPath))).resolves.toEqual({
      baseCommitish: "HEAD",
      targetCommitish: ".",
    });
  });

  it("非 git 仓库抛错由调用方兜底", async () => {
    await expect(resolveInitialSelection(new GitDiffParser(tmpdir()))).rejects.toThrow();
  });
});
