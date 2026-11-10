/**
 * Plan 轨迹落盘：把每次 run（一次用户输入到代理停手）新增的会话条目，原样复制到
 * `<plan>/log.jsonl` 的一行里。
 *
 * 为什么是「复制」而不是另造 compact 摘要：pi 的会话 JSONL 已经是权威轨迹，这里只做
 * Plan 级别的归档，条目 `id` / `timestamp` / `message` 全部保持原样，便于与源会话对齐、
 * 也便于按 `id` 去重。写入只在 run 结束（`agent_end`）发生一次，不做逐条实时写。
 * 文件落在 plan 目录，但被 `.gitignore` 的 `**\/plans/**\/log.jsonl` 排除，不进版本库。
 * @module @kxh4892636/pi-toolkit/nano-flow/log
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Plan 轨迹文件名：与 spec.md 同级。 */
export const PLAN_LOG_FILE = "log.jsonl";

/** 轨迹记录版本。 */
const RECORD_VERSION = 1;

/** 我们写出的 run 记录固定以它开头（`type` 是 `buildRunRecord` 的第一个键）。 */
const RUN_LINE_PREFIX = '{"type":"run"';

/** 定位 Plan 目录下的 log.jsonl。 */
export const planLogPath = (planDirectory: string): string => join(planDirectory, PLAN_LOG_FILE);

/** 一条 run 记录：`{ type: "run", ... }`。 */
export interface RunRecord {
  readonly type: "run";
  readonly v: typeof RECORD_VERSION;
  readonly sessionId: string;
  /** 源会话文件路径；会话未落盘时为空。 */
  readonly sessionFile: string;
  /** 工作区根，用于把 `planPath` 还原成目录。 */
  readonly cwd: string;
  /** 相对 `cwd` 的 Plan 目录。 */
  readonly planPath: string;
  /** 本 Plan 轨迹里的第几次 run（1 起）。 */
  readonly run: number;
  /** run 开始 / 结束的 ISO 时间。 */
  readonly startedAt: string;
  readonly endedAt: string;
  /** 本次 run 新增的会话条目，原样复制。 */
  readonly entries: readonly unknown[];
}

/** 构造一条 run 记录（`run` 由调用方按已有轨迹编号）。 */
export const buildRunRecord = (options: {
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly cwd: string;
  readonly planPath: string;
  readonly run: number;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly entries: readonly unknown[];
}): RunRecord => ({
  type: "run",
  v: RECORD_VERSION,
  sessionId: options.sessionId,
  sessionFile: options.sessionFile,
  cwd: options.cwd,
  planPath: options.planPath,
  run: options.run,
  startedAt: new Date(options.startedAt).toISOString(),
  endedAt: new Date(options.endedAt).toISOString(),
  entries: options.entries,
});

/**
 * 取 run 期间新增的分支条目。
 *
 * `mark` 是 run 开始时的叶子条目 id：返回它之后的全部条目。`mark` 缺失（新会话、
 * 或在 `/tree` 里换过分支）时退化为「当前分支最后一个条目之后」，即空列表 —— 宁可
 * 少记一条，也不把历史重记一遍。
 * @param entries - 当前分支条目（按时间顺序）。
 * @param mark - run 开始时的叶子 id。
 * @returns 新增条目。
 */
export const entriesSince = <T extends { readonly id?: string }>(
  entries: readonly T[],
  mark: string | undefined,
): readonly T[] => {
  if (entries.length === 0) return [];
  if (mark === undefined) return [];
  const at = entries.findIndex((entry) => entry.id === mark);
  return at === -1 ? [] : entries.slice(at + 1);
};

/**
 * 数一下已有轨迹里的 run 条数：用于给新记录编号。
 *
 * `buildRunRecord` 的 `type` 是第一个键，所以我们的每条记录都以固定前缀开头。
 * 轨迹文件只追加，而一条 run 记录里带着整轮会话条目（本仓实测单个 Plan 已有 3.5 MB），
 * 逐行 JSON.parse 只为数个数会把轮末变慢，且开销随 Plan 年龄变大。
 * @param raw - 轨迹文件全文。
 */
export const countRuns = (raw: string): number => {
  let count = 0;
  for (const line of raw.split("\n")) {
    if (line.startsWith(RUN_LINE_PREFIX)) count += 1;
  }
  return count;
};

/** 读已有轨迹的 run 数；文件不存在时 0。 */
export const runCountOf = async (file: string): Promise<number> => {
  try {
    return countRuns(await readFile(file, "utf8"));
  } catch {
    return 0;
  }
};

/** 追加一条 run 记录（先建目录）。 */
export const appendRunRecord = async (file: string, record: RunRecord): Promise<void> => {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
};

/**
 * 串行化的追加队列：同一进程里多个 run 同时结束时不交错写同一文件。
 * @param file - 目标文件。
 * @param build - 读已有条数并构造记录的异步函数。
 */
export const enqueueAppend = (
  file: string,
  build: (run: number) => Promise<RunRecord>,
): Promise<void> => {
  const next = pending.get(file) ?? Promise.resolve();
  const task = next
    .catch(() => undefined)
    .then(async () => {
      const run = (await runCountOf(file)) + 1;
      await appendRunRecord(file, await build(run));
    });
  pending.set(file, task);
  return task.finally(() => {
    if (pending.get(file) === task) pending.delete(file);
  });
};

const pending = new Map<string, Promise<void>>();
