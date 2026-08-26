import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import { access, mkdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { InvocationContext, JsonOutput, JsonValue, PreparedMutation } from "../../cli/types";
import {
  loadWorkspaceFile,
  resolveRepositoryPath,
  WORKSPACE_CONFIG_FILE,
  WorkspaceConfigError,
  type WorkspaceRepository,
} from "./workspace-config";

const execFileAsync = promisify(execFile);
const workspaceDiagnostics = channel("loopx.workspace");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const redactSensitiveText = (value: string): string =>
  value.replace(/https?:\/\/\S+/gu, "[redacted-url]");

const exists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    )
      return false;
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
};

const runGit = async (arguments_: readonly string[]): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("git", ["--no-optional-locks", ...arguments_]);
    return stdout;
  } catch (error) {
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    const detail = redactSensitiveText(stderr === "" ? errorMessage(error) : stderr);
    workspaceDiagnostics.publish({ level: "error", message: detail });
    const operation = arguments_.find((argument: string): boolean => !argument.startsWith("-"));
    throw new Error(`git ${operation ?? "operation"} failed: ${detail}`);
  }
};

const isAncestor = async (
  repositoryPath: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> => {
  try {
    await execFileAsync("git", [
      "--no-optional-locks",
      "-C",
      repositoryPath,
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
    )
      return false;
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
};

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

interface RepositoryTarget {
  readonly repository: WorkspaceRepository;
  readonly repositoryPath: string;
  readonly root: string;
}

interface BatchSelection {
  readonly name: string;
  readonly target?: RepositoryTarget | undefined;
}

const resolveTargets = async (
  cwd: string,
  names: readonly string[],
): Promise<readonly RepositoryTarget[]> => {
  const config = await loadWorkspaceFile(cwd);
  return selectRepositories(config.repositories, names).map(
    (repository: WorkspaceRepository): RepositoryTarget => ({
      repository,
      repositoryPath: resolveRepositoryPath(config.root, repository),
      root: config.root,
    }),
  );
};

const resolveBatchSelections = async (
  cwd: string,
  names: readonly string[],
): Promise<readonly BatchSelection[]> => {
  const config = await loadWorkspaceFile(cwd);
  const selected = [...new Set(names)];
  if (selected.length === 0) {
    return config.repositories.map(
      (repository: WorkspaceRepository): BatchSelection => ({
        name: repository.name,
        target: {
          repository,
          repositoryPath: resolveRepositoryPath(config.root, repository),
          root: config.root,
        },
      }),
    );
  }
  return selected.map((name: string): BatchSelection => {
    const repository = config.repositories.find(
      (entry: WorkspaceRepository): boolean => entry.name === name,
    );
    return {
      name,
      ...(repository === undefined
        ? {}
        : {
            target: {
              repository,
              repositoryPath: resolveRepositoryPath(config.root, repository),
              root: config.root,
            },
          }),
    };
  });
};

const assertPhysicalPathWithinRoot = async (root: string, target: string): Promise<void> => {
  const physicalRoot = await realpath(root);
  let existing = target;
  while (!(await exists(existing))) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const physicalTarget = await realpath(existing);
  const relative = path.relative(physicalRoot, physicalTarget);
  if (relative === "" && existing !== root) return;
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WorkspaceConfigError(`Repository path resolves outside the workspace: ${target}`, {
      details: { root, path: target },
    });
  }
};

type BatchStatus = "cloned" | "failed" | "pulled" | "skipped";

interface BatchResult {
  readonly name: string;
  readonly path?: string | undefined;
  readonly status: BatchStatus;
  readonly reason?: string | undefined;
}

const batchJson = (result: BatchResult): JsonValue => ({
  name: result.name,
  ...(result.path === undefined ? {} : { path: result.path }),
  status: result.status,
  ...(result.reason === undefined ? {} : { reason: result.reason }),
});

const cloneTarget = async (target: RepositoryTarget, execute: boolean): Promise<BatchResult> => {
  const { repository, repositoryPath } = target;
  if (await exists(repositoryPath)) {
    return {
      name: repository.name,
      path: repositoryPath,
      status: "failed",
      reason: `Clone target already exists: ${repositoryPath}`,
    };
  }
  try {
    await assertPhysicalPathWithinRoot(target.root, repositoryPath);
    if (!execute) return { name: repository.name, path: repositoryPath, status: "cloned" };
    await mkdir(path.dirname(repositoryPath), { recursive: true });
    await runGit([
      "clone",
      "--depth",
      "1",
      "--branch",
      repository.branch,
      "--",
      repository.url,
      repositoryPath,
    ]);
    return { name: repository.name, path: repositoryPath, status: "cloned" };
  } catch (error) {
    return {
      name: repository.name,
      path: repositoryPath,
      status: "failed",
      reason: errorMessage(error),
    };
  }
};

const missingSelection = (selection: BatchSelection): BatchResult => ({
  name: selection.name,
  status: "failed",
  reason: `Repository not found in ${WORKSPACE_CONFIG_FILE}: ${selection.name}`,
});

const throwOnBatchFailure = (action: string, results: readonly BatchResult[]): void => {
  if (!results.some((result: BatchResult): boolean => result.status === "failed")) return;
  throw new WorkspaceConfigError(`One or more repositories failed during ${action}`, {
    details: { action, repositories: results.map(batchJson) },
  });
};

export const prepareRepositoryClone = async (
  names: readonly string[],
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const selections = await resolveBatchSelections(context.cwd, names);
  const planned: BatchResult[] = [];
  for (const selection of selections) {
    planned.push(
      selection.target === undefined
        ? missingSelection(selection)
        : await cloneTarget(selection.target, false),
    );
  }
  return {
    preview: { action: "clone-repositories", repositories: planned.map(batchJson) },
    commit: async (): Promise<JsonOutput> => {
      const results: BatchResult[] = [];
      for (const selection of selections) {
        results.push(
          selection.target === undefined
            ? missingSelection(selection)
            : await cloneTarget(selection.target, true),
        );
      }
      throwOnBatchFailure("clone-repositories", results);
      return {
        success: true,
        action: "clone-repositories",
        repositories: results.map(batchJson),
      };
    },
  };
};

interface GitWorktree {
  readonly branch?: string | undefined;
  readonly path: string;
}

const parseWorktrees = (porcelain: string): readonly GitWorktree[] =>
  porcelain
    .trim()
    .split(/\r?\n\r?\n/gu)
    .filter((record: string): boolean => record !== "")
    .map((record: string): GitWorktree => {
      const lines = record.split(/\r?\n/gu);
      const worktreeLine = lines.find((line: string): boolean => line.startsWith("worktree "));
      if (worktreeLine === undefined) {
        throw new WorkspaceConfigError("Invalid git worktree list --porcelain output", {});
      }
      const branchLine = lines.find((line: string): boolean => line.startsWith("branch "));
      const branch = branchLine?.slice("branch refs/heads/".length);
      return {
        path: path.resolve(worktreeLine.slice("worktree ".length)),
        ...(branch === undefined ? {} : { branch }),
      };
    });

const repositoryStatus = async (target: RepositoryTarget): Promise<JsonValue> => {
  const { repository, repositoryPath } = target;
  if (!(await exists(repositoryPath))) {
    return {
      name: repository.name,
      path: repositoryPath,
      baseBranch: repository.branch,
      status: "not-materialized",
      worktrees: [],
    };
  }
  try {
    const inside = (
      await runGit(["-C", repositoryPath, "rev-parse", "--is-inside-work-tree"])
    ).trim();
    if (inside !== "true") throw new Error(`Not a Git repository: ${repositoryPath}`);
    const dirty = (await runGit(["-C", repositoryPath, "status", "--porcelain"])).trim() !== "";
    const branch = (await runGit(["-C", repositoryPath, "branch", "--show-current"])).trim();
    const worktrees = parseWorktrees(
      await runGit(["-C", repositoryPath, "worktree", "list", "--porcelain"]),
    );
    const remoteReference = `refs/remotes/origin/${repository.branch}`;
    const hasRemote =
      (await runGit(["-C", repositoryPath, "show-ref", "--verify", remoteReference]).catch(
        (): string => "",
      )) !== "";
    const counts = hasRemote
      ? (
          await runGit([
            "-C",
            repositoryPath,
            "rev-list",
            "--left-right",
            "--count",
            `HEAD...origin/${repository.branch}`,
          ])
        )
          .trim()
          .split(/\s+/u)
          .map(Number)
      : [0, 0];
    return {
      name: repository.name,
      path: repositoryPath,
      baseBranch: repository.branch,
      branch,
      dirty,
      ahead: counts[0] ?? 0,
      behind: counts[1] ?? 0,
      status: "materialized",
      worktrees: worktrees.map(
        (worktree: GitWorktree): JsonValue => ({
          path: worktree.path,
          ...(worktree.branch === undefined ? {} : { branch: worktree.branch }),
        }),
      ),
    };
  } catch (error) {
    return {
      name: repository.name,
      path: repositoryPath,
      baseBranch: repository.branch,
      status: "failed",
      reason: errorMessage(error),
      worktrees: [],
    };
  }
};

export const statusRepositories = async (
  names: readonly string[],
  context: InvocationContext,
): Promise<JsonOutput> => {
  const targets = await resolveTargets(context.cwd, names);
  const repositories: JsonValue[] = [];
  for (const target of targets) repositories.push(await repositoryStatus(target));
  return {
    success: repositories.every(
      (repository: JsonValue): boolean =>
        typeof repository === "object" &&
        repository !== null &&
        !("status" in repository && repository["status"] === "failed"),
    ),
    action: "status-repositories",
    repositories,
  };
};

const pullTarget = async (target: RepositoryTarget, execute: boolean): Promise<BatchResult> => {
  const { repository, repositoryPath } = target;
  if (!(await exists(repositoryPath))) {
    return {
      name: repository.name,
      path: repositoryPath,
      status: "skipped",
      reason: `Repository is not materialized; run 'loopx workspace repository clone --name ${repository.name}'`,
    };
  }
  try {
    const dirty = (await runGit(["-C", repositoryPath, "status", "--porcelain"])).trim() !== "";
    if (dirty) {
      return {
        name: repository.name,
        path: repositoryPath,
        status: "skipped",
        reason: `Repository has uncommitted changes: ${repositoryPath}`,
      };
    }
    const branch = (await runGit(["-C", repositoryPath, "branch", "--show-current"])).trim();
    if (branch !== repository.branch) {
      return {
        name: repository.name,
        path: repositoryPath,
        status: "skipped",
        reason: `Primary clone is on '${branch}', expected '${repository.branch}'`,
      };
    }
    if (!execute) return { name: repository.name, path: repositoryPath, status: "pulled" };
    await runGit(["-C", repositoryPath, "fetch", "origin", repository.branch]);
    const head = (await runGit(["-C", repositoryPath, "rev-parse", "HEAD"])).trim();
    const remote = `origin/${repository.branch}`;
    const remoteHead = (await runGit(["-C", repositoryPath, "rev-parse", remote])).trim();
    if (head === remoteHead) {
      return { name: repository.name, path: repositoryPath, status: "pulled" };
    }
    if (await isAncestor(repositoryPath, remote, head)) {
      return {
        name: repository.name,
        path: repositoryPath,
        status: "skipped",
        reason: "Cannot fast-forward: the primary clone has local commits",
      };
    }
    if (!(await isAncestor(repositoryPath, head, remote))) {
      return {
        name: repository.name,
        path: repositoryPath,
        status: "skipped",
        reason: "Cannot fast-forward: the primary clone has diverged",
      };
    }
    await runGit(["-C", repositoryPath, "merge", "--ff-only", remote]);
    return { name: repository.name, path: repositoryPath, status: "pulled" };
  } catch (error) {
    return {
      name: repository.name,
      path: repositoryPath,
      status: "failed",
      reason: errorMessage(error),
    };
  }
};

export const prepareRepositoryPull = async (
  names: readonly string[],
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const selections = await resolveBatchSelections(context.cwd, names);
  const planned: BatchResult[] = [];
  for (const selection of selections) {
    planned.push(
      selection.target === undefined
        ? missingSelection(selection)
        : await pullTarget(selection.target, false),
    );
  }
  return {
    preview: { action: "pull-repositories", repositories: planned.map(batchJson) },
    commit: async (): Promise<JsonOutput> => {
      const results: BatchResult[] = [];
      for (const selection of selections) {
        results.push(
          selection.target === undefined
            ? missingSelection(selection)
            : await pullTarget(selection.target, true),
        );
      }
      throwOnBatchFailure("pull-repositories", results);
      return {
        success: true,
        action: "pull-repositories",
        repositories: results.map(batchJson),
      };
    },
  };
};

export interface RepositoryRemoveSelection {
  readonly force: boolean;
  readonly name: string;
  readonly yes: boolean;
}

const hasLocalOnlyHistory = async (repositoryPath: string): Promise<boolean> =>
  (
    await runGit(["-C", repositoryPath, "rev-list", "HEAD", "--all", "--not", "--remotes"])
  ).trim() !== "";

export const prepareRepositoryRemove = async (
  selection: RepositoryRemoveSelection,
  context: InvocationContext,
): Promise<PreparedMutation> => {
  if (!selection.yes) {
    throw new WorkspaceConfigError("repository remove requires --yes", {
      hint: "Re-run with --yes after verifying the resolved repository path",
    });
  }
  const [target] = await resolveTargets(context.cwd, [selection.name]);
  if (target === undefined) {
    throw new WorkspaceConfigError(`Repository not found: ${selection.name}`, {});
  }
  const { repository, repositoryPath, root } = target;
  if (!(await exists(repositoryPath))) {
    throw new WorkspaceConfigError(`Repository is not materialized: ${repository.name}`, {
      details: { name: repository.name, path: repositoryPath },
    });
  }
  const relative = path.relative(root, repositoryPath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WorkspaceConfigError(`Refusing to remove unsafe repository path: ${repositoryPath}`, {
      details: { name: repository.name, path: repositoryPath },
    });
  }
  await assertPhysicalPathWithinRoot(root, repositoryPath);
  const worktrees = parseWorktrees(
    await runGit(["-C", repositoryPath, "worktree", "list", "--porcelain"]),
  );
  if (worktrees.length > 1) {
    throw new WorkspaceConfigError(`Repository has additional worktrees: ${repository.name}`, {
      hint: "Remove every additional worktree before removing the repository clone",
      details: { name: repository.name, path: repositoryPath },
    });
  }
  const dirty = (await runGit(["-C", repositoryPath, "status", "--porcelain"])).trim() !== "";
  const localOnlyHistory = await hasLocalOnlyHistory(repositoryPath);
  if (!selection.force && (dirty || localOnlyHistory)) {
    throw new WorkspaceConfigError(`Repository has local data: ${repository.name}`, {
      hint: "Commit and push the local data, or re-run with --force",
      details: { name: repository.name, path: repositoryPath, dirty, localOnlyHistory },
    });
  }
  const preview: JsonValue = {
    action: "remove-repository",
    name: repository.name,
    path: repositoryPath,
    force: selection.force,
  };
  return {
    preview,
    commit: async (): Promise<JsonOutput> => {
      try {
        await assertPhysicalPathWithinRoot(root, repositoryPath);
        await rm(repositoryPath, { recursive: true });
      } catch (error) {
        workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
        throw error;
      }
      return { success: true, ...preview };
    },
  };
};
