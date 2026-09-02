import { access, realpath } from "node:fs/promises";
import { channel } from "node:diagnostics_channel";
import path from "node:path";
import { WorkspaceConfigError } from "./workspace-config";
import { errorMessage, hasErrorCode } from "./workspace-error";

const workspaceDiagnostics = channel("nnf.workspace");
export const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT", "ENOTDIR")) return false;
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
};

export const normalizeFsPath = (value: string): string => {
  const normalized = path.resolve(value.trim()).replace(/\\/gu, "/").replace(/\/+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

export const assertPhysicalPathWithinRoot = async (root: string, target: string): Promise<void> => {
  let physicalRoot: string;
  let physicalTarget: string;
  try {
    physicalRoot = await realpath(root);
    let existing = target;
    while (!(await pathExists(existing))) {
      const parent = path.dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
    physicalTarget = await realpath(existing);
  } catch (error) {
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
  const relative = path.relative(physicalRoot, physicalTarget);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new WorkspaceConfigError(`Path resolves outside the workspace: ${target}`, {
      details: { root, path: target },
    });
  }
};
