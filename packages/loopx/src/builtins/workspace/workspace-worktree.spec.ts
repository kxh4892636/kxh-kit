import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import workspaceCommand from "./index";
import { WORKSPACE_CONFIG_FILE } from "./workspace-config";

const execFileAsync = promisify(execFile);
const gitAvailable = await execFileAsync("git", ["--version"]).then(
  (): boolean => true,
  (): boolean => false,
);
const temporaryDirectories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "loopx-workspace-worktree-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory: string): Promise<void> => rm(directory, { force: true, recursive: true })),
  );
});

const git = async (arguments_: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync("git", [...arguments_]);
  return stdout;
};

const gitCommit = async (repository: string, message: string): Promise<void> => {
  await git([
    "-C",
    repository,
    "-c",
    "user.email=loopx@test",
    "-c",
    "user.name=LoopX",
    "commit",
    "-q",
    "-m",
    message,
  ]);
};

interface CliResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

const invoke = async (cwd: string, argv: readonly string[]): Promise<CliResult> => {
  let stdout = "";
  let stderr = "";
  const request: CliRequest = {
    argv: ["workspace", ...argv, "--compact"],
    cwd,
    env: {},
    signal: new AbortController().signal,
    stdin: { readLine: async (): Promise<null> => null },
    stdout: { write: (chunk: string): void => void (stdout += chunk) },
    stderr: { write: (chunk: string): void => void (stderr += chunk) },
  };
  const code = await runCli(request, [(): BuiltinCommand => workspaceCommand]);
  return { code, stderr, stdout };
};

interface WorkspaceFixture {
  readonly repositoryPath: string;
  readonly root: string;
}

const createWorkspace = async (): Promise<WorkspaceFixture> => {
  const parent = await createDirectory();
  const seed = path.join(parent, "seed");
  await git(["init", "-q", "-b", "main", seed]);
  await writeFile(path.join(seed, "README.md"), "# wiki\n", "utf8");
  await git(["-C", seed, "add", "README.md"]);
  await gitCommit(seed, "initial");
  const bare = path.join(parent, "wiki.git");
  await git(["clone", "-q", "--bare", seed, bare]);
  const root = path.join(parent, "workspace");
  await mkdir(root);
  await writeFile(
    path.join(root, WORKSPACE_CONFIG_FILE),
    `repositories:\n  - name: wiki\n    url: ${pathToFileURL(bare).href}\n    path: repositories/wiki\n    branch: main\n`,
    "utf8",
  );
  const cloned = await invoke(root, ["repository", "clone"]);
  expect(cloned.code).toBe(0);
  return { repositoryPath: path.join(root, "repositories/wiki"), root };
};

const isMissing = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return false;
  } catch {
    return true;
  }
};

describe.skipIf(!gitAvailable)("workspace worktree (git integration)", (): void => {
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
    const repository = JSON.parse(result.stdout).repositories[0];

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
    expect(JSON.parse(result.stdout)).toMatchObject({ created: true, base: "main" });
    expect((await git(["-C", worktreePath, "branch", "--show-current"])).trim()).toBe(
      "feature/new",
    );
    expect((await git(["-C", fixture.repositoryPath, "branch", "--show-current"])).trim()).toBe(
      "main",
    );
  }, 30000);

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
    expect(JSON.parse(result.stdout).branchDeleted).toBe(true);
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
    await rm(worktreePath, { recursive: true });

    const result = await invoke(fixture.root, ["worktree", "prune"]);

    expect(JSON.parse(result.stdout).repositories[0].pruned[0]).toMatchObject({
      path: worktreePath,
      branch: "feature/stale",
    });
    expect(
      await git(["-C", fixture.repositoryPath, "worktree", "list", "--porcelain"]),
    ).not.toContain(worktreePath);
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
    expect(JSON.parse(status.stdout).repositories[0].reason).toContain("outside the workspace");
  }, 30000);

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
