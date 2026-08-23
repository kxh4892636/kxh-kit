import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import workspaceCommand from "./index";
import { WORKSPACE_CONFIG_FILE, WORKSPACE_LOCAL_FILE } from "./workspace-config";

const execFileAsync = promisify(execFile);
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

interface WorkspaceFixture {
  readonly clonePath: string;
  readonly mainPath: string;
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
  const clonePath = path.join(parent, "clone");
  await git(["clone", "-q", pathToFileURL(bare).href, clonePath]);
  const root = path.join(parent, "workspace");
  await mkdir(root);
  const mainPath = path.join(root, "apps/wiki");
  await writeFile(
    path.join(root, WORKSPACE_CONFIG_FILE),
    `repositories:\n  - name: wiki\n    url: ${pathToFileURL(bare).href}\n    path: apps/wiki\n    branch: main\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, WORKSPACE_LOCAL_FILE),
    `repositories:\n  - name: wiki\n    clone_path: ${clonePath.replace(/\\/gu, "/")}\n`,
    "utf8",
  );
  await git(["-C", clonePath, "worktree", "add", "-q", "-b", "worktree/wiki-main", mainPath]);
  return { clonePath, mainPath, root };
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
  const code = await runCli(request, [() => workspaceCommand]);
  return { code, stderr, stdout };
};

const isMissing = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return false;
  } catch {
    return true;
  }
};

describe("workspace worktree (git integration)", (): void => {
  test("list distinguishes the configured main worktree and a locked extra worktree", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const extraPath = path.join(fixture.root, "extra/wiki");
    await git(["-C", fixture.clonePath, "worktree", "add", "-q", "-b", "feature/extra", extraPath]);
    await git(["-C", fixture.clonePath, "worktree", "lock", "--reason", "in use", extraPath]);

    const result = await invoke(fixture.root, ["worktree", "list"]);

    expect(result.code).toBe(0);
    const repository = JSON.parse(result.stdout).repositories[0];
    expect(repository).toMatchObject({ name: "wiki", status: "materialized" });
    expect(repository.worktrees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: fixture.mainPath,
          branch: "worktree/wiki-main",
          isMain: true,
          locked: false,
        }),
        expect.objectContaining({
          path: extraPath,
          branch: "feature/extra",
          isMain: false,
          locked: true,
        }),
      ]),
    );
  }, 30000);

  test("switch changes a registered worktree to an existing branch", async (): Promise<void> => {
    const fixture = await createWorkspace();
    await git(["-C", fixture.clonePath, "branch", "feature/existing", "main"]);

    const result = await invoke(fixture.root, [
      "worktree",
      "switch",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--branch",
      "feature/existing",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      action: "switch-worktree",
      name: "wiki",
      path: fixture.mainPath,
      branch: "feature/existing",
      created: false,
    });
    expect((await git(["-C", fixture.mainPath, "branch", "--show-current"])).trim()).toBe(
      "feature/existing",
    );
  }, 30000);

  test("switch creates a missing branch from an explicit base", async (): Promise<void> => {
    const fixture = await createWorkspace();
    await git(["-C", fixture.clonePath, "branch", "release", "main"]);

    const result = await invoke(fixture.root, [
      "worktree",
      "switch",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--branch",
      "feature/new",
      "--base",
      "release",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      branch: "feature/new",
      created: true,
      base: "release",
    });
    expect((await git(["-C", fixture.mainPath, "branch", "--show-current"])).trim()).toBe(
      "feature/new",
    );
  }, 30000);

  test("switch preserves the git error when another worktree occupies the branch", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const extraPath = path.join(fixture.root, "extra/wiki");
    await git([
      "-C",
      fixture.clonePath,
      "worktree",
      "add",
      "-q",
      "-b",
      "feature/occupied",
      extraPath,
    ]);

    const result = await invoke(fixture.root, [
      "worktree",
      "switch",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--branch",
      "feature/occupied",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error).toContain("feature/occupied");
    expect((await git(["-C", fixture.mainPath, "branch", "--show-current"])).trim()).toBe(
      "worktree/wiki-main",
    );
  }, 30000);

  test("switch --dry-run plans a branch from the configured base without changing HEAD", async (): Promise<void> => {
    const fixture = await createWorkspace();

    const result = await invoke(fixture.root, [
      "worktree",
      "switch",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--branch",
      "feature/preview",
      "--dry-run",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      dryRun: true,
      preview: {
        action: "switch-worktree",
        branch: "feature/preview",
        created: true,
        base: "main",
      },
    });
    expect((await git(["-C", fixture.mainPath, "branch", "--show-current"])).trim()).toBe(
      "worktree/wiki-main",
    );
  }, 30000);

  test("remove deletes the worktree and preserves its branch by default", async (): Promise<void> => {
    const fixture = await createWorkspace();

    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      action: "remove-worktree",
      name: "wiki",
      path: fixture.mainPath,
      branch: "worktree/wiki-main",
      branchDeleted: false,
    });
    expect(await isMissing(fixture.mainPath)).toBe(true);
    expect(
      (await git(["-C", fixture.clonePath, "branch", "--list", "worktree/wiki-main"])).trim(),
    ).toContain("worktree/wiki-main");
  }, 30000);

  test("a preserved branch can be reused by switching another registered worktree", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const extraPath = path.join(fixture.root, "extra/wiki");
    await git(["-C", fixture.clonePath, "worktree", "add", "-q", "-b", "feature/extra", extraPath]);
    await invoke(fixture.root, ["worktree", "remove", "--name", "wiki", "--path", "apps/wiki"]);

    const result = await invoke(fixture.root, [
      "worktree",
      "switch",
      "--name",
      "wiki",
      "--path",
      "extra/wiki",
      "--branch",
      "worktree/wiki-main",
    ]);

    expect(result.code).toBe(0);
    expect((await git(["-C", extraPath, "branch", "--show-current"])).trim()).toBe(
      "worktree/wiki-main",
    );
  }, 30000);

  test("remove rejects a dirty worktree unless --force is used", async (): Promise<void> => {
    const fixture = await createWorkspace();
    await writeFile(path.join(fixture.mainPath, "dirty.txt"), "dirty\n", "utf8");

    const rejected = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
    ]);

    expect(rejected.code).toBe(1);
    expect(JSON.parse(rejected.stderr).error).toContain("force");
    expect(await isMissing(fixture.mainPath)).toBe(false);

    const forced = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--force",
    ]);
    expect(forced.code).toBe(0);
    expect(await isMissing(fixture.mainPath)).toBe(true);
  }, 30000);

  test("remove --delete-branch deletes a merged worktree branch", async (): Promise<void> => {
    const fixture = await createWorkspace();

    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--delete-branch",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).branchDeleted).toBe(true);
    expect(
      (await git(["-C", fixture.clonePath, "branch", "--list", "worktree/wiki-main"])).trim(),
    ).toBe("");
  }, 30000);

  test("remove --delete-branch preserves git refusal for an unmerged branch", async (): Promise<void> => {
    const fixture = await createWorkspace();
    await writeFile(path.join(fixture.mainPath, "local.txt"), "local\n", "utf8");
    await git(["-C", fixture.mainPath, "add", "local.txt"]);
    await gitCommit(fixture.mainPath, "local work");

    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--delete-branch",
    ]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error).toContain("not fully merged");
    expect(await isMissing(fixture.mainPath)).toBe(true);
    expect(
      (await git(["-C", fixture.clonePath, "branch", "--list", "worktree/wiki-main"])).trim(),
    ).toContain("worktree/wiki-main");
  }, 30000);

  test("remove --dry-run reports its actions without removing the worktree or branch", async (): Promise<void> => {
    const fixture = await createWorkspace();

    const result = await invoke(fixture.root, [
      "worktree",
      "remove",
      "--name",
      "wiki",
      "--path",
      "apps/wiki",
      "--delete-branch",
      "--dry-run",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      dryRun: true,
      preview: {
        action: "remove-worktree",
        branch: "worktree/wiki-main",
        deleteBranch: true,
      },
    });
    expect(await isMissing(fixture.mainPath)).toBe(false);
    expect(
      (await git(["-C", fixture.clonePath, "branch", "--list", "worktree/wiki-main"])).trim(),
    ).toContain("worktree/wiki-main");
  }, 30000);

  test("prune reports and removes a registration whose directory was deleted manually", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const stalePath = path.join(fixture.root, "extra/stale");
    await git(["-C", fixture.clonePath, "worktree", "add", "-q", "-b", "feature/stale", stalePath]);
    await rm(stalePath, { force: true, recursive: true });

    const result = await invoke(fixture.root, ["worktree", "prune"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      action: "prune-worktrees",
      repositories: [
        {
          name: "wiki",
          status: "pruned",
          pruned: [expect.objectContaining({ path: stalePath, branch: "feature/stale" })],
        },
      ],
    });
    expect(await git(["-C", fixture.clonePath, "worktree", "list", "--porcelain"])).not.toContain(
      stalePath,
    );
  }, 30000);

  test("prune --dry-run reports stale registrations without pruning them", async (): Promise<void> => {
    const fixture = await createWorkspace();
    const stalePath = path.join(fixture.root, "extra/stale");
    await git(["-C", fixture.clonePath, "worktree", "add", "-q", "-b", "feature/stale", stalePath]);
    await rm(stalePath, { force: true, recursive: true });

    const result = await invoke(fixture.root, ["worktree", "prune", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      dryRun: true,
      preview: {
        action: "prune-worktrees",
        repositories: [{ name: "wiki", pruned: [expect.objectContaining({ path: stalePath })] }],
      },
    });
    const porcelain = await git(["-C", fixture.clonePath, "worktree", "list", "--porcelain"]);
    expect(porcelain).toContain(stalePath.replace(/\\/gu, "/"));
    expect(porcelain).toContain("prunable");
  }, 30000);
});
