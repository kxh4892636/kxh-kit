import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import workspaceCommand from "./index";
import { verifyWorkspaceContract } from "./testing/workspace-contracts";
import { WORKSPACE_CONFIG_FILE } from "./workspace-config";

const execFileAsync = promisify(execFile);
const gitAvailable = await execFileAsync("git", ["--version"]).then(
  (): boolean => true,
  (): boolean => false,
);
const temporaryDirectories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "nf-workspace-repository-"));
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
    "user.email=nf@test",
    "-c",
    "user.name=Nano Flow",
    "commit",
    "-q",
    "-m",
    message,
  ]);
};

interface RemoteFixture {
  readonly bare: string;
  readonly seed: string;
  readonly url: string;
}

const createRemote = async (parent: string, name: string): Promise<RemoteFixture> => {
  const seed = path.join(parent, `${name}-seed`);
  await git(["init", "-q", "-b", "main", seed]);
  await writeFile(path.join(seed, "README.md"), `# ${name}\n`, "utf8");
  await git(["-C", seed, "add", "README.md"]);
  await gitCommit(seed, `initial ${name}`);
  const bare = path.join(parent, `${name}.git`);
  await git(["clone", "-q", "--bare", seed, bare]);
  return { bare, seed, url: pathToFileURL(bare).href };
};

const advanceRemote = async (remote: RemoteFixture, content: string): Promise<void> => {
  await writeFile(path.join(remote.seed, "README.md"), content, "utf8");
  await git(["-C", remote.seed, "add", "README.md"]);
  await gitCommit(remote.seed, "advance remote");
  await git(["-C", remote.seed, "push", "-q", remote.bare, "main"]);
};

interface WorkspaceEntry {
  readonly name: string;
  readonly path?: string | undefined;
  readonly url: string;
}

const createWorkspace = async (entries: readonly WorkspaceEntry[]): Promise<string> => {
  const root = await createDirectory();
  const records = entries.flatMap((entry: WorkspaceEntry): readonly string[] => [
    `  - name: ${entry.name}`,
    `    url: ${entry.url}`,
    `    path: ${entry.path ?? `repositories/${entry.name}`}`,
    "    branch: main",
  ]);
  await writeFile(
    path.join(root, WORKSPACE_CONFIG_FILE),
    `repositories:\n${records.join("\n")}\n`,
    "utf8",
  );
  return root;
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
  const result = { code, stderr, stdout };
  verifyWorkspaceContract("repository", { argv, ...result }, cwd);
  return result;
};

const isMissing = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return false;
  } catch {
    return true;
  }
};

describe.skipIf(!gitAvailable)("workspace repository (git integration)", (): void => {
  test("status handles detached clones and repositories without a remote tracking ref", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    expect((await invoke(root, ["repository", "clone"])).code).toBe(0);
    const repositoryPath = path.join(root, "repositories/wiki");
    await git(["-C", repositoryPath, "checkout", "--detach", "-q"]);
    await git(["-C", repositoryPath, "update-ref", "-d", "refs/remotes/origin/main"]);

    const result = await invoke(root, ["repository", "status"]);
    expect(JSON.parse(result.stdout).repositories[0]).toMatchObject({
      branch: "",
      ahead: 0,
      behind: 0,
      status: "materialized",
    });
    expect(JSON.parse(result.stdout).repositories[0].worktrees[0]).not.toHaveProperty("branch");
  }, 30000);

  test("pull reports an up-to-date primary clone and a wrong primary branch", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    expect((await invoke(root, ["repository", "clone"])).code).toBe(0);
    const current = await invoke(root, ["repository", "pull"]);
    expect(JSON.parse(current.stdout).repositories[0].status).toBe("pulled");

    const repositoryPath = path.join(root, "repositories/wiki");
    await git(["-C", repositoryPath, "checkout", "-q", "-b", "other"]);
    const wrongBranch = await invoke(root, ["repository", "pull"]);
    expect(JSON.parse(wrongBranch.stdout).repositories[0]).toMatchObject({
      status: "skipped",
      reason: expect.stringContaining("expected 'main'"),
    });
  }, 30000);

  test("remove rejects a configured repository that is not materialized", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const result = await invoke(root, ["repository", "remove", "--name", "wiki", "--yes"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error).toContain("not materialized");
  }, 30000);
  test("clone materializes a shallow primary clone at config path only", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const repositoryPath = path.join(root, "repositories/wiki");

    const result = await invoke(root, ["repository", "clone"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "clone-repositories",
      repositories: [{ name: "wiki", path: repositoryPath, status: "cloned" }],
    });
    expect((await git(["-C", repositoryPath, "rev-parse", "--is-shallow-repository"])).trim()).toBe(
      "true",
    );
    expect(await git(["-C", repositoryPath, "worktree", "list", "--porcelain"])).not.toContain(
      path.join(root, "apps/wiki"),
    );
  }, 30000);

  test("clone isolates an occupied target and continues in configuration order", async (): Promise<void> => {
    const directory = await createDirectory();
    const wiki = await createRemote(directory, "wiki");
    const docs = await createRemote(directory, "docs");
    const root = await createWorkspace([
      { name: "wiki", url: wiki.url },
      { name: "docs", url: docs.url },
    ]);
    await mkdir(path.join(root, "repositories/wiki"), { recursive: true });

    const result = await invoke(root, ["repository", "clone"]);
    const output = JSON.parse(result.stderr);

    expect(result.code).toBe(1);
    expect(output.success).toBe(false);
    expect(output.repositories.map((entry: { name: string }): string => entry.name)).toEqual([
      "wiki",
      "docs",
    ]);
    expect(output.repositories[0].status).toBe("failed");
    expect(output.repositories[1].status).toBe("cloned");
    expect(await isMissing(path.join(root, "repositories/docs/.git"))).toBe(false);
  }, 30000);

  test("clone dry-run and pull missing never proxy each other", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const repositoryPath = path.join(root, "repositories/wiki");

    const preview = await invoke(root, ["repository", "clone", "--dry-run"]);
    const pulled = await invoke(root, ["repository", "pull"]);

    expect(JSON.parse(preview.stdout).preview.repositories[0].status).toBe("cloned");
    expect(JSON.parse(pulled.stdout).repositories[0]).toMatchObject({
      status: "skipped",
      reason: expect.stringContaining("repository clone"),
    });
    expect(await isMissing(repositoryPath)).toBe(true);
  }, 30000);
});

describe.skipIf(!gitAvailable)("workspace repository (git integration)", (): void => {
  test("status reads local state without fetching", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["repository", "clone"]);
    const repositoryPath = path.join(root, "repositories/wiki");
    const before = (await git(["-C", repositoryPath, "rev-parse", "origin/main"])).trim();
    await advanceRemote(remote, "remote v2\n");

    const result = await invoke(root, ["repository", "status", "--name", "wiki"]);
    const output = JSON.parse(result.stdout);
    const repository = output.repositories[0];

    expect(result.code).toBe(0);
    expect(output).toMatchObject({ success: true, action: "status-repositories" });
    expect(repository).toMatchObject({
      name: "wiki",
      path: repositoryPath,
      baseBranch: "main",
      branch: "main",
      dirty: false,
      ahead: 0,
      behind: 0,
      status: "materialized",
    });
    expect(repository.worktrees).toHaveLength(1);
    expect((await git(["-C", repositoryPath, "rev-parse", "origin/main"])).trim()).toBe(before);
  }, 30000);

  test("status lists all configured repositories or only the selected name", async (): Promise<void> => {
    const directory = await createDirectory();
    const wiki = await createRemote(directory, "wiki");
    const docs = await createRemote(directory, "docs");
    const root = await createWorkspace([
      { name: "wiki", url: wiki.url },
      { name: "docs", url: docs.url },
    ]);
    await invoke(root, ["repository", "clone", "--name", "wiki"]);

    const allResult = await invoke(root, ["repository", "status"]);
    const selectedResult = await invoke(root, ["repository", "status", "--name", "docs"]);
    const all = JSON.parse(allResult.stdout);
    const selected = JSON.parse(selectedResult.stdout);

    expect(allResult.code).toBe(0);
    expect(selectedResult.code).toBe(0);
    expect(all.repositories.map((repository: { name: string }): string => repository.name)).toEqual(
      ["wiki", "docs"],
    );
    expect(all.repositories[0].status).toBe("materialized");
    expect(all.repositories[1]).toEqual({
      name: "docs",
      path: path.join(root, "repositories/docs"),
      baseBranch: "main",
      status: "not-materialized",
      worktrees: [],
    });
    expect(selected).toEqual({
      success: true,
      action: "status-repositories",
      repositories: [all.repositories[1]],
    });
  }, 30000);

  test("status reports dirty and diverged local state after an explicit pull fetch", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["repository", "clone"]);
    const repositoryPath = path.join(root, "repositories/wiki");
    await writeFile(path.join(repositoryPath, "local.txt"), "local\n", "utf8");
    await git(["-C", repositoryPath, "add", "local.txt"]);
    await gitCommit(repositoryPath, "local commit");
    await advanceRemote(remote, "remote v2\n");
    await invoke(root, ["repository", "pull"]);
    await writeFile(path.join(repositoryPath, "dirty.txt"), "dirty\n", "utf8");

    const result = await invoke(root, ["repository", "status"]);

    expect(JSON.parse(result.stdout).repositories[0]).toMatchObject({
      status: "materialized",
      dirty: true,
      ahead: 1,
      behind: 1,
    });
  }, 30000);

  test("pull fast-forwards only the primary clone and leaves an extra worktree unchanged", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["repository", "clone"]);
    const repositoryPath = path.join(root, "repositories/wiki");
    const worktreePath = path.join(root, "worktrees/wiki");
    await git(["-C", repositoryPath, "worktree", "add", "-q", "-b", "feature/wiki", worktreePath]);
    const worktreeHead = (await git(["-C", worktreePath, "rev-parse", "HEAD"])).trim();
    await advanceRemote(remote, "remote v2\n");

    const result = await invoke(root, ["repository", "pull"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "pull-repositories",
      repositories: [
        {
          name: "wiki",
          path: repositoryPath,
          status: "pulled",
        },
      ],
    });
    expect(await readFile(path.join(repositoryPath, "README.md"), "utf8")).toMatch(/remote v2/u);
    expect((await git(["-C", worktreePath, "rev-parse", "HEAD"])).trim()).toBe(worktreeHead);
    expect((await git(["-C", repositoryPath, "rev-parse", "--is-shallow-repository"])).trim()).toBe(
      "true",
    );
  }, 30000);
});

describe.skipIf(!gitAvailable)("workspace repository (git integration)", (): void => {
  test("pull skips dirty and local-ahead primary clones", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const dirtyRoot = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const aheadRoot = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(dirtyRoot, ["repository", "clone"]);
    await invoke(aheadRoot, ["repository", "clone"]);
    const dirtyPath = path.join(dirtyRoot, "repositories/wiki");
    const aheadPath = path.join(aheadRoot, "repositories/wiki");
    await writeFile(path.join(dirtyPath, "dirty.txt"), "dirty\n", "utf8");
    await writeFile(path.join(aheadPath, "local.txt"), "local\n", "utf8");
    await git(["-C", aheadPath, "add", "local.txt"]);
    await gitCommit(aheadPath, "local commit");

    const dirty = await invoke(dirtyRoot, ["repository", "pull"]);
    const ahead = await invoke(aheadRoot, ["repository", "pull"]);

    expect(JSON.parse(dirty.stdout).repositories[0].reason).toContain("uncommitted");
    expect(JSON.parse(ahead.stdout).repositories[0].reason).toContain("local commits");
  }, 30000);

  test("pull isolates an invalid clone and continues in configuration order", async (): Promise<void> => {
    const directory = await createDirectory();
    const wiki = await createRemote(directory, "wiki");
    const docs = await createRemote(directory, "docs");
    const root = await createWorkspace([
      { name: "wiki", url: wiki.url },
      { name: "docs", url: docs.url },
    ]);
    await mkdir(path.join(root, "repositories/wiki"), { recursive: true });
    await invoke(root, ["repository", "clone", "--name", "docs"]);
    await advanceRemote(docs, "docs v2\n");

    const result = await invoke(root, ["repository", "pull"]);
    const output = JSON.parse(result.stderr);

    expect(result.code).toBe(1);
    expect(output.success).toBe(false);
    expect(output.repositories.map((entry: { name: string }): string => entry.name)).toEqual([
      "wiki",
      "docs",
    ]);
    expect(output.repositories[0].status).toBe("failed");
    expect(output.repositories[1].status).toBe("pulled");
  }, 30000);

  test("clone and pull isolate unknown names while processing valid selections", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const cloneRoot = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const cloneResult = await invoke(cloneRoot, [
      "repository",
      "clone",
      "--name",
      "ghost",
      "--name",
      "wiki",
    ]);
    expect(cloneResult.code).toBe(1);
    expect(
      JSON.parse(cloneResult.stderr).repositories.map(
        (entry: { name: string }): string => entry.name,
      ),
    ).toEqual(["ghost", "wiki"]);
    expect(await isMissing(path.join(cloneRoot, "repositories/wiki/.git"))).toBe(false);

    await advanceRemote(remote, "wiki v2\n");
    const pullResult = await invoke(cloneRoot, [
      "repository",
      "pull",
      "--name",
      "ghost",
      "--name",
      "wiki",
    ]);
    expect(pullResult.code).toBe(1);
    expect(JSON.parse(pullResult.stderr).repositories[1].status).toBe("pulled");
  }, 30000);

  test("remove requires confirmation and refuses additional worktrees", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["repository", "clone"]);
    const repositoryPath = path.join(root, "repositories/wiki");

    const unconfirmed = await invoke(root, ["repository", "remove", "--name", "wiki"]);
    expect(unconfirmed.code).toBe(1);
    const worktreePath = path.join(root, "worktrees/wiki");
    await git(["-C", repositoryPath, "worktree", "add", "-q", "-b", "feature/wiki", worktreePath]);
    const blocked = await invoke(root, ["repository", "remove", "--name", "wiki", "--yes"]);
    expect(blocked.code).toBe(1);
    expect(JSON.parse(blocked.stderr).error).toContain("additional worktrees");
    expect(await isMissing(repositoryPath)).toBe(false);
  }, 30000);
});

describe.skipIf(!gitAvailable)("workspace repository (git integration)", (): void => {
  test("remove protects dirty and local-only history unless forced", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["repository", "clone"]);
    const repositoryPath = path.join(root, "repositories/wiki");
    await writeFile(path.join(repositoryPath, "local.txt"), "local\n", "utf8");
    await git(["-C", repositoryPath, "add", "local.txt"]);
    await gitCommit(repositoryPath, "local only");
    await writeFile(path.join(repositoryPath, "dirty.txt"), "dirty\n", "utf8");

    const blocked = await invoke(root, ["repository", "remove", "--name", "wiki", "--yes"]);
    expect(blocked.code).toBe(1);
    expect(JSON.parse(blocked.stderr)).toMatchObject({
      dirty: true,
      localOnlyHistory: true,
    });
    const removed = await invoke(root, [
      "repository",
      "remove",
      "--name",
      "wiki",
      "--yes",
      "--force",
    ]);
    expect(removed.code).toBe(0);
    expect(JSON.parse(removed.stdout)).toEqual({
      success: true,
      action: "remove-repository",
      name: "wiki",
      path: repositoryPath,
      force: true,
    });
    expect(await isMissing(repositoryPath)).toBe(true);
    expect(await readFile(path.join(root, WORKSPACE_CONFIG_FILE), "utf8")).toContain("name: wiki");
  }, 30000);

  test("remove deletes a clean clone without touching config", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["repository", "clone"]);
    const repositoryPath = path.join(root, "repositories/wiki");

    const result = await invoke(root, ["repository", "remove", "--name", "wiki", "--yes"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "remove-repository",
      name: "wiki",
      path: repositoryPath,
      force: false,
    });
    expect(await isMissing(repositoryPath)).toBe(true);
    expect(await readFile(path.join(root, WORKSPACE_CONFIG_FILE), "utf8")).toContain("name: wiki");
  }, 30000);

  test("remove protects local history retained only by a tag", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["repository", "clone"]);
    const repositoryPath = path.join(root, "repositories/wiki");
    await writeFile(path.join(repositoryPath, "tagged.txt"), "tagged\n", "utf8");
    await git(["-C", repositoryPath, "add", "tagged.txt"]);
    await gitCommit(repositoryPath, "tagged local commit");
    await git(["-C", repositoryPath, "tag", "local-only"]);
    await git(["-C", repositoryPath, "reset", "--hard", "-q", "origin/main"]);

    const result = await invoke(root, ["repository", "remove", "--name", "wiki", "--yes"]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ localOnlyHistory: true, dirty: false });
    expect(await isMissing(repositoryPath)).toBe(false);
  }, 30000);

  test("clone refuses a parent link that resolves outside the workspace", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const outside = await createDirectory();
    await symlink(
      outside,
      path.join(root, "repositories"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const result = await invoke(root, ["repository", "clone"]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).repositories[0].reason).toContain("outside the workspace");
    expect(await isMissing(path.join(outside, "wiki"))).toBe(true);
  }, 30000);

  test("clone failure never exposes URL credentials", async (): Promise<void> => {
    const secret = "nf-secret-token";
    const root = await createWorkspace([
      { name: "wiki", url: `https://user:${secret}@127.0.0.1:1/wiki.git` },
    ]);

    const result = await invoke(root, ["repository", "clone"]);

    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain(secret);
  }, 30000);

  test("old flat pull and status commands are removed", async (): Promise<void> => {
    const root = await createWorkspace([]);
    expect((await invoke(root, ["pull"])).code).toBe(2);
    expect((await invoke(root, ["status"])).code).toBe(2);
  });
});
