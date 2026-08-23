import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { InvocationContext, JsonOutput, JsonValue } from "../../cli/types";
import {
  loadWorkspaceConfig,
  loadWorkspaceConfigurationView,
  type WorkspaceLocalRepository,
  type WorkspaceRepository,
} from "./workspace-config";

const execFileAsync = promisify(execFile);
const workspaceDiagnostics = channel("loopx.workspace");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const exists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
};

const runGit = async (directory: string, arguments_: readonly string[]): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("git", [
      "--no-optional-locks",
      "-C",
      directory,
      ...arguments_,
    ]);
    return stdout;
  } catch (error) {
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    const detail = stderr === "" ? errorMessage(error) : stderr;
    workspaceDiagnostics.publish({ level: "error", message: detail });
    throw new Error(`git ${arguments_.join(" ")} failed: ${detail}`);
  }
};

const isAncestor = async (
  directory: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> => {
  try {
    await execFileAsync("git", [
      "--no-optional-locks",
      "-C",
      directory,
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ]);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { readonly code?: unknown }).code === 1
    ) {
      return false;
    }
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw new Error(`git merge-base --is-ancestor failed: ${errorMessage(error)}`);
  }
};

const normalizeFsPath = (value: string): string => {
  const normalized = path.resolve(value.trim()).replace(/\\/gu, "/").replace(/\/+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

interface RegisteredWorktree {
  readonly head: string;
  readonly path: string;
}

const parseWorktrees = (porcelain: string): readonly RegisteredWorktree[] =>
  porcelain
    .trim()
    .split(/\r?\n\r?\n/gu)
    .map((block: string): RegisteredWorktree | undefined => {
      const lines = block.split(/\r?\n/gu);
      const worktree = lines.find((line: string): boolean => line.startsWith("worktree "));
      const head = lines.find((line: string): boolean => line.startsWith("HEAD "));
      if (worktree === undefined || head === undefined) return undefined;
      return {
        path: path.resolve(worktree.slice("worktree ".length)),
        head: head.slice("HEAD ".length),
      };
    })
    .filter(
      (worktree: RegisteredWorktree | undefined): worktree is RegisteredWorktree =>
        worktree !== undefined,
    );

const worktreeView = async (
  worktree: RegisteredWorktree,
  repository: WorkspaceRepository,
  root: string,
): Promise<JsonValue> => {
  const branch = (await runGit(worktree.path, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const dirty = (await runGit(worktree.path, ["status", "--porcelain"])).trim() !== "";
  const base = `origin/${repository.branch}`;
  const canFastForward = await isAncestor(worktree.path, worktree.head, base);
  return {
    path: worktree.path,
    branch,
    dirty,
    canFastForward,
    mainWorktree:
      normalizeFsPath(worktree.path) === normalizeFsPath(path.resolve(root, repository.path)),
  };
};

const repositoryStatus = async (
  repository: WorkspaceRepository,
  root: string,
): Promise<JsonValue> => {
  const clonePath = repository.clonePath ?? path.join(homedir(), "workspaces", repository.name);
  if (!(await exists(clonePath))) {
    return { name: repository.name, clonePath, cloneExists: false, worktrees: [] };
  }
  try {
    const registered = parseWorktrees(await runGit(clonePath, ["worktree", "list", "--porcelain"]));
    const worktrees: JsonValue[] = [];
    for (const worktree of registered) {
      worktrees.push(await worktreeView(worktree, repository, root));
    }
    return { name: repository.name, clonePath, cloneExists: true, worktrees };
  } catch (error) {
    const message = errorMessage(error);
    workspaceDiagnostics.publish({ level: "error", message });
    return { name: repository.name, clonePath, cloneExists: true, worktrees: [], error: message };
  }
};

const repositoryView = (repository: WorkspaceRepository): JsonValue => ({
  name: repository.name,
  url: repository.url,
  path: repository.path,
  branch: repository.branch,
  ...(repository.clonePath === undefined ? {} : { clonePath: repository.clonePath }),
});

export const listWorkspace = async (context: InvocationContext): Promise<JsonOutput> => {
  const config = await loadWorkspaceConfigurationView(context.cwd);
  const names = new Set(
    config.repositories.map((repository: WorkspaceRepository): string => repository.name),
  );
  const orphans = config.localRepositories
    .filter((repository: WorkspaceLocalRepository): boolean => !names.has(repository.name))
    .map(
      (repository: WorkspaceLocalRepository): JsonValue => ({
        name: repository.name,
        clonePath: repository.clonePath,
        orphan: true,
      }),
    );
  return {
    success: true,
    root: config.root,
    repositories: config.repositories.map(repositoryView),
    orphans,
  };
};

export const statusWorkspace = async (context: InvocationContext): Promise<JsonOutput> => {
  const config = await loadWorkspaceConfig(context.cwd);
  const repositories: JsonValue[] = [];
  for (const repository of config.repositories) {
    repositories.push(await repositoryStatus(repository, config.root));
  }
  return {
    success: repositories.every(
      (repository: JsonValue): boolean =>
        typeof repository === "object" && repository !== null && !("error" in repository),
    ),
    root: config.root,
    repositories,
  };
};
