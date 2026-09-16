import { rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupTemporaryDirectories,
  createDirectory,
  createWorkspace,
  git,
  gitAvailable,
  gitCommit,
  invoke,
  isMissing,
} from "./testing/worktree-fixture";

afterEach(async (): Promise<void> => {
  await cleanupTemporaryDirectories();
});

describe.skipIf(!gitAvailable)("workspace worktree (git integration)", (): void => {
  test("remove rejects dirty worktrees unless forced and preserves the branch", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/wiki");
    await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/wiki",
    ]);
    await writeFile(path.join(worktreePath, "dirty.txt"), "dirty\n", "utf8");

    const blocked = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
    ]);
    expect(blocked.code).toBe(1);
    const removed = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--force",
    ]);
    expect(removed.code).toBe(0);
    expect(JSON.parse(removed.stdout)).toEqual({
      success: true,
      action: "remove-worktree",
      name: "wiki",
      path: worktreePath,
      branch: "feature/wiki",
      branchDeleted: false,
    });
    expect(await isMissing(worktreePath)).toBe(true);
    expect(await git(["-C", fixture.repositoryPath, "branch", "--list", "feature/wiki"])).toContain(
      "feature/wiki",
    );
  }, 30000);

  test("remove can delete its merged branch", async (): Promise<void> => {
    const fixture = await createWorkspace();
    await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/wiki",
    ]);

    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--delete-branch",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "remove-worktree",
      name: "wiki",
      path: path.join(fixture.root, "worktrees/wiki"),
      branch: "feature/wiki",
      branchDeleted: true,
    });
    expect(
      (await git(["-C", fixture.repositoryPath, "branch", "--list", "feature/wiki"])).trim(),
    ).toBe("");
  }, 30000);

  test("remove keeps an unmerged branch worktree when branch deletion is requested", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/wiki");
    await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/unmerged",
    ]);
    await writeFile(path.join(worktreePath, "feature.txt"), "feature\n", "utf8");
    await git(["-C", worktreePath, "add", "feature.txt"]);
    await gitCommit(worktreePath, "unmerged feature");

    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--delete-branch",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("not merged");
    expect(await isMissing(worktreePath)).toBe(false);
    expect(
      await git(["-C", fixture.repositoryPath, "branch", "--list", "feature/unmerged"]),
    ).toContain("feature/unmerged");
  }, 30000);
});

describe.skipIf(!gitAvailable)("workspace worktree (git integration)", (): void => {
  test("remove keeps a detached worktree when branch deletion is requested", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/detached");
    await git(["-C", fixture.repositoryPath, "worktree", "add", "--detach", worktreePath]);

    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "worktrees/detached",
      "--delete-branch",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("detached worktree");
    expect(await isMissing(worktreePath)).toBe(false);
  }, 30000);

  test("prune removes only a stale registration", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/stale");
    await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/stale",
      "--branch",
      "feature/stale",
    ]);
    const head = (await git(["-C", worktreePath, "rev-parse", "HEAD"])).trim();
    await rm(worktreePath, { recursive: true });

    const result = await invoke(fixture.root, ["worktree", "prune"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "prune-worktrees",
      repositories: [
        {
          name: "wiki",
          status: "pruned",
          pruned: [{ path: worktreePath, head, branch: "feature/stale" }],
        },
      ],
    });
    expect(
      await git(["-C", fixture.repositoryPath, "worktree", "list", "--porcelain"]),
    ).not.toContain(worktreePath);
  }, 30000);

  test("prune reports a repository that is not materialized", async (): Promise<void> => {
    const fixture = await createWorkspace();
    await rm(fixture.repositoryPath, { recursive: true });

    const result = await invoke(fixture.root, ["worktree", "prune"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "prune-worktrees",
      repositories: [{ name: "wiki", status: "not-materialized", pruned: [] }],
    });
  }, 30000);

  test("all repository-backed commands reject a configured clone linked outside", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const outside = await createDirectory();
    const outsideRepository = path.join(outside, "wiki");
    await git(["clone", "-q", fixture.repositoryPath, outsideRepository]);
    await rm(fixture.repositoryPath, { recursive: true });
    await symlink(
      outsideRepository,
      fixture.repositoryPath,
      process.platform === "win32" ? "junction" : "dir",
    );

    for (const arguments_ of [
      ["worktree", "list"],
      ["worktree", "add", "--name", "wiki", "--path", "worktrees/wiki"],
      ["worktree", "prune"],
      ["repository", "pull"],
    ]) {
      const result = await invoke(fixture.root, arguments_);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("outside the workspace");
    }
    const status = await invoke(fixture.root, ["repository", "status"]);
    const statusOutput = JSON.parse(status.stdout);
    expect(statusOutput).toMatchObject({ success: false, action: "status-repositories" });
    expect(statusOutput.repositories[0].reason).toContain("outside the workspace");
  }, 30000);
});

describe.skipIf(!gitAvailable)("workspace worktree (git integration)", (): void => {
  test("deletion order is worktree then repository then config", async (): Promise<void> => {
    const fixture = await createWorkspace();
    await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/wiki",
    ]);
    const repositoryBlocked = await invoke(fixture.root, [
      "repository",
      "remove",
      "--name",
      "wiki",
      "--yes",
    ]);
    expect(repositoryBlocked.code).toBe(1);
    const configBlocked = await invoke(fixture.root, ["config", "remove", "--name", "wiki"]);
    expect(configBlocked.code).toBe(1);

    expect(
      (
        await invoke(fixture.root, [
          "worktree",
          "remove",
          "--name",
          "wiki",
          "--path",
          "worktrees/wiki",
        ])
      ).code,
    ).toBe(0);
    expect(
      (await invoke(fixture.root, ["repository", "remove", "--name", "wiki", "--yes"])).code,
    ).toBe(0);
    expect((await invoke(fixture.root, ["config", "remove", "--name", "wiki"])).code).toBe(0);
  }, 30000);
});
