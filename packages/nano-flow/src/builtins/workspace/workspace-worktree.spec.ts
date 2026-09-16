import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { InvocationContext } from "../../cli/types";
import { WORKSPACE_CONFIG_FILE } from "./workspace-config";
import { prepareWorkspaceAdd } from "./workspace-worktree";
import {
  cleanupTemporaryDirectories,
  createDirectory,
  createWorkspace,
  git,
  gitAvailable,
  invoke,
  isMissing,
} from "./testing/worktree-fixture";

afterEach(async (): Promise<void> => {
  await cleanupTemporaryDirectories();
});

describe.skipIf(!gitAvailable)("workspace worktree (git integration)", (): void => {
  test("list reports unmaterialized, unknown, and detached primary repositories", async (): Promise<void> => {
    const parent = await createDirectory();
    const root = path.join(parent, "empty-workspace");
    await mkdir(root);
    await writeFile(
      path.join(root, WORKSPACE_CONFIG_FILE),
      "repositories:\n  - name: missing\n    url: https://example.com/missing.git\n    path: repositories/missing\n    branch: main\n",
      "utf8",
    );
    const missing = await invoke(root, ["worktree", "list"]);
    expect(JSON.parse(missing.stdout).repositories[0]).toMatchObject({
      status: "not-materialized",
    });
    expect((await invoke(root, ["worktree", "list", "--name", "unknown"])).code).toBe(1);

    const fixture = await createWorkspace();
    await git(["-C", fixture.repositoryPath, "checkout", "--detach", "-q"]);
    const detached = await invoke(fixture.root, ["worktree", "list"]);
    expect(JSON.parse(detached.stdout).repositories[0].worktrees[0]).not.toHaveProperty("branch");
  }, 30000);

  test("add commit rechecks a target created after preview", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const context: InvocationContext = {
      cwd: fixture.root,
      env: {},
      signal: new AbortController().signal,
      stdin: { readLine: async (): Promise<null> => null },
      debug: false,
      dryRun: false,
    };
    const prepared = await prepareWorkspaceAdd(
      { name: "wiki", path: "worktrees/race", branch: "feature/race" },
      context,
    );
    await mkdir(path.join(fixture.root, "worktrees/race"), { recursive: true });
    await expect(prepared.commit()).rejects.toThrow("target already exists");
  }, 30000);

  test("remove accepts a detached worktree when branch deletion is not requested", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/detached-remove");
    await git(["-C", fixture.repositoryPath, "worktree", "add", "--detach", worktreePath, "main"]);
    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "worktrees/detached-remove",
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({ branchDeleted: false });
    expect(JSON.parse(result.stdout)).not.toHaveProperty("branch");
  }, 30000);
  test("add creates an explicit worktree branch from the configured base", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/wiki");

    const result = await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/wiki",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      action: "add-worktree",
      name: "wiki",
      path: worktreePath,
      branch: "feature/wiki",
      createdBranch: true,
      base: "main",
    });
    expect((await git(["-C", worktreePath, "branch", "--show-current"])).trim()).toBe(
      "feature/wiki",
    );
  }, 30000);

  test("add dry-run uses a timestamped branch and leaves the target absent", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/preview");

    const result = await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/preview",
      "--dry-run",
    ]);

    expect(JSON.parse(result.stdout).preview).toMatchObject({
      action: "add-worktree",
      path: worktreePath,
      branch: expect.stringMatching(/^worktree\/wiki-\d{14}$/u),
      base: "main",
    });
    expect(await isMissing(worktreePath)).toBe(true);
  }, 30000);
});

describe.skipIf(!gitAvailable)("workspace worktree (git integration)", (): void => {
  test("add checks out an existing branch without reporting a new branch", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "worktrees/existing");
    await git(["-C", fixture.repositoryPath, "branch", "feature/existing"]);

    const result = await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/existing",
      "--branch",
      "feature/existing",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "add-worktree",
      name: "wiki",
      path: worktreePath,
      branch: "feature/existing",
      createdBranch: false,
    });
    expect((await git(["-C", worktreePath, "branch", "--show-current"])).trim()).toBe(
      "feature/existing",
    );
  }, 30000);

  test("add rejects a target whose parent resolves outside the workspace", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const outside = await createDirectory();
    await symlink(
      outside,
      path.join(fixture.root, "worktrees"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const result = await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/outside",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("outside the workspace");
    expect(await isMissing(path.join(outside, "wiki"))).toBe(true);
  }, 30000);

  test("add accepts a dotted path segment that only starts with two dots", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const worktreePath = path.join(fixture.root, "..feature/wiki");

    const result = await invoke(fixture.root, [
      "worktree",
      "add",
      "--name",
      "wiki",
      "--path",
      "..feature/wiki",
      "--branch",
      "feature/dotted-path",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).path).toBe(worktreePath);
    expect(await isMissing(worktreePath)).toBe(false);
  }, 30000);

  test("target operations require an explicit safe path and protect the primary clone", async (): Promise<void> => {
    const fixture = await createWorkspace();
    expect((await invoke(fixture.root, ["worktree", "add", "--name", "wiki"])).code).toBe(2);
    expect(
      (await invoke(fixture.root, ["worktree", "add", "--name", "wiki", "--path", "../outside"]))
        .code,
    ).toBe(2);
    for (const command of ["add", "switch", "remove"] as const) {
      const arguments_ = [
        "worktree",
        command,
        "--name",
        "wiki",
        "--path",
        "repositories/wiki",
        ...(command === "switch" ? ["--branch", "feature/x"] : []),
      ];
      const result = await invoke(fixture.root, arguments_);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("primary");
    }
  }, 30000);
});

describe.skipIf(!gitAvailable)("workspace worktree (git integration)", (): void => {
  test("list identifies the primary clone and locked extra worktree", async (): Promise<void> => {
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
    await git(["-C", fixture.repositoryPath, "worktree", "lock", worktreePath]);

    const result = await invoke(fixture.root, ["worktree", "list"]);
    const output = JSON.parse(result.stdout);
    const repository = output.repositories[0];

    expect(result.code).toBe(0);
    expect(output.success).toBe(true);
    expect(repository.status).toBe("materialized");
    expect(repository.repositoryPath).toBe(fixture.repositoryPath);
    expect(repository.worktrees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: fixture.repositoryPath, primary: true }),
        expect.objectContaining({ path: worktreePath, primary: false, locked: true }),
      ]),
    );
  }, 30000);

  test("switch updates only the explicitly addressed extra worktree", async (): Promise<void> => {
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
      "feature/old",
    ]);

    const result = await invoke(fixture.root, [
      "worktree",
      "switch",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/new",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "switch-worktree",
      name: "wiki",
      path: worktreePath,
      branch: "feature/new",
      created: true,
      base: "main",
    });
    expect((await git(["-C", worktreePath, "branch", "--show-current"])).trim()).toBe(
      "feature/new",
    );
    expect((await git(["-C", fixture.repositoryPath, "branch", "--show-current"])).trim()).toBe(
      "main",
    );
  }, 30000);

  test("switch checks out an existing branch without reporting a new branch", async (): Promise<void> => {
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
      "feature/old",
    ]);
    await git(["-C", fixture.repositoryPath, "branch", "feature/existing"]);

    const result = await invoke(fixture.root, [
      "worktree",
      "switch",
      "--name",
      "wiki",
      "--path",
      "worktrees/wiki",
      "--branch",
      "feature/existing",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "switch-worktree",
      name: "wiki",
      path: worktreePath,
      branch: "feature/existing",
      created: false,
    });
  }, 30000);
});
