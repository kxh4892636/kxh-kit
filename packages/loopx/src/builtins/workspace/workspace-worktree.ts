import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import path from "node:path";
import { promisify } from "node:util";
import { CliUsageError } from "../../cli/errors";
import type { InvocationContext, JsonOutput, JsonValue, PreparedMutation } from "../../cli/types";
import {
  isWorkspaceRelativePath,
  loadWorkspaceFile,
  resolveRepositoryPath,
  WORKSPACE_CONFIG_FILE,
  WorkspaceConfigError,
  type WorkspaceRepository,
} from "./workspace-config";
import { assertPhysicalPathWithinRoot, normalizeFsPath, pathExists } from "./workspace-path";
import { errorDetail, errorMessage, hasErrorCode } from "./workspace-error";

const execFileAsync = promisify(execFile);
const workspaceDiagnostics = channel("loopx.workspace");
const runGit = async (arguments_: readonly string[]): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("git", ["--no-optional-locks", ...arguments_]);
    return stdout;
  } catch (error) {
    const detail = errorDetail(error);
    workspaceDiagnostics.publish({ level: "error", message: detail });
    throw new Error(`Git worktree operation failed: ${detail}`);
  }
};

const gitSucceeds = async (arguments_: readonly string[]): Promise<boolean> => {
  try {
    await execFileAsync("git", ["--no-optional-locks", ...arguments_]);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 1)) return false;
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
};

interface GitWorktree {
  readonly branch?: string | undefined;
  readonly head: string;
  readonly locked: boolean;
  readonly path: string;
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
  const selected = [...new Set(names)];
  if (selected.length === 0) return repositories;
  return selected.map((name: string): WorkspaceRepository => {
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

const requireRelativeTarget = (requestedPath: string): void => {
  if (!isWorkspaceRelativePath(requestedPath)) {
    throw new CliUsageError(
      "--path must be relative to the workspace root and must not contain '..'",
    );
  }
};

const defaultWorktreeBranch = (name: string, now: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `worktree/${name}-${stamp}`;
};

const listRepositoryWorktrees = async (
  root: string,
  repository: WorkspaceRepository,
): Promise<JsonValue> => {
  const repositoryPath = resolveRepositoryPath(root, repository);
  if (!(await pathExists(repositoryPath))) {
    return { name: repository.name, repositoryPath, status: "not-materialized", worktrees: [] };
  }
  await assertPhysicalPathWithinRoot(root, repositoryPath);
  const worktrees = parseWorktrees(
    await runGit(["-C", repositoryPath, "worktree", "list", "--porcelain"]),
  ).map(
    (worktree: GitWorktree): JsonValue => ({
      path: worktree.path,
      head: worktree.head,
      ...(worktree.branch === undefined ? {} : { branch: worktree.branch }),
      primary: normalizeFsPath(worktree.path) === normalizeFsPath(repositoryPath),
      locked: worktree.locked,
    }),
  );
  return { name: repository.name, repositoryPath, status: "materialized", worktrees };
};

export const listWorkspaceWorktrees = async (
  names: readonly string[],
  context: InvocationContext,
): Promise<JsonOutput> => {
  const config = await loadWorkspaceFile(context.cwd);
  const repositories = selectRepositories(config.repositories, names);
  const results: JsonValue[] = [];
  for (const repository of repositories) {
    results.push(await listRepositoryWorktrees(config.root, repository));
  }
  return { success: true, repositories: results };
};

interface ResolvedRepository {
  readonly repository: WorkspaceRepository;
  readonly repositoryPath: string;
  readonly root: string;
}

const resolveRepository = async (
  context: InvocationContext,
  name: string,
): Promise<ResolvedRepository> => {
  const config = await loadWorkspaceFile(context.cwd);
  const repository = config.repositories.find(
    (entry: WorkspaceRepository): boolean => entry.name === name,
  );
  if (repository === undefined) {
    throw new WorkspaceConfigError(`Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`, {
      details: { name },
    });
  }
  const repositoryPath = resolveRepositoryPath(config.root, repository);
  await assertPhysicalPathWithinRoot(config.root, repositoryPath);
  if (!(await pathExists(path.join(repositoryPath, ".git")))) {
    throw new WorkspaceConfigError(`Repository is not materialized: ${name}`, {
      hint: `Run 'loopx workspace repository clone --name ${name}' first`,
      details: { name, path: repositoryPath },
    });
  }
  return { repository, repositoryPath, root: config.root };
};

export interface WorkspaceAddSelection {
  readonly base?: string | undefined;
  readonly branch?: string | undefined;
  readonly name: string;
  readonly path: string;
}

export const prepareWorkspaceAdd = async (
  selection: WorkspaceAddSelection,
  context: InvocationContext,
): Promise<PreparedMutation> => {
  requireRelativeTarget(selection.path);
  const resolved = await resolveRepository(context, selection.name);
  const worktreePath = path.resolve(resolved.root, selection.path);
  if (normalizeFsPath(worktreePath) === normalizeFsPath(resolved.repositoryPath)) {
    throw new WorkspaceConfigError(
      `Cannot add a worktree at the primary clone: ${worktreePath}`,
      {},
    );
  }
  await assertPhysicalPathWithinRoot(resolved.root, worktreePath);
  if (await pathExists(worktreePath)) {
    throw new WorkspaceConfigError(`Worktree target already exists: ${worktreePath}`, {
      details: { name: selection.name, path: worktreePath },
    });
  }
  const branch = selection.branch ?? defaultWorktreeBranch(selection.name, new Date());
  const base = selection.base ?? resolved.repository.branch;
  const branchExists = await gitSucceeds([
    "-C",
    resolved.repositoryPath,
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  const preview: JsonValue = {
    action: "add-worktree",
    name: selection.name,
    path: worktreePath,
    branch,
    createdBranch: !branchExists,
    ...(branchExists ? {} : { base }),
  };
  return {
    preview,
    commit: async (): Promise<JsonOutput> => {
      await assertPhysicalPathWithinRoot(resolved.root, resolved.repositoryPath);
      await assertPhysicalPathWithinRoot(resolved.root, worktreePath);
      if (await pathExists(worktreePath)) {
        throw new WorkspaceConfigError(`Worktree target already exists: ${worktreePath}`, {});
      }
      const arguments_ = branchExists
        ? ["-C", resolved.repositoryPath, "worktree", "add", "--", worktreePath, branch]
        : [
            "-C",
            resolved.repositoryPath,
            "worktree",
            "add",
            "-b",
            branch,
            "--",
            worktreePath,
            base,
          ];
      await runGit(arguments_);
      return { success: true, ...preview };
    },
  };
};

interface WorktreeTarget extends ResolvedRepository {
  readonly worktree: GitWorktree;
  readonly worktreePath: string;
}

const resolveWorktreeTarget = async (
  context: InvocationContext,
  name: string,
  requestedPath: string,
): Promise<WorktreeTarget> => {
  requireRelativeTarget(requestedPath);
  const resolved = await resolveRepository(context, name);
  const worktreePath = path.resolve(resolved.root, requestedPath);
  if (normalizeFsPath(worktreePath) === normalizeFsPath(resolved.repositoryPath)) {
    throw new WorkspaceConfigError(`Cannot operate on the primary clone: ${worktreePath}`, {
      details: { name, path: worktreePath },
    });
  }
  await assertPhysicalPathWithinRoot(resolved.root, worktreePath);
  const worktree = parseWorktrees(
    await runGit(["-C", resolved.repositoryPath, "worktree", "list", "--porcelain"]),
  ).find(
    (entry: GitWorktree): boolean => normalizeFsPath(entry.path) === normalizeFsPath(worktreePath),
  );
  if (worktree === undefined) {
    throw new WorkspaceConfigError(`Worktree is not registered for '${name}': ${worktreePath}`, {
      details: { name, path: worktreePath },
    });
  }
  return { ...resolved, worktree, worktreePath };
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
  const branchExists = await gitSucceeds([
    "-C",
    target.repositoryPath,
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${selection.branch}`,
  ]);
  const created = !branchExists;
  const base = selection.base ?? target.repository.branch;
  const preview: JsonValue = {
    action: "switch-worktree",
    name: target.repository.name,
    path: target.worktreePath,
    branch: selection.branch,
    created,
    ...(created ? { base } : {}),
  };
  return {
    preview,
    commit: async (): Promise<JsonOutput> => {
      await assertPhysicalPathWithinRoot(target.root, target.repositoryPath);
      await assertPhysicalPathWithinRoot(target.root, target.worktreePath);
      const arguments_ = branchExists
        ? ["-C", target.worktreePath, "switch", selection.branch]
        : ["-C", target.worktreePath, "switch", "-c", selection.branch, base];
      await runGit(arguments_);
      return { success: true, ...preview };
    },
  };
};

export interface WorkspaceRemoveSelection {
  readonly deleteBranch: boolean;
  readonly force: boolean;
  readonly name: string;
  readonly path: string;
}

const assertBranchCanBeDeleted = async (
  target: WorktreeTarget,
  branch: string,
  selection: WorkspaceRemoveSelection,
): Promise<void> => {
  const merged = await gitSucceeds([
    "-C",
    target.repositoryPath,
    "merge-base",
    "--is-ancestor",
    `refs/heads/${branch}`,
    "HEAD",
  ]);
  if (merged) return;
  throw new WorkspaceConfigError(`Branch is not merged and cannot be deleted: ${branch}`, {
    hint: "Merge the branch before removing it with --delete-branch",
    details: { name: selection.name, path: target.worktreePath, branch },
  });
};

export const prepareWorkspaceRemove = async (
  selection: WorkspaceRemoveSelection,
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const target = await resolveWorktreeTarget(context, selection.name, selection.path);
  const branch = target.worktree.branch;
  if (selection.deleteBranch && branch === undefined) {
    throw new WorkspaceConfigError(
      `Cannot delete a branch for detached worktree: ${target.worktreePath}`,
      {
        details: { name: selection.name, path: target.worktreePath },
      },
    );
  }
  if (selection.deleteBranch && branch !== undefined) {
    await assertBranchCanBeDeleted(target, branch, selection);
  }
  const preview: JsonValue = {
    action: "remove-worktree",
    name: selection.name,
    path: target.worktreePath,
    ...(branch === undefined ? {} : { branch }),
    force: selection.force,
    deleteBranch: selection.deleteBranch,
  };
  return {
    preview,
    commit: async (): Promise<JsonOutput> => {
      await assertPhysicalPathWithinRoot(target.root, target.repositoryPath);
      await assertPhysicalPathWithinRoot(target.root, target.worktreePath);
      if (selection.deleteBranch && branch !== undefined) {
        await assertBranchCanBeDeleted(target, branch, selection);
      }
      await runGit([
        "-C",
        target.repositoryPath,
        "worktree",
        "remove",
        ...(selection.force ? ["--force"] : []),
        "--",
        target.worktreePath,
      ]);
      if (selection.deleteBranch && branch !== undefined) {
        await runGit(["-C", target.repositoryPath, "branch", "-d", "--", branch]);
      }
      return {
        success: true,
        action: "remove-worktree",
        name: selection.name,
        path: target.worktreePath,
        ...(branch === undefined ? {} : { branch }),
        branchDeleted: selection.deleteBranch,
      };
    },
  };
};

interface RepositoryPrunePlan {
  readonly materialized: boolean;
  readonly name: string;
  readonly pruned: readonly GitWorktree[];
  readonly repositoryPath: string;
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
  const config = await loadWorkspaceFile(context.cwd);
  const repositories = selectRepositories(config.repositories, names);
  const plans: RepositoryPrunePlan[] = [];
  for (const repository of repositories) {
    const repositoryPath = resolveRepositoryPath(config.root, repository);
    if (!(await pathExists(repositoryPath))) {
      plans.push({ materialized: false, name: repository.name, pruned: [], repositoryPath });
      continue;
    }
    await assertPhysicalPathWithinRoot(config.root, repositoryPath);
    const worktrees = parseWorktrees(
      await runGit(["-C", repositoryPath, "worktree", "list", "--porcelain"]),
    );
    plans.push({
      materialized: true,
      name: repository.name,
      pruned: worktrees.filter((worktree: GitWorktree): boolean => worktree.prunable),
      repositoryPath,
    });
  }
  return {
    preview: { action: "prune-worktrees", repositories: plans.map(prunePlanJson) },
    commit: async (): Promise<JsonOutput> => {
      for (const plan of plans) {
        if (plan.materialized) {
          await assertPhysicalPathWithinRoot(config.root, plan.repositoryPath);
          await runGit(["-C", plan.repositoryPath, "worktree", "prune"]);
        }
      }
      return {
        success: true,
        action: "prune-worktrees",
        repositories: plans.map(prunePlanJson),
      };
    },
  };
};
