import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect } from "vitest";
import { runCli, type CliRequest } from "../../../cli/run";
import type { BuiltinCommand } from "../../../cli/types";
import workspaceCommand from "../index";
import { WORKSPACE_CONFIG_FILE } from "../workspace-config";
import { verifyWorkspaceContract } from "./workspace-contracts";

// worktree 集成测试的共享夹具: 真实 git 仓库 + 真实 CLI 进程内调用。
// 两份 spec 共用同一套夹具, 因此放在 testing/ 下而不是某个 spec 内(workspace/ 已到 13 个文件上限)。
const execFileAsync = promisify(execFile);
export const gitAvailable = await execFileAsync("git", ["--version"]).then(
  (): boolean => true,
  (): boolean => false,
);
const temporaryDirectories: string[] = [];

export const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "nf-workspace-worktree-"));
  temporaryDirectories.push(directory);
  return directory;
};

export const cleanupTemporaryDirectories = async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory: string): Promise<void> => rm(directory, { force: true, recursive: true })),
  );
};

export const git = async (arguments_: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync("git", [...arguments_]);
  return stdout;
};

export const gitCommit = async (repository: string, message: string): Promise<void> => {
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

export interface CliResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

export const invoke = async (cwd: string, argv: readonly string[]): Promise<CliResult> => {
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
  verifyWorkspaceContract("worktree", { argv, ...result }, cwd);
  return result;
};

export interface WorkspaceFixture {
  readonly repositoryPath: string;
  readonly root: string;
}

export const createWorkspace = async (): Promise<WorkspaceFixture> => {
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

export const isMissing = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return false;
  } catch {
    return true;
  }
};
