import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
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
  const code = await runCli(request, [() => workspaceCommand]);
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
