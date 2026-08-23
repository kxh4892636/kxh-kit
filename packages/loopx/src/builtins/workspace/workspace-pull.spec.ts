import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import workspaceCommand from "./index";
import {
  loadWorkspaceConfig,
  WORKSPACE_CONFIG_FILE,
  WORKSPACE_LOCAL_FILE,
} from "./workspace-config";

const execFileAsync = promisify(execFile);

const gitAvailable = await execFileAsync("git", ["--version"]).then(
  (): boolean => true,
  (): boolean => false,
);

const temporaryDirectories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "loopx-workspace-pull-"));
  temporaryDirectories.push(directory);
  return directory;
};

const homeVariables = ["HOME", "USERPROFILE"] as const;
const savedHome = new Map<string, string | undefined>();

const useFakeHome = async (): Promise<string> => {
  const home = await createDirectory();
  for (const variable of homeVariables) {
    if (!savedHome.has(variable)) savedHome.set(variable, process.env[variable]);
    process.env[variable] = home;
  }
  return home;
};

afterEach(async (): Promise<void> => {
  for (const [variable, value] of savedHome) {
    if (value === undefined) delete process.env[variable];
    else process.env[variable] = value;
  }
  savedHome.clear();
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

interface Remote {
  readonly seed: string;
  readonly bare: string;
  readonly url: string;
}

const createRemote = async (parent: string, name: string): Promise<Remote> => {
  const seed = path.join(parent, `${name}-seed`);
  await git(["init", "-q", "-b", "main", seed]);
  await writeFile(path.join(seed, "README.md"), `# ${name}\n`, "utf8");
  await git(["-C", seed, "add", "README.md"]);
  await gitCommit(seed, `initial ${name}`);
  const bare = path.join(parent, `${name}.git`);
  await git(["clone", "-q", "--bare", seed, bare]);
  return { seed, bare, url: pathToFileURL(bare).href };
};

const advanceRemote = async (remote: Remote, content: string): Promise<void> => {
  await writeFile(path.join(remote.seed, "README.md"), content, "utf8");
  await git(["-C", remote.seed, "add", "README.md"]);
  await gitCommit(remote.seed, "advance");
  await git(["-C", remote.seed, "push", "-q", remote.bare, "main"]);
};

interface WorkspaceEntry {
  readonly name: string;
  readonly url: string;
  readonly path?: string;
  readonly branch?: string;
}

const createWorkspace = async (entries: readonly WorkspaceEntry[]): Promise<string> => {
  const root = await createDirectory();
  const lines = entries.flatMap((entry: WorkspaceEntry): string[] => [
    `  - name: ${entry.name}`,
    `    url: ${entry.url}`,
    `    path: ${entry.path ?? `apps/${entry.name}`}`,
    `    branch: ${entry.branch ?? "main"}`,
  ]);
  await writeFile(
    path.join(root, WORKSPACE_CONFIG_FILE),
    `repositories:\n${lines.join("\n")}\n`,
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
    stdout: {
      write: (chunk: string): void => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk: string): void => {
        stderr += chunk;
      },
    },
  };
  const code = await runCli(request, [(): BuiltinCommand => workspaceCommand]);
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

// Windows 上 git 可能按系统配置以 CRLF 检出文件。
const readText = async (file: string): Promise<string> =>
  (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");

describe.skipIf(!gitAvailable)("workspace pull (git integration)", (): void => {
  test("materializes an empty workspace: shallow clone, worktree with a timestamped branch, clone_path record", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const home = await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const clonePath = path.join(home, "workspaces", "wiki");
    const worktreePath = path.join(root, "apps/wiki");

    const result = await invoke(root, ["pull"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.repositories).toEqual([
      {
        name: "wiki",
        actions: [
          { action: "clone", url: remote.url, clonePath },
          {
            action: "create-worktree",
            path: worktreePath,
            branch: expect.stringMatching(/^worktree\/wiki-\d{14}$/u),
            base: "main",
          },
          { action: "fetch", branch: "main" },
          { action: "record-clone-path", clonePath },
        ],
        status: "pulled",
      },
    ]);
    expect((await git(["-C", clonePath, "rev-parse", "--is-inside-work-tree"])).trim()).toBe(
      "true",
    );
    expect((await git(["-C", worktreePath, "branch", "--show-current"])).trim()).toMatch(
      /^worktree\/wiki-\d{14}$/u,
    );
    expect(await readText(path.join(worktreePath, "README.md"))).toBe("# wiki\n");
    const local = await readFile(path.join(root, WORKSPACE_LOCAL_FILE), "utf8");
    expect(local).toContain("clone_path");
    const loaded = await loadWorkspaceConfig(root);
    expect(loaded.repositories[0]?.clonePath).toBe(clonePath);
  }, 30000);

  test("creates the worktree at --path with --worktree-branch for a single --name", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const worktreePath = path.join(root, "custom/wiki");

    const result = await invoke(root, [
      "pull",
      "--name",
      "wiki",
      "--path",
      "custom/wiki",
      "--worktree-branch",
      "feature/docs",
    ]);

    expect(result.code).toBe(0);
    const entry = JSON.parse(result.stdout).repositories[0];
    expect(entry.status).toBe("pulled");
    expect(entry.actions).toContainEqual({
      action: "create-worktree",
      path: worktreePath,
      branch: "feature/docs",
      base: "main",
    });
    expect((await git(["-C", worktreePath, "branch", "--show-current"])).trim()).toBe(
      "feature/docs",
    );
  }, 30000);

  test("fast-forwards the worktree when the remote base branch advances", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["pull"]);
    await advanceRemote(remote, "# wiki v2\n");

    const result = await invoke(root, ["pull"]);

    expect(result.code).toBe(0);
    const entry = JSON.parse(result.stdout).repositories[0];
    expect(entry.status).toBe("pulled");
    expect(entry.actions).toEqual([
      { action: "fetch", branch: "main" },
      { action: "fast-forward", branch: "main" },
    ]);
    expect(await readText(path.join(root, "apps/wiki/README.md"))).toBe("# wiki v2\n");
  }, 30000);

  test("reports skipped and leaves the worktree untouched when it has local commits", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["pull"]);
    const worktreePath = path.join(root, "apps/wiki");
    await writeFile(path.join(worktreePath, "README.md"), "local edit\n", "utf8");
    await git(["-C", worktreePath, "add", "README.md"]);
    await gitCommit(worktreePath, "local commit");
    const localHead = (await git(["-C", worktreePath, "rev-parse", "HEAD"])).trim();
    await advanceRemote(remote, "remote edit\n");

    const result = await invoke(root, ["pull"]);

    expect(result.code).toBe(0);
    const entry = JSON.parse(result.stdout).repositories[0];
    expect(entry.status).toBe("skipped");
    expect(entry.reason).toContain("fast-forward");
    expect(entry.actions).toEqual([{ action: "fetch", branch: "main" }]);
    expect((await git(["-C", worktreePath, "rev-parse", "HEAD"])).trim()).toBe(localHead);
    expect(await readFile(path.join(worktreePath, "README.md"), "utf8")).toBe("local edit\n");
  }, 30000);

  test("reports skipped when the worktree only has local commits", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["pull"]);
    const worktreePath = path.join(root, "apps/wiki");
    await writeFile(path.join(worktreePath, "README.md"), "local edit\n", "utf8");
    await git(["-C", worktreePath, "add", "README.md"]);
    await gitCommit(worktreePath, "local commit");
    const localHead = (await git(["-C", worktreePath, "rev-parse", "HEAD"])).trim();

    const result = await invoke(root, ["pull"]);

    expect(result.code).toBe(0);
    const entry = JSON.parse(result.stdout).repositories[0];
    expect(entry.status).toBe("skipped");
    expect(entry.reason).toContain("local commits");
    expect(entry.actions).toEqual([{ action: "fetch", branch: "main" }]);
    expect((await git(["-C", worktreePath, "rev-parse", "HEAD"])).trim()).toBe(localHead);
  }, 30000);

  test("reports skipped and does not fetch when the worktree has uncommitted changes", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["pull"]);
    const worktreePath = path.join(root, "apps/wiki");
    await writeFile(path.join(worktreePath, "README.md"), "dirty\n", "utf8");
    await advanceRemote(remote, "remote edit\n");

    const result = await invoke(root, ["pull"]);

    expect(result.code).toBe(0);
    const entry = JSON.parse(result.stdout).repositories[0];
    expect(entry.status).toBe("skipped");
    expect(entry.reason).toContain("uncommitted");
    expect(entry.actions).toEqual([]);
    expect(await readFile(path.join(worktreePath, "README.md"), "utf8")).toBe("dirty\n");
  }, 30000);

  test("reports skipped when the worktree has an untracked file", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);
    await invoke(root, ["pull"]);
    const worktreePath = path.join(root, "apps/wiki");
    await writeFile(path.join(worktreePath, "untracked.txt"), "dirty\n", "utf8");

    const result = await invoke(root, ["pull"]);

    expect(result.code).toBe(0);
    const entry = JSON.parse(result.stdout).repositories[0];
    expect(entry.status).toBe("skipped");
    expect(entry.reason).toContain("uncommitted");
    expect(entry.actions).toEqual([]);
    expect(await readFile(path.join(worktreePath, "untracked.txt"), "utf8")).toBe("dirty\n");
  }, 30000);

  test("rejects worktree paths outside the workspace root", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    await useFakeHome();
    const relativeRoot = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const absoluteRoot = await createWorkspace([{ name: "wiki", url: remote.url }]);
    const requests = [
      {
        root: relativeRoot,
        worktreePath: `../${path.basename(directory)}/relative-outside`,
      },
      { root: absoluteRoot, worktreePath: path.join(directory, "absolute-outside") },
    ];

    for (const request of requests) {
      const result = await invoke(request.root, [
        "pull",
        "--name",
        "wiki",
        "--path",
        request.worktreePath,
      ]);
      expect(result.code).toBe(2);
      expect(JSON.parse(result.stderr).error).toContain("relative to the workspace root");
      expect(result.stdout).toBe("");
    }
  }, 30000);

  test("pulls only the repositories selected by --name", async (): Promise<void> => {
    const directory = await createDirectory();
    const wiki = await createRemote(directory, "wiki");
    const docs = await createRemote(directory, "docs");
    const home = await useFakeHome();
    const root = await createWorkspace([
      { name: "wiki", url: wiki.url },
      { name: "docs", url: docs.url },
    ]);

    const result = await invoke(root, ["pull", "--name", "wiki"]);

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.repositories).toHaveLength(1);
    expect(output.repositories[0].name).toBe("wiki");
    expect(await isMissing(path.join(home, "workspaces", "docs"))).toBe(true);
    expect(await isMissing(path.join(root, "apps/docs"))).toBe(true);
  }, 30000);

  test("reports failed for an occupied worktree path and continues with the other repositories", async (): Promise<void> => {
    const directory = await createDirectory();
    const wiki = await createRemote(directory, "wiki");
    const docs = await createRemote(directory, "docs");
    await useFakeHome();
    const root = await createWorkspace([
      { name: "wiki", url: wiki.url },
      { name: "docs", url: docs.url },
    ]);
    await mkdir(path.join(root, "apps/wiki"), { recursive: true });
    await writeFile(path.join(root, "apps/wiki/stray.txt"), "not a worktree\n", "utf8");

    const result = await invoke(root, ["pull"]);

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    const [wikiEntry, docsEntry] = output.repositories;
    expect(wikiEntry.status).toBe("failed");
    expect(wikiEntry.reason).toContain("apps/wiki");
    expect(docsEntry.status).toBe("pulled");
    expect(await readFile(path.join(root, "apps/wiki/stray.txt"), "utf8")).toBe("not a worktree\n");
  }, 30000);

  test("--dry-run reports the plan without any file system or git side effect", async (): Promise<void> => {
    const directory = await createDirectory();
    const remote = await createRemote(directory, "wiki");
    const home = await useFakeHome();
    const root = await createWorkspace([{ name: "wiki", url: remote.url }]);

    const result = await invoke(root, ["pull", "--dry-run"]);

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.dryRun).toBe(true);
    expect(output.preview.action).toBe("pull");
    expect(output.preview.repositories[0].status).toBe("pulled");
    expect(output.preview.repositories[0].actions).toContainEqual({
      action: "clone",
      url: remote.url,
      clonePath: path.join(home, "workspaces", "wiki"),
    });
    expect(await isMissing(path.join(home, "workspaces"))).toBe(true);
    expect(await isMissing(path.join(root, "apps/wiki"))).toBe(true);
    expect(await isMissing(path.join(root, WORKSPACE_LOCAL_FILE))).toBe(true);
  }, 30000);
});
