/**
 * worker 句柄表。
 *
 * 句柄表的键是 **worker 的路由键**：`<plan 目录绝对路径>::<组标识>`，或临时 worker 的
 * `temp:<id>`。一个 Plan 可以同时挂多个 worker（一组无依赖 note 一个），所以同一目录
 * 会有多条条目；组标识省略时是 `<目录>::`，即老的单 worker-per-plan 路径。键既是幂等锁
 * （同一组重复 dispatch 复用同一个 session），也是 `/orchestrator workers` 与退出收尾的
 * 唯一事实来源。
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
  /**
   * 订阅会话事件（侧边栏的实时流用）；返回退订阅函数。
   *
   * 可选：测试替身与老路径的 session 不一定实现，读不到就不展示流。
   */
  subscribe?(listener: (event: unknown) => void): () => void;
}

/** 在途 job：一次派工的终态与看门狗状态。 */
export interface WorkerJob {
  /** 这次投递的输入种类。 */
  readonly kind: InputKind;
  /** 针对的 note id。 */
  readonly note?: string;
  /** 该 job 所属的组（空数组 = Plan 级派工）。 */
  readonly notes?: readonly string[];
  /** 入队时刻（毫秒）。 */
  readonly startedAt: number;
  /** 最近一次算作进展的时刻（毫秒）：入队或 `renew` 时刷新，展示与调试用。 */
  progressAt: number;
  /** 这条输入的终态：worker 整轮 settle 时 resolve。 */
  readonly settled: Promise<void>;
  /** 后台 watchdog 定时器；收割或退出时清掉。 */
  timer?: ReturnType<typeof setTimeout>;
  /** 超时提醒是否已发过（同一次派工只发一次）。 */
  notified: boolean;
}

/** worker 形态：绑定 Plan，或没有 Plan 的一次性临时 worker。 */
export type WorkerKind = "plan" | "temp";

/**
 * 投递方式，与输入种类正交：
 *
 * - `queue`（默认）：追加成 `followUp`，当前轮跑完再消化；
 * - `steer`：插入当前运行，worker 下一次 LLM 调用前就换上新的方向。
 *
 * worker 空闲时 `steer` 没有可插入的运行，退化为直接开新一轮（`prompt`），
 * 返回值里的 `delivered` 会标成 `prompt`。
 */
export const DELIVERY_MODES = ["queue", "steer"] as const;

/** 投递方式类型。 */
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** 最近一次输入的摘要长度上限：清单要能一眼看完，长文留在消息正文里。 */
export const LAST_INPUT_SUMMARY_MAX = 60;

/** 一条输入的留痕：谁在什么时候、以什么方式说了什么（只有摘要）。 */
export interface LastInput {
  readonly kind: InputKind;
  readonly delivery: DeliveryMode;
  /** 渲染后正文的摘要（折叠换行、超长截断）。 */
  readonly text: string;
  /** 投递时刻（毫秒）。 */
  readonly at: number;
}

/** 表里的一条 worker。 */
export interface WorkerEntry {
  /** 路由键，也是键：plan 目录绝对路径，或临时 worker 的 `temp:<id>`。 */
  readonly planDirectory: string;
  /** 展示用标识：`<domain>/<lifecycle>/<name>`，临时 worker 为 `temp:<id>`。 */
  readonly planRef: string;
  /** worker 形态；缺省视作 `plan`。 */
  readonly kind?: WorkerKind;
  /** 本 worker 领的 note 组；空数组表示 Plan 级（未分组）派工。 */
  readonly notes?: readonly string[];
  /** 起点时刻（毫秒）。 */
  readonly startedAt: number;
  /** 编排方已放行的 note id，worker 的 `complete` 依赖它。 */
  readonly released: Set<string>;
  readonly session: SessionLike;
  /** 会话文件路径（jsonl）；子 worker 与老路径可能没有。 */
  readonly sessionPath?: string;
  /** 该 worker 的模型名，仅用于展示。 */
  readonly model?: string;
  lastReport?: WorkerReport;
  /** 最近一次投递给它的输入（摘要 + 时刻），供编排方判断该不该插话。 */
  lastInput?: LastInput;
  inputs: number;
  /** 在途 job；入队时登记，收割时清掉。 */
  job?: WorkerJob;
}

/** 实际投递落到的分支：空闲开新一轮 / 排队等当前轮 / 插入当前运行。 */
export type DeliveredAs = "prompt" | "queued" | "steered";

/** 投递结果：`queued` 表示 session 正在跑，消息没有立刻开新一轮。 */
export interface Delivery {
  readonly queued: boolean;
  /** 编排方要求的投递方式。 */
  readonly mode: DeliveryMode;
  /** 实际落到哪条分支；`steer` 在空闲时退化为 `prompt`。 */
  readonly delivered: DeliveredAs;
  /** 这条输入的终态（worker 整轮 settle）。编排方不等它，只用来挂收割。 */
  readonly settled: Promise<void>;
}

/** 句柄键的分隔符：`<plan 目录或 temp:<id>>::<组标识>`。 */
const KEY_SEPARATOR = "::";

/**
 * 组的规范化标识：note id 排序后拼接，所以同一批 note 无论传入顺序如何都是同一组。
 * @param notes - 组内 note id。
 * @returns 组标识；空数组给空串（Plan 级派工）。
 */
export const groupKeyOf = (notes: readonly string[]): string => [...notes].sort().join(",");

/**
 * 算一条 worker 的路由键。
 *
 * 一个 Plan 可以有多个 worker（一组一个），所以键 = plan 目录 + 组标识；没给组时为
 * `<目录>::`，即老的单 worker-per-plan 路径（向后兼容）。
 * @param planDirectory - plan 目录绝对路径，或临时 worker 的 `temp:<id>`。
 * @param notes - 组内 note id；省略表示 Plan 级派工。
 * @returns 句柄表的键。
 */
export const entryKeyOf = (planDirectory: string, notes: readonly string[] = []): string => {
  return `${planDirectory}${KEY_SEPARATOR}${groupKeyOf(notes)}`;
};

/**
 * 判断一个键是否属于某个 plan 目录（同一个 Plan 的任意组）。
 * @param key - 句柄键。
 * @param planDirectory - plan 目录绝对路径。
 * @returns 属于该 Plan 返回 true。
 */
export const keyBelongsToPlan = (key: string, planDirectory: string): boolean => {
  return key.startsWith(`${planDirectory}${KEY_SEPARATOR}`);
};

/** 把一条路由键还原成 Plan 目录：`<目录>::<组标识>` → `<目录>`；临时键原样返回。 */
export const planDirectoryOf = (key: string): string => {
  const at = key.indexOf(KEY_SEPARATOR);
  return at < 0 ? key : key.slice(0, at);
};

/** 句柄表。 */
export interface WorkerRegistry {
  /** 按路由键取一条；不存在返回 undefined。 */
  get(planDirectory: string): WorkerEntry | undefined;
  /** 登记；已存在时返回既有条目（幂等）。 */
  add(entry: WorkerEntry): WorkerEntry;
  /** 按路由键移除并返回条目；不负责 dispose。 */
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
 * 把一条输入压成一句话摘要：折叠换行与连续空白，超长截断，供清单展示。
 * @param text - 任意正文。
 * @returns 一行摘要。
 */
export const summarizeInput = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= LAST_INPUT_SUMMARY_MAX ? flat : `${flat.slice(0, LAST_INPUT_SUMMARY_MAX)}…`;
};

/**
 * 投递一条输入：空闲就开新一轮；正在跑时按 `delivery` 排队（`followUp`）或插话
 * （`steer`）。**不 await 整轮**。
 *
 * 三条分支的终态都化成同一个 promise：空闲分支就是 `prompt()`（SDK 内部要等
 * `_startRun` 整轮 settle 才 resolve）；忙分支是 `followUp()` / `steer()` 之后
 * `waitForIdle()` —— 排队的输入在同一轮里被消化，插话的输入在当前轮生效，所以
 * 回到空闲即那条输入的终点。
 *
 * `steer` 面向的是流式中的运行，空闲时没有可插入的位置，因此退化为 `prompt()`
 * 并在返回值里标成 `delivered: "prompt"`。`nextTurn` 不落盘、进程退出即丢，不用。
 * @param entry - 目标 worker。
 * @param kind - 输入种类。
 * @param text - 正文。
 * @param note - 针对的 note id。
 * @param mode - 投递方式，默认 `queue`（不打断当前轮）。
 * @returns 是否排队、实际分支与该输入的终态。
 */
export const deliver = (
  entry: WorkerEntry,
  kind: InputKind,
  text: string,
  note?: string,
  mode: DeliveryMode = "queue",
): Delivery => {
  const rendered = renderInput(kind, text, note);
  entry.inputs += 1;
  entry.lastInput = { kind, delivery: mode, text: summarizeInput(rendered), at: Date.now() };
  const busy = !entry.session.isIdle;
  if (!busy) {
    return { queued: false, mode, delivered: "prompt", settled: entry.session.prompt(rendered) };
  }
  if (mode === "steer") {
    const settled = entry.session.steer(rendered).then(() => entry.session.waitForIdle());
    return { queued: true, mode, delivered: "steered", settled };
  }
  const settled = entry.session.followUp(rendered).then(() => entry.session.waitForIdle());
  return { queued: true, mode, delivered: "queued", settled };
};

/**
 * watchdog 到点时的回调：收到自己被派工的那条 job。
 */
export type TimeoutHandler = (job: WorkerJob) => void;

/**
 * 重设一条在途 job 的 watchdog：清旧 timer、按最新 `timeoutMs` 重设并 `unref`。
 *
 * 这是**唯一**登记 watchdog 的地方（派工与续期共用），所以不会出现两处各写一遍
 * `setTimeout` 而漏掉 `unref`。`workerTimeoutMs` 衡量连续无进展，因此续期只对当前
 * job 生效：已收割、已被新一代接管、或已经通知过超时的 job 一律不续，返回 false。
 * @param entry - 目标 worker。
 * @param job - 要续期的 job。
 * @param timeoutMs - 新的无进展容忍时长。
 * @param onTimeout - 到点回调；只在该 job 仍是当前 job 时才会有意义。
 * @returns 真的续期了返回 true。
 */
export const renew = (
  entry: WorkerEntry,
  job: WorkerJob,
  timeoutMs: number,
  onTimeout: TimeoutHandler,
): boolean => {
  if (entry.job !== job) return false;
  if (job.notified) return false;
  if (job.timer !== undefined) clearTimeout(job.timer);
  job.progressAt = Date.now();
  const timer = setTimeout(() => onTimeout(job), timeoutMs);
  timer.unref?.();
  job.timer = timer;
  return true;
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

/**
 * 找一个 Plan 下覆盖某条 note 的 worker。
 *
 * 一个 Plan 可以挂多个 worker（一组一个），所以只能按 `planDirectoryOf(key)` + `notes`
 * 扫一遍，不能直接 `get`。侧边栏用它把 note 行连到正在跑的会话。
 * @param registry - 句柄表。
 * @param planDirectory - Plan 目录的绝对路径。
 * @param note - note id。
 * @returns 找到的条目；没有 worker 领它时返回 undefined。
 */
export const findEntryByNote = (
  registry: WorkerRegistry,
  planDirectory: string,
  note: string,
): WorkerEntry | undefined => {
  return registry
    .list()
    .find(
      (entry) =>
        planDirectoryOf(entry.planDirectory) === planDirectory &&
        (entry.notes?.includes(note) ?? false),
    );
};

/**
 * 一个 Plan 下有哪些 note 正被 worker 领着。
 * @param registry - 句柄表。
 * @param planDirectory - Plan 目录的绝对路径。
 * @returns note id 集合。
 */
export const runningNotesOf = (
  registry: WorkerRegistry,
  planDirectory: string,
): ReadonlySet<string> => {
  const notes = new Set<string>();
  for (const entry of registry.list()) {
    if (planDirectoryOf(entry.planDirectory) !== planDirectory) continue;
    for (const note of entry.notes ?? []) notes.add(note);
  }
  return notes;
};
