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

/** 事件类型（最小集；`snapshot` 用于压缩，`interrupted.*` 用于崩溃凭据）。 */
export const EVENT_TYPES = [
  "input.sent",
  "input.consumed",
  "report.filed",
  "note.pass",
  "worker.spawned",
  "worker.exit",
  "worker.suspended",
  "worker.resumed",
  "worker.merge_blocked",
  /** 现场（一个组一个）：建一次 / 合并成功 / 合并后回收。 */
  "worktree.created",
  "worktree.merged",
  "worktree.removed",
  /** 合并成功但目录没删干净（Windows 锁文件 / 权限）：一条 error，等人工删。 */
  "worktree.leftover",
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
