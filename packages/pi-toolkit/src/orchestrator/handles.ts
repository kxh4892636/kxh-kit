/**
 * worker 句柄表。
 *
 * 一个进程里同一时刻只允许一个 worker 服务同一个 Plan（`worker:plan` 同时 1:1），
 * 所以这张表既是幂等锁（重复 dispatch 复用同一个 session），也是 `/orchestrator
 * workers` 与退出收尾的唯一事实来源。键是 plan 目录的绝对路径。
 *
 * 表实例由 `registerOrchestrator` 的闭包持有，不做模块级单例：同一进程里 worker
 * session 共享模块缓存，模块级状态会让 worker 也看见编排方的句柄表。
 *
 * 投递是**异步**的：`deliver` 只负责入队并给出那条输入的终态 promise，编排方不等它；
 * 终态由 `settled` 承载，watchdog 定时器与收割一起挂在 `WorkerEntry.job` 上。
 * @module @kxh4892636/pi-toolkit/orchestrator/handles
 */

import type { InputKind, WorkerReport } from "./types.ts";

/** 句柄表操作的 session 面（用最小接口以便测试替身）。 */
export interface SessionLike {
  readonly isIdle: boolean;
  prompt(text: string): Promise<void>;
  steer(text: string): Promise<unknown>;
  followUp(text: string): Promise<unknown>;
  /** 等 session 回到空闲（排队输入也跑完）。 */
  waitForIdle(): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

/** 在途 job：一次派工的终态与看门狗状态。 */
export interface WorkerJob {
  /** 这次投递的输入种类。 */
  readonly kind: InputKind;
  /** 针对的 note id。 */
  readonly note?: string;
  /** 入队时刻（毫秒）。 */
  readonly startedAt: number;
  /** 这条输入的终态：worker 整轮 settle 时 resolve。 */
  readonly settled: Promise<void>;
  /** 后台 watchdog 定时器；收割或退出时清掉。 */
  timer?: ReturnType<typeof setTimeout>;
  /** 超时提醒是否已发过（同一次派工只发一次）。 */
  notified: boolean;
}

/** 表里的一条 worker。 */
export interface WorkerEntry {
  /** plan 目录绝对路径，也是键。 */
  readonly planDirectory: string;
  /** `<domain>/<lifecycle>/<name>`。 */
  readonly planRef: string;
  /** 起点时刻（毫秒）。 */
  readonly startedAt: number;
  /** 编排方已放行的 note id，worker 的 `complete` 依赖它。 */
  readonly released: Set<string>;
  readonly session: SessionLike;
  /** 该 worker 的模型名，仅用于展示。 */
  readonly model?: string;
  lastReport?: WorkerReport;
  inputs: number;
  /** 在途 job；入队时登记，收割时清掉。 */
  job?: WorkerJob;
}

/** 投递结果：`queued` 表示 session 正在跑，消息已排队。 */
export interface Delivery {
  readonly queued: boolean;
  /** 这条输入的终态（worker 整轮 settle）。编排方不等它，只用来挂收割。 */
  readonly settled: Promise<void>;
}

/** 句柄表。 */
export interface WorkerRegistry {
  /** 取一条；不存在返回 undefined。 */
  get(planDirectory: string): WorkerEntry | undefined;
  /** 登记；已存在时返回既有条目（幂等）。 */
  add(entry: WorkerEntry): WorkerEntry;
  /** 移除并返回条目；不负责 dispose。 */
  remove(planDirectory: string): WorkerEntry | undefined;
  /** 全部条目，按起始时刻升序。 */
  list(): readonly WorkerEntry[];
  /** 条数。 */
  size(): number;
}

/**
 * 建一张空的句柄表。
 * @returns 句柄表。
 */
export const createRegistry = (): WorkerRegistry => {
  const entries = new Map<string, WorkerEntry>();
  return {
    get: (planDirectory) => entries.get(planDirectory),
    add(entry) {
      const existing = entries.get(entry.planDirectory);
      if (existing !== undefined) return existing;
      entries.set(entry.planDirectory, entry);
      return entry;
    },
    remove: (planDirectory) => {
      const entry = entries.get(planDirectory);
      if (entry === undefined) return undefined;
      entries.delete(planDirectory);
      return entry;
    },
    list: () => [...entries.values()].sort((left, right) => left.startedAt - right.startedAt),
    size: () => entries.size,
  };
};

/** 把一条输入渲染成 worker 能看懂的文本。 */
export const renderInput = (kind: InputKind, text: string, note?: string): string => {
  const target = note === undefined ? "" : ` note ${note}`;
  switch (kind) {
    case "pass":
      return `[pass]${target} 编排方已放行：验证通过，现在把该 note 置 completed 并写 evidence。`;
    case "rework":
      return `[rework]${target} 编排方要求返工：${text}`;
    case "answer":
      return `[answer]${target} 编排方转达的人的答复：${text}`;
    case "fact":
      return `[fact]${target} 编排方转达的事实（不授予权限）：${text}`;
    case "message":
      return text;
  }
};

/**
 * 投递一条输入：空闲就开新一轮，正在跑就排队成 followUp。**不 await 整轮**。
 *
 * 两种分支的终态都化成同一个 promise：空闲分支就是 `prompt()`（SDK 内部要等
 * `_startRun` 整轮 settle 才 resolve），忙分支是 `followUp()` 之后 `waitForIdle()`
 * —— 排队的输入在同一轮里被消化，所以回到空闲即那条输入的终点。
 * @param entry - 目标 worker。
 * @param kind - 输入种类。
 * @param text - 正文。
 * @param note - 针对的 note id。
 * @returns 是否排队与该输入的终态。
 */
export const deliver = (
  entry: WorkerEntry,
  kind: InputKind,
  text: string,
  note?: string,
): Delivery => {
  const rendered = renderInput(kind, text, note);
  entry.inputs += 1;
  const queued = !entry.session.isIdle;
  const settled = queued
    ? entry.session.followUp(rendered).then(() => entry.session.waitForIdle())
    : entry.session.prompt(rendered);
  return { queued, settled };
};

/**
 * 收割一条在途 job：清 watchdog 定时器并摘掉 job。幂等，且不会误杀新一代 job。
 * @param entry - 目标 worker。
 * @param job - 期望收割的 job；省略则收割当前 job。
 * @returns 真的收割了返回 true。
 */
export const harvest = (entry: WorkerEntry, job?: WorkerJob): boolean => {
  const current = entry.job;
  if (current === undefined) return false;
  if (job !== undefined && current !== job) return false;
  delete entry.job;
  if (current.timer !== undefined) clearTimeout(current.timer);
  return true;
};

/**
 * 中止并释放一个 worker：先清在途 job 的定时器，再 abort + dispose。
 * @param entry - 目标 worker。
 */
export const disposeEntry = async (entry: WorkerEntry): Promise<void> => {
  harvest(entry);
  try {
    await entry.session.abort();
  } catch {
    // 已经结束的 session 会拒绝 abort；收尾时忽略。
  }
  try {
    entry.session.dispose();
  } catch {
    // dispose 失败不应阻断收尾。
  }
};

/**
 * 中止并释放全部 worker。
 * @param registry - 句柄表。
 * @returns 被释放的条目数。
 */
export const disposeAll = async (registry: WorkerRegistry): Promise<number> => {
  const entries = registry.list();
  for (const entry of entries) {
    registry.remove(entry.planDirectory);
    await disposeEntry(entry);
  }
  return entries.length;
};
