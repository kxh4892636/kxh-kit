import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { command, group } from "../../cli/definition";
import type {
  BuiltinCommand,
  InvocationContext,
  JsonOutput,
  PreparedMutation,
} from "../../cli/types";
import { WORKSPACE_CONFIG_FILE, WorkspaceConfigError } from "./workspace-config";

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

const workspaceCommand: BuiltinCommand = group("workspace", "Manage multi-repository workspaces", [
  command("init", "Create an empty workspace.yaml in the current directory", [], {
    kind: "mutation",
    prepare: initPrepare,
  }),
]);

export default workspaceCommand;
