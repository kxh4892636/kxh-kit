import { tmpdir } from "os";

import { describe, it, expect, afterEach } from "vitest";

import { createFixtureRepo, makeWorkingTreeChange, type FixtureRepo } from "./fixture-repo.js";
import { resolveInitialSelection } from "./initial-selection.js";

describe("resolveInitialSelection", () => {
  let fixture: FixtureRepo | null = null;

  afterEach(async () => {
    await fixture?.cleanup();
    fixture = null;
  });

  it("有未提交改动时对比 工作区 vs HEAD", async () => {
    fixture = await createFixtureRepo();
    await makeWorkingTreeChange(fixture.repoPath);

    await expect(resolveInitialSelection(fixture.repoPath)).resolves.toEqual({
      baseCommitish: "HEAD",
      targetCommitish: ".",
    });
  });

  it("干净的多 commit 仓库展示最近一次 commit", async () => {
    fixture = await createFixtureRepo();

    await expect(resolveInitialSelection(fixture.repoPath)).resolves.toEqual({
      baseCommitish: "HEAD^",
      targetCommitish: "HEAD",
    });
  });

  it("非 git 仓库抛错由调用方兜底", async () => {
    await expect(resolveInitialSelection(tmpdir())).rejects.toThrow();
  });
});
