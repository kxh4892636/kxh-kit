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

/** 输入台账最多保留的条数：只留最近这一批，更早的挤掉。 */
export const INPUT_LOG_MAX = 20;

/**
 * 一条输入“等了太久还没被消费”的阈值（固定 10 分钟）。
 *
 * 不跟随 `orchestrator.workerTimeoutMs`：那个是看门狗的无进展容忍时长（默认 30 分钟），
 * 而这里要回答的是更早的问题——「这条输入到底进了 worker 的队列没有、有没有卡在排队上」。
 */
export const INPUT_STUCK_MS = 10 * 60_000;

/** 一条输入的留痕：谁在什么时候、以什么方式说了什么（只有摘要）。 */
export interface LastInput {
  readonly kind: InputKind;
  readonly delivery: DeliveryMode;
  /** 渲染后正文的摘要（折叠换行、超长截断）。 */
  readonly text: string;
  /** 投递时刻（毫秒）。 */
  readonly at: number;
}

/**
 * 一条输入的台账记录：投了什么、怎么投的、什么时候投的、被消费了没有。
 *
 * `delivery` 记的是**实际落到**的那条分支（空闲时 `steer` 退化为 `prompt`，也记 `prompt`），
 * 因为消费判定按分支走。
 */
export interface InputRecord {
  /** 单调递增的序号（从 1 起）。 */
  readonly seq: number;
  readonly kind: InputKind;
  readonly delivery: DeliveredAs;
  /** 渲染后正文的摘要（展示用，见 `summarizeInput`）。 */
  readonly text: string;
  /** 投递时刻（毫秒）。 */
  readonly sentAt: number;
  /** 被消费的时刻（毫秒）；还没消费时缺省。 */
  consumedAt?: number;
}

/** 消费判定用的订阅状态：退订阅句柄 + 上一次见到的队列长度。 */
export interface InputAck {
  /** 退订阅函数；session 没有 `subscribe` 时缺省。 */
  stop?: () => void;
  /** 上一次 `queue_update` 里 steering 队列的长度。 */
  steering: number;
  /** 上一次 `queue_update` 里 followUp 队列的长度。 */
  followUp: number;
  /** 是否见过 `queue_update`；没见过时只能退化成“一次 agent_start 消费一条”。 */
  sawQueue: boolean;
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
  /**
   * 这个 worker 跑在哪个 worktree 里（没开 worktree 时不填）。
   *
   * 只做展示与回收线索：abort / 超时 **不删** worktree（现场留给合并或人工看），
   * 删除只发生在合并成功后的显式回收。
   */
  readonly worktree?: {
    readonly name: string;
    readonly directory: string;
    readonly branch: string;
  };
  lastReport?: WorkerReport;
  /** 最近一次投递给它的输入（摘要 + 时刻），供编排方判断该不该插话。 */
  lastInput?: LastInput;
  /**
   * 输入台账（最近 `INPUT_LOG_MAX` 条），用来分辨「已消费」与「还在排队」。
   *
   * 可选：`deliver` 第一次投递时懒建，手搓的条目（测试替身、子 worker 的临时条目）不必填。
   */
  inputLog?: InputRecord[];
  /** 消费判定的订阅状态；`attachInputAck` 建立，`disposeEntry` 拆掉。 */
  inputAck?: InputAck;
  /** 累计投递次数（只增不减）。存量展示仍看它，队列长度看 `pendingInputs`。 */
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

/** 取台账（懒建）；台账永不回退成 undefined，所以调用方不用再判。 */
const inputLogOf = (entry: WorkerEntry): InputRecord[] => {
  entry.inputLog ??= [];
  return entry.inputLog;
};

/**
 * 把一条投递记进台账（只保留最近 `INPUT_LOG_MAX` 条）。
 * @param entry - 目标 worker。
 * @param kind - 输入种类。
 * @param rendered - 渲染后的正文（台账里只留摘要）。
 * @param delivery - 实际落到的分支。
 * @param now - 投递时刻，默认当前。
 * @returns 新记录。
 */
export const recordInput = (
  entry: WorkerEntry,
  kind: InputKind,
  rendered: string,
  delivery: DeliveredAs,
  now: number = Date.now(),
): InputRecord => {
  const log = inputLogOf(entry);
  const record: InputRecord = {
    seq: (log.at(-1)?.seq ?? 0) + 1,
    kind,
    delivery,
    text: summarizeInput(rendered),
    sentAt: now,
  };
  log.push(record);
  if (log.length > INPUT_LOG_MAX) log.splice(0, log.length - INPUT_LOG_MAX);
  return record;
};

/** 台账里还没被消费的输入（按投递先后）。 */
export const pendingInputs = (entry: WorkerEntry): readonly InputRecord[] => {
  return (entry.inputLog ?? []).filter((record) => record.consumedAt === undefined);
};

/**
 * 把最老的一条未消费记录标成已消费。
 *
 * 队列本身是 FIFO（`_followUpMessages` / `_steeringMessages` 是数组），所以“最老一条”
 * 就是宿主刚拼进这轮的那条；按分支过滤是因为 prompt 走 `agent_start`、排队与插话走
 * `queue_update`，两条锺点不能互相当成对方。
 * @param entry - 目标 worker。
 * @param delivery - 只消费这个分支；省略则任意分支里最老的一条。
 * @param now - 消费时刻，默认当前。
 * @returns 被标记的记录；没有可消费的返回 undefined。
 */
export const consumeOldestInput = (
  entry: WorkerEntry,
  delivery?: DeliveredAs,
  now: number = Date.now(),
): InputRecord | undefined => {
  const target = pendingInputs(entry).find(
    (record) => delivery === undefined || record.delivery === delivery,
  );
  if (target !== undefined) target.consumedAt = now;
  return target;
};

/** 待消费概况：条数、最老一条等了多久、是否久到可疑。 */
export interface PendingSummary {
  /** 还没被消费的条数（只在台账保留的最近 `INPUT_LOG_MAX` 条里算）。 */
  readonly pending: number;
  /** 最老一条已等毫秒数；没有待消费时缺省。 */
  readonly oldestMs?: number;
  /** 待消费且有超过 `INPUT_STUCK_MS` 没动的：很可能是卡住了。 */
  readonly stuck: boolean;
}

/**
 * 算待消费概况。
 * @param entry - 目标 worker。
 * @param now - 当前时刻，默认真实时间。
 * @returns 条数、最老等待时长与卡住标记。
 */
export const pendingSummary = (entry: WorkerEntry, now: number = Date.now()): PendingSummary => {
  const pending = pendingInputs(entry);
  const oldest = pending[0];
  if (oldest === undefined) return { pending: 0, stuck: false };
  const oldestMs = Math.max(0, now - oldest.sentAt);
  return { pending: pending.length, oldestMs, stuck: oldestMs >= INPUT_STUCK_MS };
};

/**
 * 待消费的一句话展示：`待消费 2（最老 3 分钟）`，久到可疑时追加 `⚠ 可能卡住`。
 * @param summary - `pendingSummary` 的结果。
 * @returns 清单里那一小段文本（不带分隔符）。
 */
export const pendingLabel = (summary: PendingSummary): string => {
  if (summary.pending === 0) return "待消费 0";
  const waited = summary.oldestMs ?? 0;
  const oldest =
    waited < 60_000
      ? `${Math.max(1, Math.round(waited / 1000))} 秒`
      : `${Math.round(waited / 60_000)} 分钟`;
  return `待消费 ${summary.pending}（最老 ${oldest}）${summary.stuck ? " ⚠ 可能卡住" : ""}`;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
};

/** 读事件里的队列长度：`queue_update` 给数组，其余一律返回 undefined。 */
const queueSizesOf = (event: unknown): { steering: number; followUp: number } | undefined => {
  const record = asRecord(event);
  if (record?.["type"] !== "queue_update") return undefined;
  const sizeOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
  return { steering: sizeOf(record["steering"]), followUp: sizeOf(record["followUp"]) };
};

/**
 * 用一条 session 事件推进消费判定。
 *
 * 两个锺点：
 * - `queue_update`：宿主队列长度**减少**几条，就消费几条最老的对应分支（`steered` /
 *   `queued`）。减少发生在宿主把那条消息拼进本轮 transcript 时（`message_start` 的 user
 *   消息把文本从队列里摘掉），所以这是**精确**的：排队/插话的输入被拼进去就算消费。
 * - `agent_start`：空闲投递（`prompt`）直接开新一轮，开局就是消费点。
 *
 * **退化路径**（已在文档与 evidence 里写明）：宿主不给 `queue_update`（老会话实现，或
 * session 没有 `subscribe`）时，只能每次 `agent_start` 吃掉一条最老未消费的——那是**近似**，
 * 分不清谁被消费，只保证总数对得上。
 * @param entry - 目标 worker。
 * @param event - `SessionLike.subscribe` 收到的事件。
 * @param now - 消费时刻，默认当前。
 * @returns 本次被标成已消费的记录。
 */
export const applySessionEvent = (
  entry: WorkerEntry,
  event: unknown,
  now: number = Date.now(),
): readonly InputRecord[] => {
  const sizes = queueSizesOf(event);
  const ack = (entry.inputAck ??= { steering: 0, followUp: 0, sawQueue: false });
  if (sizes !== undefined) {
    const consumed: InputRecord[] = [];
    const drain = (count: number, delivery: DeliveredAs): void => {
      for (let index = 0; index < count; index += 1) {
        const record = consumeOldestInput(entry, delivery, now);
        if (record === undefined) return;
        consumed.push(record);
      }
    };
    drain(ack.steering - sizes.steering, "steered");
    drain(ack.followUp - sizes.followUp, "queued");
    ack.steering = sizes.steering;
    ack.followUp = sizes.followUp;
    ack.sawQueue = true;
    return consumed;
  }
  if (asRecord(event)?.["type"] !== "agent_start") return [];
  // 见过 queue_update 就只消费空闲投递的那条；没见过只能退化（近似，见上方注释）。
  const record = consumeOldestInput(entry, ack.sawQueue ? "prompt" : undefined, now);
  return record === undefined ? [] : [record];
};

/**
 * 挂上消费判定的订阅（幂等）。
 *
 * session 没有 `subscribe`（手搓替身 / 老路径）时不挂：台账照记，只是待消费要靠
 * `agent_start` 的退化路径推进。
 * @param entry - 目标 worker。
 */
export const attachInputAck = (entry: WorkerEntry): void => {
  if (entry.inputAck !== undefined) return;
  const ack: InputAck = { steering: 0, followUp: 0, sawQueue: false };
  entry.inputAck = ack;
  // 用方法调用（而不是先取出函数再 call）：`this` 绑定留给宿主实现自己。
  if (typeof entry.session.subscribe !== "function") return;
  ack.stop = entry.session.subscribe((event) => {
    applySessionEvent(entry, event);
  });
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
  const busy = !entry.session.isIdle;
  // 先算真正落到的分支，再记账：台账里的 `delivery` 必须是实际分支，消费判定按它走。
  const delivered: DeliveredAs = !busy ? "prompt" : mode === "steer" ? "steered" : "queued";
  // 订阅先于投递挂上：排队队列的入队/出队都在 `followUp` / `steer` 里同步发事件，
  // 晚挂会漏掉这一次的基线长度。
  attachInputAck(entry);
  recordInput(entry, kind, rendered, delivered);
  entry.inputs += 1;
  entry.lastInput = { kind, delivery: mode, text: summarizeInput(rendered), at: Date.now() };
  if (!busy) {
    return { queued: false, mode, delivered, settled: entry.session.prompt(rendered) };
  }
  if (mode === "steer") {
    const settled = entry.session.steer(rendered).then(() => entry.session.waitForIdle());
    return { queued: true, mode, delivered, settled };
  }
  const settled = entry.session.followUp(rendered).then(() => entry.session.waitForIdle());
  return { queued: true, mode, delivered, settled };
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
  entry.inputAck?.stop?.();
  delete entry.inputAck;
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
