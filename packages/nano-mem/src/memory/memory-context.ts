import { CliError, CliErrorKind } from "../cli-error.js";
import { ProcessExecutionError, type RuntimeDependencies } from "../runtime.js";

export interface MemoryContext {
  dataDirectory: string;
  databasePath: string;
  projectId: string;
}

const dataDirectory = (runtime: RuntimeDependencies): string => {
  const configured = runtime.environment["NANO_MEM_HOME"]?.trim();
  if (configured) return runtime.paths.resolve(configured);
  if (runtime.paths.platform === "win32") {
    const localData = runtime.environment["LOCALAPPDATA"]?.trim();
    return runtime.paths.join(
      localData || runtime.paths.join(runtime.paths.home, "AppData", "Local"),
      "nano-mem",
    );
  }
  if (runtime.paths.platform === "darwin") {
    return runtime.paths.join(runtime.paths.home, "Library", "Application Support", "nano-mem");
  }
  const xdgData = runtime.environment["XDG_DATA_HOME"]?.trim();
  return runtime.paths.join(
    xdgData || runtime.paths.join(runtime.paths.home, ".local", "share"),
    "nano-mem",
  );
};

const explicitProject = (project: string | undefined): string | undefined => {
  if (project === undefined) return undefined;
  const normalized = project.trim();
  if (normalized === "") {
    throw new CliError("INVALID_PROJECT", "Project override cannot be empty.", CliErrorKind.usage);
  }
  return normalized;
};

const defaultProject = async (runtime: RuntimeDependencies): Promise<string> => {
  try {
    const result = await runtime.processExecutor.execute({
      argumentsList: ["-C", runtime.paths.cwd, "rev-parse", "--show-toplevel"],
      command: "git",
      cwd: runtime.paths.cwd,
    });
    const root = result.stdout.trim();
    if (root !== "") return runtime.paths.basename(root);
  } catch (error) {
    if (error instanceof ProcessExecutionError && /not a git repository/iu.test(error.stderr)) {
      return runtime.paths.basename(runtime.paths.cwd);
    }
    throw new CliError(
      "PROJECT_RESOLUTION_FAILED",
      "Unable to resolve the Git project root.",
      CliErrorKind.runtime,
      "Check that Git is installed and the current repository is accessible.",
    );
  }
  return runtime.paths.basename(runtime.paths.cwd);
};

export const resolveMemoryContext = async (
  runtime: RuntimeDependencies,
  project?: string,
): Promise<MemoryContext> => {
  const directory = dataDirectory(runtime);
  return {
    dataDirectory: directory,
    databasePath: runtime.paths.join(directory, "nano-mem.db"),
    projectId: explicitProject(project) ?? (await defaultProject(runtime)),
  };
};
