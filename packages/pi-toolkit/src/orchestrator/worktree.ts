/**
 * worktree 派工：把一个 worker 放进 `.worktrees/<名字>`，分支 `wt/<名字>`。
 *
 * 为什么这么做：并行的两个 worker 改同一批文件时，靠“文件不重叠”就只是自觉；worktree
 * 给出真正的隔离 —— 改动只落在自己的目录，Plan（`notes.json`）仍由主工作区锚定，
 * 所以不会出现第二份真相。
 *
 * 依赖（用户 2026-11-07 口径）：**每个 worktree 自己 `pnpm install`**。实测（Windows，
 * 热 store）：`git worktree add` ≈ 1.5s / 98 MB；`pnpm install --prefer-offline` ≈ 13.5s，
 * `node_modules` 名义 894 MB 但实际增量 ≈ 183 MB（pnpm 硬链接 store）；装完
 * `pnpm test` 在 worktree 里 3.8s 跑完 372 项。安装失败**不静默**：调用方拿到
 * `ok: false` 与原因，由派工侧直接中止。
 *
 * 回收（Windows 坑）：`git worktree remove` 在长路径上会报 `Filename too long`
 * （node_modules 深路径），加 `-c core.longpaths=true` 后返回 0 但仍可能留几 MB 残留，
 * 所以这里**一定**再检查目录是否真的没了，必要时自己删，然后 `worktree prune`。
 * @module @kxh4892636/pi-toolkit/orchestrator/worktree
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** worktree 统一放在工作区的 `.worktrees/` 下（`AGENTS.md` 的约定）。 */
export const WORKTREE_ROOT = ".worktrees";
/** worktree 分支前缀。 */
export const WORKTREE_BRANCH_PREFIX = "wt/";

/** 一个 worktree 的定位信息。 */
export interface WorktreeInfo {
  readonly name: string;
  /** `.worktrees/<名字>` 的绝对路径。 */
  readonly directory: string;
  /** `wt/<名字>`。 */
  readonly branch: string;
  /** 本次是否新建（复用已有 worktree 时为 false，可跳过 `pnpm install`）。 */
  readonly created: boolean;
}

/** 装依赖的结果：失败必须带原因，调用方不许把它吞掉。 */
export interface InstallOutcome {
  readonly ok: boolean;
  readonly command: string;
  readonly durationMs: number;
  /** 失败原因；`ok: true` 时不填。 */
  readonly reason?: string;
}

/** 回收结果：`leftover` 为 true 表示目录还在，需要人手工处理。 */
export interface RemoveOutcome {
  readonly removed: boolean;
  readonly branchDeleted: boolean;
  readonly leftover: boolean;
  /** 过程中的异常说明（Windows 长路径等），成功也应留一句。 */
  readonly note: string;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 在指定目录里跑 git，返回 stdout（去掉尾部空白）。 */
const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const { stdout } = await run("git", [...args], { cwd, maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
};

/**
 * 规范化 worktree 名字：去掉路径分隔与危险字符，空名直接报错。
 *
 * 允许 CJK（分支名可以用），但不允许 `/`、`\`、空白成串与开头的 `.`/`-`。
 * @param raw - 用户给的名字。
 * @returns 可用的名字。
 */
export const sanitizeWorktreeName = (raw: string): string => {
  const name = raw
    .trim()
    .replace(/[\\/]+/gu, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[.-]+/u, "")
    .replace(/-+$/u, "");
  if (name === "") throw new Error(`worktree 名字无效: ${raw}`);
  return name;
};

/**
 * 自动命名：单 note → `note-<id>`，组 → `grp-<id-id>`，Plan 级 → `plan`。
 * @param notes - 这一组的 note id。
 * @returns worktree 名字。
 */
export const autoWorktreeName = (notes: readonly string[]): string => {
  const ids = notes.map((note) => sanitizeWorktreeName(note));
  if (ids.length === 0) return "plan";
  if (ids.length === 1) return `note-${ids[0] as string}`;
  return `grp-${ids.join("-")}`;
};

/**
 * worktree 对应的分支名。
 * @param name - worktree 名字。
 * @returns `wt/<名字>`。
 */
export const branchOfWorktree = (name: string): string => `${WORKTREE_BRANCH_PREFIX}${name}`;

/**
 * 建或复用 `.worktrees/<名字>`（分支 `wt/<名字>`，基线当前 HEAD）。
 *
 * 目录已存在就当复用：并行派同一组时不该互相删目录。
 * @param input - 工作区根与名字。
 * @returns 定位信息；`created` 说明是否新建。
 */
export const ensureWorktree = async (input: {
  readonly workspace: string;
  readonly name: string;
}): Promise<WorktreeInfo> => {
  const name = sanitizeWorktreeName(input.name);
  const directory = join(input.workspace, WORKTREE_ROOT, name);
  const branch = branchOfWorktree(name);
  if (existsSync(directory)) return { name, directory, branch, created: false };
  await git(input.workspace, ["worktree", "add", directory, "-b", branch, "HEAD"]);
  return { name, directory, branch, created: true };
};

/**
 * 在 worktree 里装依赖（用户口径：各自 `pnpm install`）。
 * @param directory - worktree 目录。
 * @param timeoutMs - 安装超时，默认 15 分钟。
 * @returns 结果；失败带原因，不抛。
 */
export const installDependencies = async (
  directory: string,
  timeoutMs = 15 * 60 * 1000,
): Promise<InstallOutcome> => {
  const command = "pnpm install --prefer-offline";
  const started = Date.now();
  try {
    await run("pnpm", ["install", "--prefer-offline"], {
      cwd: directory,
      maxBuffer: 8 * 1024 * 1024,
      timeout: timeoutMs,
    });
    return { ok: true, command, durationMs: Date.now() - started };
  } catch (error) {
    return { ok: false, command, durationMs: Date.now() - started, reason: describe(error) };
  }
};

/**
 * 回收 worktree 与分支。
 *
 * 顺序：`git worktree remove --force`（带 `core.longpaths`）→ 目录还在就自己删 →
 * `git worktree prune` → `git branch -D`。失败不抛，写进返回值，由调用方决定怎么提示。
 * @param input - 工作区根与名字。
 * @returns 回收结果。
 */
export const removeWorktree = async (input: {
  readonly workspace: string;
  readonly name: string;
}): Promise<RemoveOutcome> => {
  const name = sanitizeWorktreeName(input.name);
  const directory = join(input.workspace, WORKTREE_ROOT, name);
  const notes: string[] = [];
  try {
    await git(input.workspace, [
      "-c",
      "core.longpaths=true",
      "worktree",
      "remove",
      "--force",
      directory,
    ]);
  } catch (error) {
    notes.push(`git worktree remove 失败: ${describe(error)}`);
  }
  if (existsSync(directory)) {
    try {
      await rm(directory, { recursive: true, force: true, maxRetries: 5 });
      notes.push("目录有残留，已用 rm -rf 补删（Windows 长路径）");
    } catch (error) {
      notes.push(`补删目录失败: ${describe(error)}`);
    }
  }
  try {
    await git(input.workspace, ["worktree", "prune"]);
  } catch (error) {
    notes.push(`worktree prune 失败: ${describe(error)}`);
  }
  let branchDeleted = false;
  try {
    await git(input.workspace, ["branch", "-D", branchOfWorktree(name)]);
    branchDeleted = true;
  } catch (error) {
    notes.push(`删分支失败: ${describe(error)}`);
  }
  const leftover = existsSync(directory);
  return {
    removed: !leftover,
    branchDeleted,
    leftover,
    note: notes.length === 0 ? "已清理" : notes.join("；"),
  };
};

/** 派工侧需要的一组 worktree 操作（测试可整体替换）。 */
export interface WorktreeHooks {
  ensure(input: { readonly workspace: string; readonly name: string }): Promise<WorktreeInfo>;
  install(directory: string): Promise<InstallOutcome>;
  remove(input: { readonly workspace: string; readonly name: string }): Promise<RemoveOutcome>;
}

/** 默认实现：真的跑 git 与 pnpm。 */
export const DEFAULT_WORKTREE_HOOKS: WorktreeHooks = {
  ensure: ensureWorktree,
  install: (directory) => installDependencies(directory),
  remove: removeWorktree,
};
