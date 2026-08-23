import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CliUsageError } from "../../cli/errors";
import type { InvocationContext, JsonOutput, JsonValue, PreparedMutation } from "../../cli/types";
import {
  loadWorkspaceConfig,
  isWorkspaceRelativePath,
  recordClonePath,
  WORKSPACE_CONFIG_FILE,
  WORKSPACE_LOCAL_FILE,
  WorkspaceConfigError,
  type WorkspaceRepository,
} from "./workspace-config";

const execFileAsync = promisify(execFile);
const workspaceDiagnostics = channel("loopx.workspace");

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

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const runGit = async (arguments_: readonly string[]): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("git", [...arguments_]);
    return stdout;
  } catch (error) {
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    const detail = stderr !== "" ? stderr : errorMessage(error);
    workspaceDiagnostics.publish({ level: "error", message: detail });
    throw new Error(`git ${arguments_.join(" ")} failed: ${detail}`);
  }
};

const isAncestor = async (
  clonePath: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> => {
  try {
    await execFileAsync("git", [
      "-C",
      clonePath,
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

const listWorktreePaths = async (clonePath: string): Promise<readonly string[]> => {
  const stdout = await runGit(["-C", clonePath, "worktree", "list", "--porcelain"]);
  return stdout
    .split("\n")
    .filter((line: string): boolean => line.startsWith("worktree "))
    .map((line: string): string => normalizeFsPath(line.slice("worktree ".length)));
};

const isDirty = async (worktreePath: string): Promise<boolean> =>
  (await runGit(["-C", worktreePath, "status", "--porcelain"])).trim() !== "";

const defaultWorktreeBranch = (name: string, now: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `worktree/${name}-${stamp}`;
};

// `fetch --depth 1` 会在浅克隆图中切断新提交与父提交，导致后续快进看似历史无关。
// 持续加深，直到能判定 worktree HEAD 与基准分支的祖先关系，或仓库已完整展开。
const resolveFastForward = async (
  clonePath: string,
  branch: string,
  head: string,
): Promise<boolean> => {
  for (;;) {
    if (await isAncestor(clonePath, head, `origin/${branch}`)) return true;
    const shallow = (
      await runGit(["-C", clonePath, "rev-parse", "--is-shallow-repository"])
    ).trim();
    if (shallow !== "true") return false;
    await runGit(["-C", clonePath, "fetch", "--deepen", "64", "origin", branch]);
  }
};

type PullStatus = "failed" | "pulled" | "skipped";

interface RepositoryPullPlan {
  readonly name: string;
  readonly actions: readonly JsonValue[];
  readonly status: PullStatus;
  readonly reason?: string | undefined;
}

interface PullTarget {
  readonly root: string;
  readonly repository: WorkspaceRepository;
  readonly clonePath: string;
  readonly worktreePath: string;
  readonly worktreeBranch: string;
  readonly recordClonePath: boolean;
}

export interface WorkspacePullSelection {
  readonly names: readonly string[];
  readonly path?: string | undefined;
  readonly worktreeBranch?: string | undefined;
}

const toJson = (plan: RepositoryPullPlan): JsonValue => ({
  name: plan.name,
  actions: plan.actions,
  status: plan.status,
  ...(plan.reason === undefined ? {} : { reason: plan.reason }),
});

const createWorktreeAction = (target: PullTarget): JsonValue => ({
  action: "create-worktree",
  path: target.worktreePath,
  branch: target.worktreeBranch,
  base: target.repository.branch,
});

const displayPath = (value: string): string => value.replace(/\\/gu, "/");

const occupiedReason = (target: PullTarget): string =>
  `${displayPath(target.worktreePath)} already exists and is not a worktree registered in ${displayPath(target.clonePath)}; move it away or choose another --path`;

const planPullTarget = async (target: PullTarget): Promise<RepositoryPullPlan> => {
  const { repository, clonePath, worktreePath } = target;
  const actions: JsonValue[] = [];
  if (!(await exists(clonePath))) {
    actions.push({ action: "clone", url: repository.url, clonePath });
    if (await exists(worktreePath)) {
      return { name: repository.name, actions, status: "failed", reason: occupiedReason(target) };
    }
    actions.push(createWorktreeAction(target));
  } else {
    let worktrees: readonly string[];
    try {
      worktrees = await listWorktreePaths(clonePath);
    } catch (error) {
      return { name: repository.name, actions, status: "failed", reason: errorMessage(error) };
    }
    if (worktrees.includes(normalizeFsPath(worktreePath))) {
      if (await isDirty(worktreePath)) {
        return {
          name: repository.name,
          actions,
          status: "skipped",
          reason: `Worktree has uncommitted changes: ${worktreePath}`,
        };
      }
    } else {
      if (await exists(worktreePath)) {
        return { name: repository.name, actions, status: "failed", reason: occupiedReason(target) };
      }
      actions.push(createWorktreeAction(target));
    }
  }
  actions.push({ action: "fetch", branch: repository.branch });
  actions.push({ action: "fast-forward", branch: repository.branch });
  if (target.recordClonePath) actions.push({ action: "record-clone-path", clonePath });
  return { name: repository.name, actions, status: "pulled" };
};

const executePullTarget = async (target: PullTarget): Promise<RepositoryPullPlan> => {
  const { repository, clonePath, worktreePath } = target;
  const name = repository.name;
  const actions: JsonValue[] = [];
  try {
    if (!(await exists(clonePath))) {
      await runGit([
        "clone",
        "--depth",
        "1",
        "--branch",
        repository.branch,
        repository.url,
        clonePath,
      ]);
      actions.push({ action: "clone", url: repository.url, clonePath });
    }
    const worktrees = await listWorktreePaths(clonePath);
    if (!worktrees.includes(normalizeFsPath(worktreePath))) {
      if (await exists(worktreePath)) {
        return { name, actions, status: "failed", reason: occupiedReason(target) };
      }
      await runGit([
        "-C",
        clonePath,
        "worktree",
        "add",
        "-b",
        target.worktreeBranch,
        worktreePath,
        repository.branch,
      ]);
      actions.push(createWorktreeAction(target));
    }
    if (await isDirty(worktreePath)) {
      return {
        name,
        actions,
        status: "skipped",
        reason: `Worktree has uncommitted changes: ${worktreePath}`,
      };
    }
    await runGit(["-C", clonePath, "fetch", "--depth", "1", "origin", repository.branch]);
    actions.push({ action: "fetch", branch: repository.branch });
    const base = `origin/${repository.branch}`;
    const head = (await runGit(["-C", worktreePath, "rev-parse", "HEAD"])).trim();
    const baseHead = (await runGit(["-C", clonePath, "rev-parse", base])).trim();
    if (head !== baseHead) {
      // 基准分支是 HEAD 的祖先时，工作分支包含本地提交，CLI 不改写或合并用户历史。
      if (await isAncestor(clonePath, base, head)) {
        return {
          name,
          actions,
          status: "skipped",
          reason: `Cannot fast-forward to ${repository.branch}: the worktree branch has local commits`,
        };
      }
      if (!(await resolveFastForward(clonePath, repository.branch, head))) {
        return {
          name,
          actions,
          status: "skipped",
          reason: `Cannot fast-forward to ${repository.branch}: the worktree branch has diverged`,
        };
      }
      try {
        await runGit(["-C", worktreePath, "merge", "--ff-only", base]);
      } catch (error) {
        return { name, actions, status: "skipped", reason: errorMessage(error) };
      }
      actions.push({ action: "fast-forward", branch: repository.branch });
    }
    if (target.recordClonePath) {
      await recordClonePath(target.root, name, clonePath);
      actions.push({ action: "record-clone-path", clonePath });
    }
    return { name, actions, status: "pulled" };
  } catch (error) {
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    return { name, actions, status: "failed", reason: errorMessage(error) };
  }
};

export const prepareWorkspacePull = async (
  selection: WorkspacePullSelection,
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const names = [...new Set(selection.names)];
  if (
    (selection.path !== undefined || selection.worktreeBranch !== undefined) &&
    names.length !== 1
  ) {
    throw new CliUsageError("--path and --worktree-branch require exactly one --name");
  }
  const config = await loadWorkspaceConfig(context.cwd);
  if (selection.path !== undefined && !isWorkspaceRelativePath(selection.path)) {
    throw new CliUsageError(
      "--path must be relative to the workspace root and must not contain '..'",
    );
  }
  const repositories: readonly WorkspaceRepository[] =
    names.length === 0
      ? config.repositories
      : names.map((name: string): WorkspaceRepository => {
          const repository = config.repositories.find(
            (entry: WorkspaceRepository): boolean => entry.name === name,
          );
          if (repository === undefined) {
            throw new WorkspaceConfigError(
              `Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`,
              { details: { name } },
            );
          }
          return repository;
        });
  const now = new Date();
  const targets: PullTarget[] = [];
  for (const repository of repositories) {
    const clonePath = repository.clonePath ?? path.join(homedir(), "workspaces", repository.name);
    if (repository.clonePath !== undefined && !(await exists(clonePath))) {
      throw new WorkspaceConfigError(
        `clone_path recorded in ${WORKSPACE_LOCAL_FILE} does not exist: ${clonePath}`,
        {
          hint: `Fix the record in ${WORKSPACE_LOCAL_FILE} or delete it to clone again; pull does not clone to a different path automatically`,
          details: { name: repository.name, clonePath },
        },
      );
    }
    targets.push({
      root: config.root,
      repository,
      clonePath,
      worktreePath: path.resolve(config.root, selection.path ?? repository.path),
      worktreeBranch: selection.worktreeBranch ?? defaultWorktreeBranch(repository.name, now),
      recordClonePath: repository.clonePath === undefined,
    });
  }
  const planned: RepositoryPullPlan[] = [];
  for (const target of targets) planned.push(await planPullTarget(target));
  return {
    preview: { action: "pull", repositories: planned.map(toJson) },
    commit: async (): Promise<JsonOutput> => {
      const results: RepositoryPullPlan[] = [];
      for (const target of targets) results.push(await executePullTarget(target));
      return {
        success: results.every((result: RepositoryPullPlan): boolean => result.status !== "failed"),
        repositories: results.map(toJson),
      };
    },
  };
};
