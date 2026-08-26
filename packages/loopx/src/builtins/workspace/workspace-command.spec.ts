import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import workspaceCommand from "./index";
import { WORKSPACE_CONFIG_FILE } from "./workspace-config";

const temporaryDirectories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "loopx-workspace-init-"));
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

test("workspace exposes only the three domain resource groups", (): void => {
  expect(workspaceCommand.children.map((child): string => child.name)).toEqual([
    "config",
    "repository",
    "worktree",
  ]);
  expect(
    workspaceCommand.children.map((child): readonly [string, readonly string[]] => [
      child.name,
      child.kind === "group" ? child.children.map((entry): string => entry.name) : [],
    ]),
  ).toEqual([
    ["config", ["init", "add", "list", "update", "remove"]],
    ["repository", ["clone", "status", "pull", "remove"]],
    ["worktree", ["add", "list", "switch", "remove", "prune"]],
  ]);
});

describe("workspace config init", (): void => {
  test("creates a workspace.yaml with empty repositories", async (): Promise<void> => {
    const cwd = await createDirectory();
    const result = await invoke(cwd, ["config", "init"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      root: cwd,
      config: path.join(cwd, WORKSPACE_CONFIG_FILE),
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).toContain("repositories: []");
  });

  test("fails with a JSON error when workspace.yaml already exists", async (): Promise<void> => {
    const cwd = await createDirectory();
    await invoke(cwd, ["config", "init"]);
    const result = await invoke(cwd, ["config", "init"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining(WORKSPACE_CONFIG_FILE),
    });
  });

  test("--dry-run reports the plan without writing a file", async (): Promise<void> => {
    const cwd = await createDirectory();
    const result = await invoke(cwd, ["config", "init", "--dry-run"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      dryRun: true,
      preview: { action: "init", config: path.join(cwd, WORKSPACE_CONFIG_FILE) },
    });
    await expect(readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8")).rejects.toThrow();
  });
});

const ADD_WIKI = [
  "config",
  "add",
  "--name",
  "wiki",
  "--url",
  "https://github.com/kxh4892636/wiki.git",
  "--path",
  "apps/wiki",
  "--branch",
  "main",
] as const;

const initWorkspace = async (): Promise<string> => {
  const cwd = await createDirectory();
  await invoke(cwd, ["config", "init"]);
  return cwd;
};

describe("workspace config add and update", (): void => {
  test("appends a new repository entry", async (): Promise<void> => {
    const cwd = await initWorkspace();
    const result = await invoke(cwd, ADD_WIKI);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "add",
      change: "added",
      repository: {
        name: "wiki",
        url: "https://github.com/kxh4892636/wiki.git",
        path: "apps/wiki",
        branch: "main",
      },
      config: path.join(cwd, WORKSPACE_CONFIG_FILE),
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).toContain("- name: wiki");
    expect(document).toContain("branch: main");
  });

  test("rejects add when the name already exists", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, [
      "config",
      "add",
      "--name",
      "wiki",
      "--url",
      "git@github.com:kxh4892636/wiki.git",
      "--path",
      "packages/wiki",
      "--branch",
      "dev",
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining("wiki"),
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document.match(/- name: wiki/gu)).toHaveLength(1);
    expect(document).toContain("apps/wiki");
    expect(document).toContain("branch: main");
  });

  test("updates selected fields for an existing entry", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, [
      "config",
      "update",
      "--name",
      "wiki",
      "--path",
      "packages/wiki",
      "--branch",
      "dev",
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "update",
      repository: {
        name: "wiki",
        url: "https://github.com/kxh4892636/wiki.git",
        path: "packages/wiki",
        branch: "dev",
      },
      config: path.join(cwd, WORKSPACE_CONFIG_FILE),
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).toContain("packages/wiki");
    expect(document).toContain("branch: dev");
  });

  test("rejects update without a mutable field", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, ["config", "update", "--name", "wiki"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ success: false });
  });

  test("rejects update when the repository does not exist", async (): Promise<void> => {
    const cwd = await initWorkspace();
    const result = await invoke(cwd, ["config", "update", "--name", "ghost", "--branch", "dev"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining("ghost"),
    });
  });

  test("fails with a JSON error when the path is used by another repository", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, [
      "config",
      "add",
      "--name",
      "docs",
      "--url",
      "https://github.com/kxh4892636/docs.git",
      "--path",
      "apps/wiki",
      "--branch",
      "main",
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining("apps/wiki"),
      conflict: "wiki",
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).not.toContain("docs");
  });

  test("fails with a usage error when an option is missing", async (): Promise<void> => {
    const cwd = await initWorkspace();
    const result = await invoke(cwd, [
      "config",
      "add",
      "--name",
      "wiki",
      "--url",
      "https://x/y.git",
    ]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ success: false });
  });

  test("--dry-run reports the plan without writing", async (): Promise<void> => {
    const cwd = await initWorkspace();
    const result = await invoke(cwd, [...ADD_WIKI, "--dry-run"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      dryRun: true,
      preview: {
        action: "add",
        change: "added",
        repository: {
          name: "wiki",
          url: "https://github.com/kxh4892636/wiki.git",
          path: "apps/wiki",
          branch: "main",
        },
        config: path.join(cwd, WORKSPACE_CONFIG_FILE),
      },
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).toContain("repositories: []");
  });
});

describe("workspace config list and remove", (): void => {
  test("lists all or selected configuration and rejects an unknown name", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    await invoke(cwd, [
      "config",
      "add",
      "--name",
      "docs",
      "--url",
      "https://github.com/kxh4892636/docs.git",
      "--path",
      "apps/docs",
      "--branch",
      "stable",
    ]);

    const all = await invoke(cwd, ["config", "list"]);
    const selected = await invoke(cwd, ["config", "list", "--name", "docs"]);
    const unknown = await invoke(cwd, ["config", "list", "--name", "ghost"]);
    const wiki = {
      name: "wiki",
      url: "https://github.com/kxh4892636/wiki.git",
      path: "apps/wiki",
      branch: "main",
    };
    const docs = {
      name: "docs",
      url: "https://github.com/kxh4892636/docs.git",
      path: "apps/docs",
      branch: "stable",
    };

    expect(all.code).toBe(0);
    expect(JSON.parse(all.stdout)).toEqual({
      success: true,
      root: cwd,
      repositories: [wiki, docs],
    });
    expect(selected.code).toBe(0);
    expect(JSON.parse(selected.stdout)).toEqual({
      success: true,
      root: cwd,
      repositories: [docs],
    });
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining("ghost"),
    });
  });

  test("removes the entry", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, ["config", "remove", "--name", "wiki"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      action: "remove",
      removed: {
        name: "wiki",
        url: "https://github.com/kxh4892636/wiki.git",
        path: "apps/wiki",
        branch: "main",
      },
      config: path.join(cwd, WORKSPACE_CONFIG_FILE),
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).not.toContain("wiki");
  });

  test("fails with a JSON error when the name does not exist", async (): Promise<void> => {
    const cwd = await initWorkspace();
    const result = await invoke(cwd, ["config", "remove", "--name", "ghost"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining("ghost"),
    });
  });

  test("--dry-run reports the plan without writing", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, ["config", "remove", "--name", "wiki", "--dry-run"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      dryRun: true,
      preview: { action: "remove", removed: { name: "wiki" } },
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).toContain("- name: wiki");
  });

  test("rejects update and remove while the repository is materialized", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    await mkdir(path.join(cwd, "apps", "wiki"), { recursive: true });
    await mkdir(path.join(cwd, "apps", "wiki", ".git"), { recursive: true });
    const update = await invoke(cwd, ["config", "update", "--name", "wiki", "--branch", "dev"]);
    const remove = await invoke(cwd, ["config", "remove", "--name", "wiki"]);
    expect(update.code).toBe(1);
    expect(remove.code).toBe(1);
  });

  test("does not treat an ordinary directory as a materialized repository", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    await mkdir(path.join(cwd, "apps", "wiki"), { recursive: true });
    const update = await invoke(cwd, ["config", "update", "--name", "wiki", "--branch", "dev"]);
    expect(update.code).toBe(0);
  });
});
