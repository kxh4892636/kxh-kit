import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import path from "node:path";
import { promisify } from "node:util";
import { errorDetail, errorMessage, hasErrorCode, WorkspaceConfigError } from "./workspace-error";

const execFileAsync = promisify(execFile);
const workspaceDiagnostics = channel("nnf.workspace");

/** 统一的 git 调用: 关闭 optional locks, 避免与用户自己的 git 进程抢锁。 */
const execGit = async (arguments_: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync("git", ["--no-optional-locks", ...arguments_]);
  return stdout;
};

/**
 * 生成一个 git 运行器: 成功返回 stdout, 失败时发布诊断并按调用方文案抛错。
 * 各工作流域的失败文案不同(worktree 操作与仓库检索面向不同命令), 因此由调用方给出。
 */
export const createGitRunner = (
  describeFailure: (arguments_: readonly string[], detail: string) => string,
  detailOf: (error: unknown) => string = errorDetail,
): ((arguments_: readonly string[]) => Promise<string>) => {
  return async (arguments_: readonly string[]): Promise<string> => {
    try {
      return await execGit(arguments_);
    } catch (error) {
      const detail = detailOf(error);
      workspaceDiagnostics.publish({ level: "error", message: detail });
      throw new Error(describeFailure(arguments_, detail));
    }
  };
};

/** git 退出码 1 表示「查询结果为否」(如 merge-base --is-ancestor), 不算执行失败。 */
export const gitSucceeds = async (arguments_: readonly string[]): Promise<boolean> => {
  try {
    await execGit(arguments_);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 1)) return false;
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
};

export interface GitWorktreeRecord {
  readonly branch?: string | undefined;
  readonly head?: string | undefined;
  readonly locked: boolean;
  readonly path: string;
  readonly prunable: boolean;
}

/**
 * 解析 `git worktree list --porcelain`: 记录之间空行分隔, 每行是 "键 值" 或单个标志。
 * `worktree` 行缺失说明输出不可信, 直接报错; HEAD 是否必需由调用方按用途决定。
 */
export const parseWorktreeList = (porcelain: string): readonly GitWorktreeRecord[] =>
  porcelain
    .trim()
    .split(/\r?\n\r?\n/gu)
    .filter((record: string): boolean => record !== "")
    .map((record: string): GitWorktreeRecord => {
      const values = new Map<string, string>();
      const flags = new Set<string>();
      for (const line of record.split(/\r?\n/gu)) {
        const separator = line.indexOf(" ");
        if (separator === -1) flags.add(line);
        else values.set(line.slice(0, separator), line.slice(separator + 1));
      }
      const worktreePath = values.get("worktree");
      if (worktreePath === undefined) {
        throw new WorkspaceConfigError("Invalid git worktree list --porcelain output", {});
      }
      const reference = values.get("branch");
      const branch = reference?.startsWith("refs/heads/")
        ? reference.slice("refs/heads/".length)
        : undefined;
      return {
        path: path.resolve(worktreePath),
        head: values.get("HEAD"),
        ...(branch === undefined ? {} : { branch }),
        locked: flags.has("locked") || values.has("locked"),
        prunable: flags.has("prunable") || values.has("prunable"),
      };
    });
