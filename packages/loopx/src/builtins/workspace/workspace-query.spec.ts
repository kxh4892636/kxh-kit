import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import workspaceCommand from "./index";
import { WORKSPACE_CONFIG_FILE, WORKSPACE_LOCAL_FILE } from "./workspace-config";

const execFileAsync = promisify(execFile);
const gitAvailable = await execFileAsync("git", ["--version"]).then(
  (): boolean => true,
  (): boolean => false,
);
const temporaryDirectories: string[] = [];
const homeVariables = ["HOME", "USERPROFILE"] as const;
const savedHome = new Map<string, string | undefined>();

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "loopx-workspace-query-"));
  temporaryDirectories.push(directory);
  return directory;
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

const useFakeHome = async (): Promise<string> => {
  const home = await createDirectory();
  for (const variable of homeVariables) {
    if (!savedHome.has(variable)) savedHome.set(variable, process.env[variable]);
    process.env[variable] = home;
  }
  return home;
};

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

const advanceRemote = async (remote: Remote): Promise<void> => {
  await writeFile(path.join(remote.seed, "README.md"), "remote advance\n", "utf8");
  await git(["-C", remote.seed, "add", "README.md"]);
  await gitCommit(remote.seed, "advance remote");
  await git(["-C", remote.seed, "push", "-q", remote.bare, "main"]);
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

describe("workspace list", (): void => {
  test("merges configured repositories with clone paths and marks orphaned local records", async (): Promise<void> => {
    const root = await createDirectory();
    const config = `repositories:
  - name: wiki
    url: https://example.com/wiki.git
    path: apps/wiki
    branch: main
  - name: docs
    url: https://example.com/docs.git
    path: apps/docs
    branch: dev
`;
    const local = `repositories:
  - name: wiki
    clone_path: C:/workspaces/wiki
  - name: retired
    clone_path: C:/workspaces/retired
`;
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), config, "utf8");
    await writeFile(path.join(root, WORKSPACE_LOCAL_FILE), local, "utf8");

    const result = await invoke(root, ["list"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      root,
      repositories: [
        {
          name: "wiki",
          url: "https://example.com/wiki.git",
          path: "apps/wiki",
          branch: "main",
          clonePath: "C:/workspaces/wiki",
        },
        {
          name: "docs",
          url: "https://example.com/docs.git",
          path: "apps/docs",
          branch: "dev",
        },
      ],
      orphans: [{ name: "retired", clonePath: "C:/workspaces/retired", orphan: true }],
    });
    expect(await readFile(path.join(root, WORKSPACE_CONFIG_FILE), "utf8")).toBe(config);
    expect(await readFile(path.join(root, WORKSPACE_LOCAL_FILE), "utf8")).toBe(local);
  });
});

describe.skipIf(!gitAvailable)("workspace status (git integration)", (): void => {
  test("reports unmaterialized and registered worktrees without fetching or writing", async (): Promise<void> => {
    const fixture = await createDirectory();
    const remote = await createRemote(fixture, "wiki");
    const home = await useFakeHome();
    const root = await createDirectory();
    const config = `repositories:
  - name: wiki
    url: ${remote.url}
    path: apps/wiki
    branch: main
  - name: docs
    url: https://example.com/docs.git
    path: apps/docs
    branch: main
`;
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), config, "utf8");
    expect((await invoke(root, ["pull", "--name", "wiki"])).code).toBe(0);
    const clonePath = path.join(home, "workspaces", "wiki");
    const mainPath = path.join(root, "apps/wiki");
    const localPath = path.join(root, "apps/wiki-local");
    const dirtyPath = path.join(root, "apps/wiki-dirty");
    await advanceRemote(remote);
    await git(["-C", clonePath, "fetch", "-q", "origin", "main"]);
    await git(["-C", clonePath, "worktree", "add", "-q", "-b", "feature/local", localPath, "main"]);
    await writeFile(path.join(localPath, "LOCAL.md"), "local commit\n", "utf8");
    await git(["-C", localPath, "add", "LOCAL.md"]);
    await gitCommit(localPath, "local commit");
    await git(["-C", clonePath, "worktree", "add", "-q", "-b", "feature/dirty", dirtyPath, "main"]);
    await writeFile(path.join(dirtyPath, "DIRTY.md"), "untracked\n", "utf8");
    const localBefore = await readFile(path.join(root, WORKSPACE_LOCAL_FILE), "utf8");
    const remoteHeadBefore = (await git(["-C", clonePath, "rev-parse", "origin/main"])).trim();

    const result = await invoke(root, ["status"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ success: true, root });
    const wiki = output.repositories.find(
      (repository: { readonly name: string }): boolean => repository.name === "wiki",
    );
    const docs = output.repositories.find(
      (repository: { readonly name: string }): boolean => repository.name === "docs",
    );
    expect(docs).toEqual({
      name: "docs",
      clonePath: path.join(home, "workspaces", "docs"),
      cloneExists: false,
      worktrees: [],
    });
    expect(wiki).toMatchObject({ name: "wiki", clonePath, cloneExists: true });
    expect(wiki.worktrees).toHaveLength(4);
    const byPath = new Map(
      wiki.worktrees.map(
        (worktree: { readonly path: string }): readonly [string, Record<string, unknown>] => [
          worktree.path,
          worktree,
        ],
      ),
    );
    expect(byPath.get(mainPath)).toMatchObject({
      branch: expect.stringMatching(/^worktree\/wiki-\d{14}$/u),
      dirty: false,
      canFastForward: true,
      mainWorktree: true,
    });
    expect(byPath.get(localPath)).toMatchObject({
      branch: "feature/local",
      dirty: false,
      canFastForward: false,
      mainWorktree: false,
    });
    expect(byPath.get(dirtyPath)).toMatchObject({
      branch: "feature/dirty",
      dirty: true,
      canFastForward: true,
      mainWorktree: false,
    });
    expect(byPath.get(clonePath)).toMatchObject({
      branch: "main",
      dirty: false,
      canFastForward: true,
      mainWorktree: false,
    });
    expect(await readFile(path.join(root, WORKSPACE_CONFIG_FILE), "utf8")).toBe(config);
    expect(await readFile(path.join(root, WORKSPACE_LOCAL_FILE), "utf8")).toBe(localBefore);
    expect((await git(["-C", clonePath, "rev-parse", "origin/main"])).trim()).toBe(
      remoteHeadBefore,
    );
  }, 30000);
});
