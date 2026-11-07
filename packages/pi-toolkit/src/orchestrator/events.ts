/**
 * 事件账本的数据契约：事件类型、字段形状与一行一个的序列化。
 *
 * 账本是**运行态唯一的真相**（`notes.json` 仍然是 Plan 业务的真相）：每个事件都小、只追加、
 * 可重放。这里只有纯函数与类型，没有文件 IO —— 写盘在 `ledger.ts`，重放在 `projection.ts`。
 *
 * 事件必须小：正文只留摘要（`SUMMARY_MAX` 字），长内容留在 note 正文里。一条事件一行 JSON，
 * `seq` 单调递增，`idem`（幂等键）让重放与重复投递只算一次。
 * @module @kxh4892636/pi-toolkit/orchestrator/events
 */

import type { InputKind, ReportOutcome } from "./types.ts";
import type { DeliveredAs, DeliveryMode } from "./handles.ts";

/** 事件类型（最小集；`snapshot` 用于压缩，`interrupted.*` 用于崩溃凭据）。 */
export const EVENT_TYPES = [
  "input.sent",
  "input.consumed",
  "report.filed",
  "note.status",
  "note.pass",
  "worker.spawned",
  "worker.exit",
  "worker.suspended",
  "worker.resumed",
  "worker.merged",
  "worker.merge_blocked",
  "timeout",
  "timeout.diagnosed",
  "retry.scheduled",
  "retry.exhausted",
  "state.pulled",
  "interrupted.forgotten",
  "interrupted.cleared",
  "snapshot",
] as const;

/** 事件类型。 */
export type LedgerEventType = (typeof EVENT_TYPES)[number];

/** 事件正文里摘要字段的长度上限（字）。长内容留在 note / 会话文件里。 */
export const SUMMARY_MAX = 120;

/** `report.filed` 里证据条数与单条长度的上限：事件要小，完整证据在 note 里。 */
export const EVIDENCE_MAX_ITEMS = 5;
/** 单条证据的长度上限（字）。 */
export const EVIDENCE_ITEM_MAX = 200;

/** 一行事件。`seq` 由账本分配，`at` 是写入时刻。 */
export interface LedgerEvent {
  readonly seq: number;
  readonly at: string;
  readonly type: LedgerEventType;
  /** 幂等键：同一 `idem` 的 `input.sent` 只算一次。 */
  readonly idem?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** 追加事件时调用方提供的内容（`seq` / `at` 由账本填）。 */
export interface EventInput {
  readonly type: LedgerEventType;
  readonly payload: Record<string, unknown>;
  readonly idem?: string;
  /** 覆盖写入时刻（迁移 / 测试用）；省略则取当前时间。 */
  readonly at?: string;
}

/** 折叠多行空白并截断，保证事件小。 */
export const clipText = (text: string, max: number = SUMMARY_MAX): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
};

/** 一条事件的序列化：一行 JSON（不含换行）。 */
export const formatEvent = (event: LedgerEvent): string => JSON.stringify(event);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEventType = (value: unknown): value is LedgerEventType =>
  typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);

/**
 * 解析一行账本；坏行（半行、手改坏、旧格式）一律返回 undefined 并跳过，不让一行脏数据
 * 卡死整个重放。
 * @param line - 原文一行（不含换行）。
 * @returns 事件；坏行 undefined。
 */
export const parseEventLine = (line: string): LedgerEvent | undefined => {
  const trimmed = line.trim();
  if (trimmed === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const seq = parsed["seq"];
  const at = parsed["at"];
  const type = parsed["type"];
  const payload = parsed["payload"];
  if (typeof seq !== "number" || !Number.isFinite(seq) || seq <= 0) return undefined;
  if (typeof at !== "string" || at === "") return undefined;
  if (!isEventType(type)) return undefined;
  if (!isRecord(payload)) return undefined;
  const idem = parsed["idem"];
  return {
    seq,
    at,
    type,
    payload,
    ...(typeof idem === "string" && idem !== "" ? { idem } : {}),
  };
};

/** `input.sent` 的正文。 */
export interface InputSentPayload {
  /** 路由键：`<plan 目录>::<组>` 或 `temp:<id>`。 */
  readonly worker: string;
  /** 展示用标识（`<domain>/<lifecycle>/<name>` 或 `temp:<id>`）。 */
  readonly planRef: string;
  readonly kind: InputKind;
  readonly delivery: DeliveryMode;
  /** 实际落到哪条分支（空闲时 `steer` 退化为 `prompt`）。 */
  readonly delivered: DeliveredAs;
  /** 渲染后正文的摘要（≤ `SUMMARY_MAX`）。 */
  readonly text: string;
  readonly note?: string;
  readonly notes?: readonly string[];
}

/** `input.consumed` 的正文。 */
export interface InputConsumedPayload {
  readonly worker: string;
  /** 被消费的那条 `input.sent` 的 seq。 */
  readonly seqOfSent: number;
}

/** `report.filed` 的正文。 */
export interface ReportFiledPayload {
  readonly worker: string;
  readonly note: string;
  readonly outcome: ReportOutcome;
  readonly summary: string;
  readonly question?: string;
  readonly evidence?: readonly string[];
}

/** `note.status` 的正文。 */
export interface NoteStatusPayload {
  readonly plan: string;
  readonly planRef?: string;
  readonly note: string;
  readonly from?: string;
  readonly to: string;
  readonly needs?: string;
}

/** `note.pass` 的正文：放行不落内存，落账本。 */
export interface NotePassPayload {
  readonly plan: string;
  readonly planRef?: string;
  readonly note: string;
}

/** `worker.spawned` 的正文。 */
export interface WorkerSpawnedPayload {
  readonly worker: string;
  readonly planRef: string;
  readonly kind: "plan" | "temp";
  readonly notes?: readonly string[];
  readonly sessionPath?: string;
  /** 落盘会话的工作键（可能带 `#<作废时刻>` 的代数后缀）：`resume` 靠它接同一份 jsonl。 */
  readonly sessionKey?: string;
  readonly resumed?: boolean;
  readonly startedAt?: string;
  /** 子 worker 的上级路由键（顶层 worker 不填）。 */
  readonly parent?: string;
  /** 层级：0 = 编排方派的 worker，1 = 上层 worker 派的子 worker。 */
  readonly depth?: number;
  /** 这一代是重派出来的：上一次超时的 `timeout` 事件 seq。 */
  readonly retryOf?: number;
  readonly worktree?: {
    readonly name: string;
    readonly branch: string;
    readonly directory: string;
  };
}

/** `worker.exit` 的正文；`notes` 是当时可能悬在 `in_progress` 的 note 标签。 */
export interface WorkerExitPayload {
  readonly worker: string;
  readonly reason: string;
  readonly notes?: readonly string[];
}

/**
 * `worker.suspended` 的正文：会话结束 / 崩溃，但 jsonl 还在，**可以恢复**。
 *
 * 与 `worker.exit` 的区别就是能不能恢复：`exit` 意味着会话已作废（abort / 超时），
 * `suspended` 意味着只是这一代进程不在了，`resume` 能拿同一份 jsonl 接着跑。
 */
export interface WorkerSuspendedPayload {
  readonly worker: string;
  readonly reason: string;
  readonly notes?: readonly string[];
}

/** `worker.resumed` 的正文：把一条孤儿 worker 从 jsonl 接着跑起来。 */
export interface WorkerResumedPayload {
  readonly worker: string;
  /** 被恢复的那一代的代数锚点（最后一次 spawned / exit / resumed 的 seq）。 */
  readonly resumeOf: number;
  readonly sessionPath?: string;
}

/**
 * `worker.merged` 的正文：worker 终态后代码自动把 worktree ff-only 合并回主工作区。
 *
 * 只写账本（不写任何 json 文件、不写内存 released）：合并结论属于运行态事实。
 */
export interface WorkerMergedPayload {
  readonly worker: string;
  /** worktree 名字（`.worktrees/<名字>`）。 */
  readonly worktree: string;
  /** `wt/<名字>`。 */
  readonly branch: string;
  /** 合并后的主分支 HEAD；拿不到 `rev-parse` 时不填。 */
  readonly commit?: string;
  /** 清收说明（目录残留补删、分支删除等）。 */
  readonly cleanup?: string;
}

/** `worker.merge_blocked` 的正文：不能 ff-only 时现场保留，记下原因与目录。 */
export interface WorkerMergeBlockedPayload {
  readonly worker: string;
  readonly worktree: string;
  readonly branch: string;
  /** worktree 目录（现场保留下来给人看）。 */
  readonly directory: string;
  readonly reason: string;
}

/** `timeout` 的正文：判活只看账本，这里是当时能拿到的事实。 */
export interface TimeoutPayload {
  readonly worker: string;
  /** 最后一次算作进展的时刻（`input.consumed` / `report.filed` / 派工起点，ISO）。 */
  readonly lastProgressAt: string;
  /** 当时的阈值（毫秒），方便事后解释“为什么现在判它超时”。 */
  readonly threshold: number;
  /** 最后一次 report 的摘要（没有就不填）。 */
  readonly lastReport?: {
    readonly note: string;
    readonly outcome: string;
    readonly summary: string;
  };
  /** 距最后进展多久（毫秒）。 */
  readonly elapsedMs: number;
}

/** `timeout.diagnosed` 的正文：只读诊断 worker 给出的结论（全部可检查）。 */
export interface TimeoutDiagnosedPayload {
  readonly worker: string;
  /** 重试计数用的键：note id（没有就组 / plan 引用）。 */
  readonly retryKey: string;
  readonly note?: string;
  /** 一句话原因；解析失败时是“未能解析”。 */
  readonly cause: string;
  /** `split-note` / `narrow-scope` / `longer-timeout` / `change-strategy` / `needs-human`。 */
  readonly adjust: readonly string[];
  /** 给下一代 worker 的调整指令（`needs-human` 时为空）。 */
  readonly retryMessage?: string;
  readonly confidence: number;
  /** 诊断输出是否被成功解析（false 时不会自动重试）。 */
  readonly parsed: boolean;
  /** 诊断本身失败 / 超时的原因。 */
  readonly error?: string;
}

/** `retry.scheduled` 的正文：幂等键 `(retryKey, attempt)`，重放不会重复派工。 */
export interface RetryScheduledPayload {
  readonly worker: string;
  readonly retryKey: string;
  readonly note?: string;
  readonly attempt: number;
  readonly cause: string;
  readonly adjust: readonly string[];
  /** 被重派的那一代的 `timeout` 事件 seq。 */
  readonly timeoutSeq?: number;
}

/** `retry.exhausted` 的正文：不再自动重试，转人工。 */
export interface RetryExhaustedPayload {
  readonly worker: string;
  readonly retryKey: string;
  readonly note?: string;
  readonly attempts: number;
  /** `exhausted`（到上限）/ `needs-human` / `no-diagnosis` / `spawn-failed`。 */
  readonly reason: string;
}

/** `snapshot` 的正文：压缩点。 */
export interface SnapshotPayload {
  readonly upToSeq: number;
  readonly state: Readonly<Record<string, unknown>>;
}

/** `state.pulled` 的正文：编排方读了摘要（未读 report 的游标）。 */
export interface StatePulledPayload {
  readonly workers: number;
  readonly reports: number;
}

/** 取 payload 里的字符串字段。 */
export const payloadString = (
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined => {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
};

/** 取 payload 里的数字字段。 */
export const payloadNumber = (
  payload: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined => {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/** 取 payload 里的字符串数组字段（逐项过滤）。 */
export const payloadStrings = (
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string[] => {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
};
