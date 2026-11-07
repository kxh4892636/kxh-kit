/**
 * worktree 现场：**一个组一个现场**，放在 `.worktrees/<组键>`，分支 `wt/<组键>`。
 *
 * 为什么这么做：并行的两个组改同一批文件时，靠“文件不重叠”就只是自觉；worktree
 * 给出真正的隔离 —— 改动只落在自己的目录，Plan（`notes.json`）仍由主工作区锚定，
 * 所以不会出现第二份真相。
 *
 * 现场的生命周期跟着**组**，不跟着某一代 worker：第一次派工该组时建一次、装一次依赖，
 * 之后 `abort` / `rework` / `resume` / 追加 `steer` 都共用同一现场；组内 note 全部
 * completed 后代码 `--ff-only` 合并成功才删现场与分支。`abort` / 超时**不动**现场。
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
 *
 * 合并（`mergeWorktree`）：组内 note 全 completed 后由代码直接做 `--ff-only` 合并，不经模型 ——
 * 收工信号的最后一跳不该再排队等一个 LLM 回合。只在主分支可 fast-forward 时合并，
 * 分叉 / 冲突 / 主工作区脏一律不合并，现场（目录 + 分支）原样保留等人工。
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

/**
 * 合并结果。
 *
 * `merged: false` 时**不删** worktree、**不删**分支：现场留给编排方或人看（rework 还要用），
 * 所以 `directory` 一定是真实存在的路径。
 */
export interface MergeOutcome {
  readonly merged: boolean;
  /** `wt/<名字>`。 */
  readonly branch: string;
  /** `.worktrees/<名字>` 的绝对路径。 */
  readonly directory: string;
  /** 合并后的主分支 HEAD（`merged: true` 才有）。 */
  readonly commit?: string;
  /** 回收说明（目录残留、分支删除失败等）；`merged: true` 时填。 */
  readonly cleanup?: string;
  /** 没合并的原因：分叉、merge 报错、主工作区脏导致拒绝；`merged: false` 时填。 */
  readonly reason?: string;
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
 * 组键 = 现场名字：单 note 组 → `note-<id>`，多 note 组 → `grp-<id-id>`。
 *
 * 没有组（Plan 级派工 / 临时 worker）就没有现场，所以空数组返回 undefined —— 这样
 * 调用方不必再判断“该不该建”，只看有没有名字。
 * @param notes - 这一组的 note id。
 * @returns worktree 名字；空组 undefined。
 */
export const groupWorktreeName = (notes: readonly string[]): string | undefined => {
  const ids = [...new Set(notes)].map((note) => sanitizeWorktreeName(note));
  if (ids.length === 0) return undefined;
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
 * 目录已存在就当复用：现场属于**组**，同组的后续派工（abort 后重派 / rework / resume）
 * 必须落回同一个目录，不能互相删。
 * @param input - 工作区根与名字。
 * @returns 定位信息；`created` 说明是否新建（只有新建才装依赖）。
 */
export const ensureWorktree = async (input: {
  readonly workspace: string;
  readonly name: string;
}): Promise<WorktreeInfo> => {
  const name = sanitizeWorktreeName(input.name);
  const directory = join(input.workspace, WORKTREE_ROOT, name);
  const branch = branchOfWorktree(name);
  if (existsSync(directory)) return { name, directory, branch, created: false };
  try {
    await git(input.workspace, ["worktree", "add", directory, "-b", branch, "HEAD"]);
  } catch (error) {
    // 目录被删而分支还在（手工清理 / 合并回收半途）：直接把它挂回来，不重复建分支。
    if (!/already exists/iu.test(describe(error))) throw error;
    await git(input.workspace, ["worktree", "prune"]);
    await git(input.workspace, ["worktree", "add", directory, branch]);
  }
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

/** git 的 lock 类错误：另一个 git 进程短暂抢占时值得小退避重试，别把合并判死。 */
const LOCK_PATTERN = /index\.lock|cannot lock ref|Unable to create .*lock/iu;

/** 合并的 lock 重试次数与退避基数（毫秒）。 */
const MERGE_LOCK_RETRIES = 3;
const MERGE_LOCK_BACKOFF_MS = 50;

/**
 * lock 类错误重试：只在命中 lock 特征时退避重试，其它错误立刻抛给调用方。
 * @param task - 要跑的命令。
 * @returns 命令结果。
 */
const withLockRetry = async <T>(task: () => Promise<T>): Promise<T> => {
  let last: unknown;
  for (let attempt = 1; attempt <= MERGE_LOCK_RETRIES; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      last = error;
      if (attempt === MERGE_LOCK_RETRIES || !LOCK_PATTERN.test(describe(error))) break;
      await new Promise((resolve) => setTimeout(resolve, MERGE_LOCK_BACKOFF_MS * attempt));
    }
  }
  throw last;
};

/**
 * 合并必须串行：同一进程同一时刻只允许一个 merge（`index.lock` 抢不过就白等）。
 *
 * 串行化的另一层意义：前一个合并会把主分支往前推，后一个才能在最新主分支上判
 * “可 ff-only”。并行跑两个 `git merge` 会互相当成脏 / 抢锁。
 */
let mergeQueue: Promise<void> = Promise.resolve();

const serialize = <T>(task: () => Promise<T>): Promise<T> => {
  const result = mergeQueue.then(task, task);
  mergeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

/** `ancestor` 是不是 `descendant` 的祖先（`git merge-base --is-ancestor`）。 */
const isAncestor = async (cwd: string, ancestor: string, descendant: string): Promise<boolean> => {
  try {
    await git(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
};

/**
 * 把 worktree 自动合并回主工作区：只在可 fast-forward 时合并，然后回收目录与分支。
 *
 * 判定（任一不成立就不合并，现场原样保留）：
 * 1. 主分支当前 HEAD 是 `wt/<名字>` 的祖先，或两者相同（否则主分支已经分叉）；
 * 2. `git merge --ff-only` 成功（主工作区脏、文件冲突等都会在这里失败）。
 *
 * lock 类错误小退避重试；整个合并串行执行（见 `serialize`）。
 * @param input - 工作区根与名字（`branch` 只用于调用方对齐，实际由名字推导）。
 * @returns 合并结果；失败不抛，原因写进 `reason`。
 */
export const mergeWorktree = (input: {
  readonly workspace: string;
  readonly name: string;
}): Promise<MergeOutcome> => serialize(() => mergeOnce(input));

const mergeOnce = async (input: {
  readonly workspace: string;
  readonly name: string;
}): Promise<MergeOutcome> => {
  const name = sanitizeWorktreeName(input.name);
  const directory = join(input.workspace, WORKTREE_ROOT, name);
  const branch = branchOfWorktree(name);
  const blocked = (reason: string): MergeOutcome => ({ merged: false, branch, directory, reason });
  let mainHead: string;
  try {
    mainHead = await withLockRetry(() => git(input.workspace, ["rev-parse", "HEAD"]));
  } catch (error) {
    return blocked(`读不到主分支 HEAD：${describe(error)}`);
  }
  let tip: string;
  try {
    tip = await withLockRetry(() => git(input.workspace, ["rev-parse", branch]));
  } catch (error) {
    return blocked(`读不到分支 ${branch}：${describe(error)}`);
  }
  if (mainHead !== tip && !(await isAncestor(input.workspace, mainHead, branch))) {
    return blocked(
      `主分支已有自己的提交（${mainHead.slice(0, 8)} 不是 ${branch} 的祖先），不能 --ff-only；现场保留在 ${directory}`,
    );
  }
  try {
    await withLockRetry(() => git(input.workspace, ["merge", "--ff-only", branch]));
  } catch (error) {
    return blocked(`git merge --ff-only ${branch} 失败：${describe(error)}`);
  }
  let commit: string | undefined;
  try {
    commit = await withLockRetry(() => git(input.workspace, ["rev-parse", "HEAD"]));
  } catch {
    commit = undefined;
  }
  // 合并成功后立刻回收：目录还在会让下次派工误以为隔离目录可用。
  const removed = await removeWorktree({ workspace: input.workspace, name });
  return {
    merged: true,
    branch,
    directory,
    ...(commit === undefined ? {} : { commit }),
    cleanup: removed.note,
  };
};

/** 派工侧需要的一组 worktree 操作（测试可整体替换）。 */
export interface WorktreeHooks {
  ensure(input: { readonly workspace: string; readonly name: string }): Promise<WorktreeInfo>;
  install(directory: string): Promise<InstallOutcome>;
  remove(input: { readonly workspace: string; readonly name: string }): Promise<RemoveOutcome>;
  /**
   * 组内 note 全 completed 后自动合并回主工作区（代码执行，不经模型）。
   *
   * 失败只返回 `merged: false` + 原因：**不删** worktree、**不删**分支，现场留给 rework 或人。
   */
  merge(input: {
    readonly workspace: string;
    readonly name: string;
    readonly branch: string;
  }): Promise<MergeOutcome>;
}

/** 默认实现：真的跑 git 与 pnpm。 */
export const DEFAULT_WORKTREE_HOOKS: WorktreeHooks = {
  ensure: ensureWorktree,
  install: (directory) => installDependencies(directory),
  remove: removeWorktree,
  merge: (input) => mergeWorktree(input),
};
