import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { command, group, option } from "../../cli/definition";
import type {
  BuiltinCommand,
  InvocationContext,
  JsonOutput,
  JsonValue,
  PreparedMutation,
} from "../../cli/types";
import {
  prepareRemoveRepository,
  prepareUpsertRepository,
  WORKSPACE_CONFIG_FILE,
  WORKSPACE_LOCAL_FILE,
  WorkspaceConfigError,
} from "./workspace-config";

const exists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
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
  option.string("path", "Worktree path relative to the workspace root", { required: true }),
  option.string("branch", "Base branch pulled from the remote", { required: true }),
] as const;

const removeOptions = [
  option.string("name", "Name of the repository entry to remove", { required: true }),
] as const;

const workspaceCommand: BuiltinCommand = group("workspace", "Manage multi-repository workspaces", [
  command("init", "Create an empty workspace.yaml in the current directory", [], {
    kind: "mutation",
    prepare: initPrepare,
  }),
  command("add", "Add or update a repository entry in workspace.yaml", addOptions, {
    kind: "mutation",
    prepare: async (options, context): Promise<PreparedMutation> => {
      const prepared = await prepareUpsertRepository(context.cwd, {
        name: options.name,
        url: options.url,
        path: options.path,
        branch: options.branch,
      });
      const preview: JsonValue = {
        action: "add",
        change: prepared.change,
        repository: prepared.repository,
        config: prepared.config,
      };
      return {
        preview,
        commit: async (): Promise<JsonOutput> => {
          await prepared.commit();
          return {
            success: true,
            change: prepared.change,
            repository: prepared.repository,
            config: prepared.config,
          };
        },
      };
    },
  }),
  command("remove", "Remove a repository entry from workspace.yaml", removeOptions, {
    kind: "mutation",
    prepare: async (options, context): Promise<PreparedMutation> => {
      const prepared = await prepareRemoveRepository(context.cwd, options.name);
      const residual =
        prepared.residualClonePath === undefined
          ? {}
          : {
              residualClonePath: prepared.residualClonePath,
              hint: `${WORKSPACE_LOCAL_FILE} still records clone_path for '${options.name}' at ${prepared.residualClonePath}; remove its worktrees and local clone manually, then clean up the record`,
            };
      return {
        preview: {
          action: "remove",
          removed: prepared.removed,
          config: prepared.config,
          ...residual,
        },
        commit: async (): Promise<JsonOutput> => {
          await prepared.commit();
          return {
            success: true,
            removed: prepared.removed,
            config: prepared.config,
            ...residual,
          };
        },
      };
    },
  }),
]);

export default workspaceCommand;
