import { access, writeFile } from "node:fs/promises";
import { channel } from "node:diagnostics_channel";
import path from "node:path";
import { stringify } from "yaml";
import { command, group, option } from "../../cli/definition";
import { CliUsageError } from "../../cli/errors";
import type {
  BuiltinCommand,
  InvocationContext,
  JsonOutput,
  JsonValue,
  PreparedMutation,
  ValuesFromOptions,
} from "../../cli/types";
import {
  loadWorkspaceFile,
  prepareAddRepository,
  prepareRemoveRepository,
  prepareUpdateRepository,
  WORKSPACE_CONFIG_FILE,
  WorkspaceConfigError,
  type WorkspaceRepository,
} from "./workspace-config";
import { prepareWorkspacePull } from "./workspace-pull";
import { statusWorkspace } from "./workspace-query";
import {
  listWorkspaceWorktrees,
  prepareWorkspacePrune,
  prepareWorkspaceRemove,
  prepareWorkspaceSwitch,
} from "./workspace-worktree";

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

const initPrepare = async (
  _options: Readonly<Record<string, never>>,
  context: InvocationContext,
): Promise<PreparedMutation> => {
  const config = path.join(context.cwd, WORKSPACE_CONFIG_FILE);
  if (await exists(config)) {
    throw new WorkspaceConfigError(`${WORKSPACE_CONFIG_FILE} already exists at ${config}`, {});
  }
  return {
    preview: { action: "init", config },
    commit: async (): Promise<JsonOutput> => {
      await writeFile(config, stringify({ repositories: [] }), "utf8");
      return { success: true, root: context.cwd, config };
    },
  };
};

const addOptions = [
  option.string("name", "Unique repository name", { required: true }),
  option.string("url", "Repository ssh or http(s) url", { required: true }),
  option.string("path", "Clone path relative to the workspace root", { required: true }),
  option.string("branch", "Base branch pulled from the remote", { required: true }),
] as const;

const removeOptions = [
  option.string("name", "Name of the repository entry to remove", { required: true }),
] as const;

const configListOptions = [
  option.string("name", "Repository to list; repeat to list several; defaults to all", {
    multiple: true,
    placeholder: "name",
  }),
] as const;

const updateOptions = [
  option.string("name", "Repository entry to update", { required: true }),
  option.string("url", "Replacement repository ssh or http(s) url", {}),
  option.string("path", "Replacement clone path relative to the workspace root", {}),
  option.string("branch", "Replacement base branch", {}),
] as const;

const pullOptions = [
  option.string("name", "Repository to pull; repeat to pull several; defaults to all", {
    multiple: true,
    placeholder: "name",
  }),
  option.string(
    "path",
    "Worktree path relative to the workspace root; requires exactly one --name",
    {
      placeholder: "path",
    },
  ),
  option.string(
    "worktree-branch",
    "Branch for a newly created worktree; requires exactly one --name",
    {
      placeholder: "branch",
    },
  ),
] as const;

const worktreeListOptions = [
  option.string("name", "Repository to list; repeat to list several; defaults to all", {
    multiple: true,
    placeholder: "name",
  }),
] as const;

const worktreeSwitchOptions = [
  option.string("name", "Repository containing the worktree", { required: true }),
  option.string("path", "Worktree path relative to the workspace root", { required: true }),
  option.string("branch", "Branch to switch to or create", { required: true }),
  option.string("base", "Base for a newly created branch; defaults to the configured branch", {}),
] as const;

const worktreeRemoveOptions = [
  option.string("name", "Repository containing the worktree", { required: true }),
  option.string("path", "Worktree path relative to the workspace root", { required: true }),
  option.boolean("force", "Remove a dirty worktree", {}),
  option.boolean("delete-branch", "Delete the worktree branch after removal", {}),
] as const;

const listConfiguredRepositories = async (
  names: readonly string[],
  context: InvocationContext,
): Promise<JsonOutput> => {
  const config = await loadWorkspaceFile(context.cwd);
  const selected =
    names.length === 0
      ? config.repositories
      : [...new Set(names)].map((name: string): WorkspaceRepository => {
          const repository = config.repositories.find(
            (entry: WorkspaceRepository): boolean => entry.name === name,
          );
          if (repository === undefined) {
            throw new WorkspaceConfigError(
              `Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`,
              {
                details: { name },
              },
            );
          }
          return repository;
        });
  return {
    success: true,
    root: config.root,
    repositories: selected.map(
      (repository: WorkspaceRepository): JsonValue => ({
        name: repository.name,
        url: repository.url,
        path: repository.path,
        branch: repository.branch,
      }),
    ),
  };
};

const workspaceCommand: BuiltinCommand = group("workspace", "Manage multi-repository workspaces", [
  group("config", "Manage workspace.yaml repository entries", [
    command("init", "Create an empty workspace.yaml in the current directory", [], {
      kind: "mutation",
      prepare: initPrepare,
    }),
    command("add", "Add a repository entry to workspace.yaml", addOptions, {
      kind: "mutation",
      prepare: async (
        options: ValuesFromOptions<typeof addOptions>,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const prepared = await prepareAddRepository(context.cwd, {
          name: options.name,
          url: options.url,
          path: options.path,
          branch: options.branch,
        });
        const preview = {
          action: "add",
          change: prepared.change,
          repository: prepared.repository,
          config: prepared.config,
        };
        return {
          preview,
          commit: async (): Promise<JsonOutput> => {
            await prepared.commit();
            return { success: true, ...preview };
          },
        };
      },
    }),
    command("list", "List repository entries in workspace.yaml", configListOptions, {
      kind: "query",
      run: async (
        options: ValuesFromOptions<typeof configListOptions>,
        context: InvocationContext,
      ): Promise<JsonOutput> => listConfiguredRepositories(options.name ?? [], context),
    }),
    command("update", "Update a repository entry in workspace.yaml", updateOptions, {
      kind: "mutation",
      prepare: async (
        options: ValuesFromOptions<typeof updateOptions>,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        if (
          options.url === undefined &&
          options.path === undefined &&
          options.branch === undefined
        ) {
          throw new CliUsageError(
            "config update requires at least one of --url, --path or --branch",
          );
        }
        const prepared = await prepareUpdateRepository(context.cwd, options.name, {
          url: options.url,
          path: options.path,
          branch: options.branch,
        });
        const preview = {
          action: "update",
          repository: prepared.repository,
          config: prepared.config,
        };
        return {
          preview,
          commit: async (): Promise<JsonOutput> => {
            await prepared.commit();
            return { success: true, ...preview };
          },
        };
      },
    }),
    command("remove", "Remove a repository entry from workspace.yaml", removeOptions, {
      kind: "mutation",
      prepare: async (
        options: ValuesFromOptions<typeof removeOptions>,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const prepared = await prepareRemoveRepository(context.cwd, options.name);
        const preview = {
          action: "remove",
          removed: prepared.removed,
          config: prepared.config,
        };
        return {
          preview,
          commit: async (): Promise<JsonOutput> => {
            await prepared.commit();
            return { success: true, ...preview };
          },
        };
      },
    }),
  ]),
  command(
    "pull",
    "Materialize configured repositories and fast-forward them to their base branch",
    pullOptions,
    {
      kind: "mutation",
      prepare: async (
        options: ValuesFromOptions<typeof pullOptions>,
        context: InvocationContext,
      ): Promise<PreparedMutation> =>
        prepareWorkspacePull(
          {
            names: options.name ?? [],
            path: options.path,
            worktreeBranch: options["worktree-branch"],
          },
          context,
        ),
    },
  ),
  command("status", "Inspect clones and registered worktrees without fetching", [], {
    kind: "query",
    run: async (
      _options: Readonly<Record<string, never>>,
      context: InvocationContext,
    ): Promise<JsonOutput> => statusWorkspace(context),
  }),
  group("worktree", "Manage repository worktrees", [
    command("list", "List registered worktrees", worktreeListOptions, {
      kind: "query",
      run: async (
        options: ValuesFromOptions<typeof worktreeListOptions>,
        context: InvocationContext,
      ): Promise<JsonOutput> => listWorkspaceWorktrees(options.name ?? [], context),
    }),
    command("switch", "Switch a registered worktree to a branch", worktreeSwitchOptions, {
      kind: "mutation",
      prepare: async (
        options: ValuesFromOptions<typeof worktreeSwitchOptions>,
        context: InvocationContext,
      ): Promise<PreparedMutation> =>
        prepareWorkspaceSwitch(
          {
            name: options.name,
            path: options.path,
            branch: options.branch,
            base: options.base,
          },
          context,
        ),
    }),
    command("remove", "Remove a registered worktree", worktreeRemoveOptions, {
      kind: "mutation",
      prepare: async (
        options: ValuesFromOptions<typeof worktreeRemoveOptions>,
        context: InvocationContext,
      ): Promise<PreparedMutation> =>
        prepareWorkspaceRemove(
          {
            name: options.name,
            path: options.path,
            force: options.force ?? false,
            deleteBranch: options["delete-branch"] ?? false,
          },
          context,
        ),
    }),
    command("prune", "Prune stale worktree registrations", worktreeListOptions, {
      kind: "mutation",
      prepare: async (
        options: ValuesFromOptions<typeof worktreeListOptions>,
        context: InvocationContext,
      ): Promise<PreparedMutation> => prepareWorkspacePrune(options.name ?? [], context),
    }),
  ]),
]);

export default workspaceCommand;
