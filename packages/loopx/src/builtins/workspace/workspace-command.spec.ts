import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import workspaceCommand from "./index";
import { WORKSPACE_CONFIG_FILE, WORKSPACE_LOCAL_FILE } from "./workspace-config";

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

describe("workspace init", (): void => {
  test("creates a workspace.yaml with empty repositories", async (): Promise<void> => {
    const cwd = await createDirectory();
    const result = await invoke(cwd, ["init"]);
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
    await invoke(cwd, ["init"]);
    const result = await invoke(cwd, ["init"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining(WORKSPACE_CONFIG_FILE),
    });
  });

  test("--dry-run reports the plan without writing a file", async (): Promise<void> => {
    const cwd = await createDirectory();
    const result = await invoke(cwd, ["init", "--dry-run"]);
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
  await invoke(cwd, ["init"]);
  return cwd;
};

describe("workspace add", (): void => {
  test("appends a new repository entry", async (): Promise<void> => {
    const cwd = await initWorkspace();
    const result = await invoke(cwd, ADD_WIKI);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
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

  test("updates url, path and branch when the name already exists", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, [
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
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ success: true, change: "updated" });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document.match(/- name: wiki/gu)).toHaveLength(1);
    expect(document).toContain("packages/wiki");
    expect(document).toContain("branch: dev");
  });

  test("fails with a JSON error when the path is used by another repository", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, [
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
    const result = await invoke(cwd, ["add", "--name", "wiki", "--url", "https://x/y.git"]);
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

describe("workspace remove", (): void => {
  test("removes the entry", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, ["remove", "--name", "wiki"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
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

  test("reports a residual clone_path recorded in workspace.local.yaml", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    await writeFile(
      path.join(cwd, WORKSPACE_LOCAL_FILE),
      `repositories:
  - name: wiki
    clone_path: C:/Users/kxh/workspaces/wiki
`,
      "utf8",
    );
    const result = await invoke(cwd, ["remove", "--name", "wiki"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      residualClonePath: "C:/Users/kxh/workspaces/wiki",
      hint: expect.stringContaining(WORKSPACE_LOCAL_FILE),
    });
    const local = await readFile(path.join(cwd, WORKSPACE_LOCAL_FILE), "utf8");
    expect(local).toContain("clone_path");
  });

  test("fails with a JSON error when the name does not exist", async (): Promise<void> => {
    const cwd = await initWorkspace();
    const result = await invoke(cwd, ["remove", "--name", "ghost"]);
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
    const result = await invoke(cwd, ["remove", "--name", "wiki", "--dry-run"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      dryRun: true,
      preview: { action: "remove", removed: { name: "wiki" } },
    });
    const document = await readFile(path.join(cwd, WORKSPACE_CONFIG_FILE), "utf8");
    expect(document).toContain("- name: wiki");
  });
});

describe("workspace pull", (): void => {
  test("fails with a usage error when --path is combined with multiple --name", async (): Promise<void> => {
    const cwd = await createDirectory();
    const result = await invoke(cwd, ["pull", "--name", "wiki", "--name", "docs", "--path", "x"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining("--name"),
    });
  });

  test("fails with a usage error when --worktree-branch is used without --name", async (): Promise<void> => {
    const cwd = await createDirectory();
    const result = await invoke(cwd, ["pull", "--worktree-branch", "feature/docs"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ success: false });
  });

  test("fails with a JSON error for an unknown --name", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const result = await invoke(cwd, ["pull", "--name", "ghost"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining("ghost"),
    });
  });

  test("fails with a JSON error when a recorded clone_path no longer exists", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const missing = path.join(cwd, "missing-clone");
    await writeFile(
      path.join(cwd, WORKSPACE_LOCAL_FILE),
      `repositories:
  - name: wiki
    clone_path: ${missing}
`,
      "utf8",
    );
    const result = await invoke(cwd, ["pull"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: expect.stringContaining(missing),
      hint: expect.stringContaining(WORKSPACE_LOCAL_FILE),
    });
  });

  test("--dry-run reports the per-repository action plan without any side effect", async (): Promise<void> => {
    const cwd = await initWorkspace();
    await invoke(cwd, ADD_WIKI);
    const clonePath = path.join(homedir(), "workspaces", "wiki");
    const result = await invoke(cwd, ["pull", "--dry-run"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      dryRun: true,
      preview: {
        action: "pull",
        repositories: [
          {
            name: "wiki",
            actions: [
              {
                action: "clone",
                url: "https://github.com/kxh4892636/wiki.git",
                clonePath,
              },
              {
                action: "create-worktree",
                path: path.join(cwd, "apps/wiki"),
                branch: expect.stringMatching(/^worktree\/wiki-\d{14}$/u),
                base: "main",
              },
              { action: "fetch", branch: "main" },
              { action: "fast-forward", branch: "main" },
              { action: "record-clone-path", clonePath },
            ],
            status: "pulled",
          },
        ],
      },
    });
    await expect(readFile(path.join(cwd, WORKSPACE_LOCAL_FILE), "utf8")).rejects.toThrow();
  });
});
