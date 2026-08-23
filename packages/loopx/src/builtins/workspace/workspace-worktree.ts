import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CliUsageError } from "../../cli/errors";
import type { InvocationContext, JsonOutput, JsonValue, PreparedMutation } from "../../cli/types";
import {
  isWorkspaceRelativePath,
  loadWorkspaceConfig,
  loadWorkspaceConfigurationView,
  WORKSPACE_CONFIG_FILE,
  WorkspaceConfigError,
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

const gitSucceeds = async (arguments_: readonly string[]): Promise<boolean> => {
  try {
    await execFileAsync("git", [...arguments_]);
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
    throw error;
  }
};

const normalizedPath = (value: string): string => {
  const normalized = path.resolve(value.trim()).replace(/\\/gu, "/").replace(/\/+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

interface GitWorktree {
  readonly path: string;
  readonly head: string;
  readonly branch?: string | undefined;
  readonly locked: boolean;
  readonly prunable: boolean;
}

const parseWorktrees = (porcelain: string): readonly GitWorktree[] =>
  porcelain
    .trim()
    .split(/\r?\n\r?\n/gu)
    .filter((record: string): boolean => record !== "")
    .map((record: string): GitWorktree => {
      const values = new Map<string, string>();
      const flags = new Set<string>();
      for (const line of record.split(/\r?\n/gu)) {
        const separator = line.indexOf(" ");
        if (separator === -1) flags.add(line);
        else values.set(line.slice(0, separator), line.slice(separator + 1));
      }
      const worktreePath = values.get("worktree");
      const head = values.get("HEAD");
      if (worktreePath === undefined || head === undefined) {
        throw new WorkspaceConfigError("Invalid git worktree list --porcelain output", {});
      }
      const reference = values.get("branch");
      const branch = reference?.startsWith("refs/heads/")
        ? reference.slice("refs/heads/".length)
        : undefined;
      return {
        path: path.resolve(worktreePath),
        head,
        ...(branch === undefined ? {} : { branch }),
        locked: flags.has("locked") || values.has("locked"),
        prunable: flags.has("prunable") || values.has("prunable"),
      };
    });

const selectRepositories = (
  repositories: readonly WorkspaceRepository[],
  names: readonly string[],
): readonly WorkspaceRepository[] => {
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length === 0) return repositories;
  return uniqueNames.map((name: string): WorkspaceRepository => {
    const repository = repositories.find(
      (entry: WorkspaceRepository): boolean => entry.name === name,
    );
    if (repository === undefined) {
      throw new WorkspaceConfigError(`Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`, {
        details: { name },
      });
    }
    return repository;
  });
};

const clonePathFor = (repository: WorkspaceRepository): string =>
  repository.clonePath ?? path.join(homedir(), "workspaces", repository.name);

const listRepositoryWorktrees = async (
  root: string,
  repository: WorkspaceRepository,
): Promise<JsonValue> => {
  const clonePath = clonePathFor(repository);
  if (!(await exists(clonePath))) {
    return { name: repository.name, clonePath, status: "not-materialized", worktrees: [] };
  }
  const configuredMainPath = normalizedPath(path.resolve(root, repository.path));
  const worktrees = parseWorktrees(
    await runGit(["-C", clonePath, "worktree", "list", "--porcelain"]),
  ).map(
    (worktree: GitWorktree): JsonValue => ({
      path: worktree.path,
      head: worktree.head,
      ...(worktree.branch === undefined ? {} : { branch: worktree.branch }),
      isMain: normalizedPath(worktree.path) === configuredMainPath,
      locked: worktree.locked,
    }),
  );
  return { name: repository.name, clonePath, status: "materialized", worktrees };
};

export const listWorkspaceWorktrees = async (
  names: readonly string[],
  context: InvocationContext,
): Promise<JsonOutput> => {
  const config = await loadWorkspaceConfig(context.cwd);
  const repositories = selectRepositories(config.repositories, names);
  const results: JsonValue[] = [];
  for (const repository of repositories) {
    results.push(await listRepositoryWorktrees(config.root, repository));
  }
  return { success: true, repositories: results };
};

interface WorktreeTarget {
  readonly clonePath: string;
  readonly name: string;
  readonly repository?: WorkspaceRepository | undefined;
  readonly root: string;
  readonly worktree: GitWorktree;
  readonly worktreePath: string;
}

const resolveWorktreeTarget = async (
  context: InvocationContext,
  name: string,
  requestedPath: string,
  allowOrphan: boolean = false,
): Promise<WorktreeTarget> => {
  if (!isWorkspaceRelativePath(requestedPath)) {
    throw new CliUsageError(
      "--path must be relative to the workspace root and must not contain '..'",
    );
  }
  const config = await loadWorkspaceConfigurationView(context.cwd);
  const repository = config.repositories.find(
    (entry: WorkspaceRepository): boolean => entry.name === name,
  );
  const orphan = config.localRepositories.find(
    (entry: WorkspaceLocalRepository): boolean => entry.name === name,
  );
  if (repository === undefined && (!allowOrphan || orphan === undefined)) {
    throw new WorkspaceConfigError(`Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`, {});
  }
  const clonePath = repository === undefined ? orphan?.clonePath : clonePathFor(repository);
  if (clonePath === undefined) {
    throw new WorkspaceConfigError(`Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`, {});
  }
  if (!(await exists(clonePath))) {
    throw new WorkspaceConfigError(`Repository is not materialized: ${name}`, {
      details: { name, clonePath },
    });
  }
  const worktreePath = path.resolve(config.root, requestedPath);
  if (normalizedPath(worktreePath) === normalizedPath(clonePath)) {
    throw new WorkspaceConfigError(
      `clone storage is not a managed workspace worktree: ${clonePath}`,
      {
        details: { name, clonePath },
      },
    );
  }
  const worktree = parseWorktrees(
    await runGit(["-C", clonePath, "worktree", "list", "--porcelain"]),
  ).find(
    (entry: GitWorktree): boolean => normalizedPath(entry.path) === normalizedPath(worktreePath),
  );
  if (worktree === undefined) {
    throw new WorkspaceConfigError(`Worktree is not registered for '${name}': ${worktreePath}`, {
      details: { name, path: worktreePath },
    });
  }
  return { clonePath, name, repository, root: config.root, worktree, worktreePath };
};

export interface WorkspaceSwitchSelection {
  readonly base?: string | undefined;
  readonly branch: string;
  readonly name: string;
  readonly path: string;
}

export const prepareWorkspaceSwitch = async (
  selection: WorkspaceSwitchSelection,
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const target = await resolveWorktreeTarget(context, selection.name, selection.path);
  if (target.repository === undefined) {
    throw new WorkspaceConfigError(
      `Repository not found in ${WORKSPACE_CONFIG_FILE}: ${selection.name}`,
      {},
    );
  }
  const reference = `refs/heads/${selection.branch}`;
  const branchExists = await gitSucceeds([
    "-C",
    target.clonePath,
    "show-ref",
    "--verify",
    "--quiet",
    reference,
  ]);
  const created = !branchExists;
  const base = selection.base ?? target.repository.branch;
  const preview: JsonValue = {
    action: "switch-worktree",
    name: target.name,
    path: target.worktreePath,
    branch: selection.branch,
    created,
    ...(created ? { base } : {}),
  };
  return {
    preview,
    commit: async (): Promise<JsonOutput> => {
      const arguments_ = branchExists
        ? ["-C", target.worktreePath, "switch", selection.branch]
        : ["-C", target.worktreePath, "switch", "-c", selection.branch, base];
      await runGit(arguments_);
      return {
        success: true,
        action: "switch-worktree",
        name: target.name,
        path: target.worktreePath,
        branch: selection.branch,
        created,
        ...(created ? { base } : {}),
      };
    },
  };
};

export interface WorkspaceRemoveSelection {
  readonly deleteBranch: boolean;
  readonly force: boolean;
  readonly name: string;
  readonly path: string;
}

export const prepareWorkspaceRemove = async (
  selection: WorkspaceRemoveSelection,
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const target = await resolveWorktreeTarget(context, selection.name, selection.path, true);
  const branch = target.worktree.branch;
  if (selection.deleteBranch && branch === undefined) {
    throw new WorkspaceConfigError(
      `Cannot delete a branch for detached worktree: ${target.worktreePath}`,
      { details: { name: target.name, path: target.worktreePath } },
    );
  }
  const preview: JsonValue = {
    action: "remove-worktree",
    name: target.name,
    path: target.worktreePath,
    ...(branch === undefined ? {} : { branch }),
    force: selection.force,
    deleteBranch: selection.deleteBranch,
  };
  return {
    preview,
    commit: async (): Promise<JsonOutput> => {
      await runGit([
        "-C",
        target.clonePath,
        "worktree",
        "remove",
        ...(selection.force ? ["--force"] : []),
        target.worktreePath,
      ]);
      if (selection.deleteBranch && branch !== undefined) {
        await runGit(["-C", target.clonePath, "branch", "-d", "--", branch]);
      }
      return {
        success: true,
        action: "remove-worktree",
        name: target.name,
        path: target.worktreePath,
        ...(branch === undefined ? {} : { branch }),
        branchDeleted: selection.deleteBranch,
      };
    },
  };
};

interface RepositoryPrunePlan {
  readonly clonePath: string;
  readonly materialized: boolean;
  readonly name: string;
  readonly pruned: readonly GitWorktree[];
}

const prunePlanJson = (plan: RepositoryPrunePlan): JsonValue => ({
  name: plan.name,
  status: plan.materialized ? "pruned" : "not-materialized",
  pruned: plan.pruned.map(
    (worktree: GitWorktree): JsonValue => ({
      path: worktree.path,
      head: worktree.head,
      ...(worktree.branch === undefined ? {} : { branch: worktree.branch }),
    }),
  ),
});

export const prepareWorkspacePrune = async (
  names: readonly string[],
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const config = await loadWorkspaceConfig(context.cwd);
  const repositories = selectRepositories(config.repositories, names);
  const plans: RepositoryPrunePlan[] = [];
  for (const repository of repositories) {
    const clonePath = clonePathFor(repository);
    if (!(await exists(clonePath))) {
      plans.push({ clonePath, materialized: false, name: repository.name, pruned: [] });
      continue;
    }
    const worktrees = parseWorktrees(
      await runGit(["-C", clonePath, "worktree", "list", "--porcelain"]),
    );
    plans.push({
      clonePath,
      materialized: true,
      name: repository.name,
      pruned: worktrees.filter((worktree: GitWorktree): boolean => worktree.prunable),
    });
  }
  return {
    preview: { action: "prune-worktrees", repositories: plans.map(prunePlanJson) },
    commit: async (): Promise<JsonOutput> => {
      for (const plan of plans) {
        if (plan.materialized) await runGit(["-C", plan.clonePath, "worktree", "prune"]);
      }
      return {
        success: true,
        action: "prune-worktrees",
        repositories: plans.map(prunePlanJson),
      };
    },
  };
};
