/**
 * 投影：从账本重放出运行态。
 *
 * 账本是真相，投影只是它的函数。`project(events)` 纯重放（测试与启动用它），
 * `createProjection(ledger)` 在重放之上挂订阅：同进程 `append` 之后立刻更新（毫秒级），
 * 跨进程写入靠 `fs.watch` + 200ms 轮询兜底 `sync`。
 *
 * 投影出来的东西：
 * - `workers`（live / exited、待消费输入、最后 report、worktree、超时）；
 * - `released`（`note.pass` 集合，取代内存里的放行集合）；
 * - `reports`（未读 report：`state.pulled` 之前的都算未读）；
 * - `notesStatus`（`note.status` 缓存；真相仍是 `notes.json`）；
 * - `interrupted`（崩溃 / 退出凭据，取代 `interrupted.json`）。
 *
 * 压缩（`compactLedger`）把当前投影写成一条 `snapshot` 事件，旧行归档到
 * `events-<日期>.jsonl` 后从主账本截断；重放先读最后一条 snapshot 再往后叠。
 * @module @kxh4892636/pi-toolkit/orchestrator/projection
 */

import { watch, type FSWatcher } from "node:fs";
import {
  clipText,
  EVIDENCE_ITEM_MAX,
  EVIDENCE_MAX_ITEMS,
  payloadNumber,
  payloadString,
  payloadStrings,
  SUMMARY_MAX,
  type LedgerEvent,
} from "./events.ts";
import {
  acquireLedgerLock,
  archiveEvents,
  LEDGER_FILE,
  releaseLedgerLock,
  type Ledger,
} from "./ledger.ts";
import type { InputKind, ReportOutcome } from "./types.ts";
import type { DeliveredAs, DeliveryMode } from "./handles.ts";

/** 投影里的一个 worker。 */
export interface ProjectedWorker {
  /** 路由键：`<plan 目录>::<组>` 或 `temp:<id>`。 */
  readonly worker: string;
  planRef: string;
  kind: "plan" | "temp";
  notes: readonly string[];
  sessionPath?: string;
  worktree?: { readonly name: string; readonly branch: string; readonly directory: string };
  /** 起点时刻（ISO）。 */
  startedAt: string;
  status: "live" | "exited";
  exitReason?: string;
  /** 累计收到多少条输入（`input.sent` 的条数，幂等后）。 */
  inputs: number;
  /** 还没被 `input.consumed` 消费的输入（按 seq 升序）。 */
  pending: ProjectedInput[];
  /** 最近一次 `input.consumed`（worker 真的开始处理那条输入）的时刻；这是判活的一半。 */
  lastConsumedAt?: string;
  lastReport?: ProjectedReport;
  lastInput?: ProjectedInput;
  /** 子 worker 的上级路由键（顶层 worker 不填）。 */
  parent?: string;
  /** 层级：0 = 编排方派的 worker，1 = 上层 worker 派的子 worker。 */
  depth: number;
  /** 最近一次自动合并成功（`worker.merged`）；`at` 是合并时刻。 */
  merged?: { at: string; commit?: string };
  /** 最近一次自动合并失败（`worker.merge_blocked`）；成功合并会清掉它。 */
  mergeBlocked?: { at: string; reason: string; directory: string };
  /** 最近一次超时（`timeout`）；之后再派工或重试会清掉它。 */
  timedOut?: { readonly at: string; readonly elapsedMs: number };
  /** 会话结束 / 崩溃但 **可恢复**（`worker.suspended`）：jsonl 还在。 */
  suspended?: { at: string; reason: string };
  /** 从孤儿恢复过（`worker.resumed`）。 */
  resumedAt?: string;
  /** 累计超时次数（`timeout` 事件）。 */
  timeouts: number;
  /** 最近一次诊断结论（`timeout.diagnosed`）。 */
  lastDiagnosis?: {
    readonly at: string;
    readonly cause: string;
    readonly adjust: readonly string[];
    readonly confidence: number;
    readonly parsed: boolean;
  };
}

/** 一条重试键的累计状态（`note` 或其替代键）。 */
export interface ProjectedRetry {
  retryKey: string;
  /** 已经自动重派过几次（`retry.scheduled` 条数，幂等后）。 */
  attempts: number;
  lastCause?: string;
  lastAdjust: readonly string[];
  /** 不再自动重试（`retry.exhausted`）：原因 + 时刻。 */
  exhausted?: { at: string; reason: string };
}

/** 投影里的一条输入。 */
export interface ProjectedInput {
  readonly seq: number;
  readonly at: string;
  readonly kind: InputKind;
  readonly delivery: DeliveryMode;
  readonly delivered: DeliveredAs;
  readonly text: string;
  readonly note?: string;
}

/** 投影里的一条 report。 */
export interface ProjectedReport {
  readonly seq: number;
  readonly at: string;
  readonly worker: string;
  readonly planRef?: string;
  readonly note: string;
  readonly outcome: ReportOutcome;
  readonly summary: string;
  readonly question?: string;
  readonly evidence?: readonly string[];
  /** 编排方拉过摘要（`state.pulled` 之后）即已读。 */
  read: boolean;
}

/** 崩溃 / 退出凭据（取代 `interrupted.json`）。 */
export interface ProjectedInterrupted {
  at: string;
  reason: string;
  plans: string[];
  notes: string[];
}

/** 一条 note 的状态缓存。 */
export interface ProjectedNoteStatus {
  status: string;
  needs?: string;
  at: string;
}

/** 投影状态。 */
export interface ProjectionState {
  workers: Map<string, ProjectedWorker>;
  /** `plan（目录）→ 已放行的 note id`。 */
  released: Map<string, Set<string>>;
  /** 重试键（通常就是 note id）→ 已重派次数与最近诊断。 */
  retries: Map<string, ProjectedRetry>;
  /** 全部 report（`report.filed`），按 seq 升序；`read=false` 即未读。 */
  reports: ProjectedReport[];
  /** `` `${plan}::${note}` `` → 状态。 */
  notesStatus: Map<string, ProjectedNoteStatus>;
  interrupted?: ProjectedInterrupted;
  /** 最后应用的事件 seq。 */
  lastSeq: number;
  /** 幂等键（`input.sent` 去重）；压缩时只保留最近一批。 */
  seenIdem: Set<string>;
}

/** 空投影。 */
export const emptyState = (): ProjectionState => ({
  workers: new Map(),
  released: new Map(),
  retries: new Map(),
  reports: [],
  notesStatus: new Map(),
  lastSeq: 0,
  seenIdem: new Set(),
});

/** 退出原因是不是“中断”（崩溃 / 会话退出）：这类才值得留凭据。 */
export const isInterruption = (reason: string): boolean =>
  /crash|shutdown|uncaught|unhandled/iu.test(reason);

/**
 * 一个 worker 的「最后进展」时刻（毫秒）。
 *
 * 判活只认**worker 自己**的痕迹：`input.consumed`（真的开始处理）与 `report.filed`
 * （还在推进）。`input.sent` 是编排方的动作，不算进展；派工时刻只当起点。
 * @param worker - 投影里的 worker。
 * @returns 毫秒时间戳；什么都没有时 0。
 */
export const progressAtOf = (worker: ProjectedWorker): number => {
  const consumed = worker.lastConsumedAt === undefined ? 0 : Date.parse(worker.lastConsumedAt);
  const report = worker.lastReport === undefined ? 0 : Date.parse(worker.lastReport.at);
  const started = Number.isFinite(Date.parse(worker.startedAt)) ? Date.parse(worker.startedAt) : 0;
  return Math.max(
    started,
    Number.isFinite(consumed) ? consumed : 0,
    Number.isFinite(report) ? report : 0,
  );
};

/** 撞到已存在的 worker 条目时取它，否则建一个（`worker.spawned` 之前也可能先来输入）。 */
const ensureWorker = (
  state: ProjectionState,
  worker: string,
  at: string,
  patch: Partial<ProjectedWorker> = {},
): ProjectedWorker => {
  const existing = state.workers.get(worker);
  if (existing !== undefined) {
    Object.assign(existing, patch);
    return existing;
  }
  const created: ProjectedWorker = {
    worker,
    planRef: patch.planRef ?? worker,
    kind: patch.kind ?? (worker.startsWith("temp:") ? "temp" : "plan"),
    notes: patch.notes ?? [],
    startedAt: patch.startedAt ?? at,
    status: patch.status ?? "live",
    inputs: 0,
    pending: [],
    timeouts: 0,
    depth: patch.depth ?? 0,
    ...patch,
  };
  state.workers.set(worker, created);
  return created;
};

/**
 * 把一条事件叠进投影（幂等：`seq` 不大于已应用的就跳过）。
 * @param state - 投影状态（就地修改）。
 * @param event - 账本事件。
 * @returns 应用了就返回 true。
 */
export const applyEvent = (state: ProjectionState, event: LedgerEvent): boolean => {
  if (event.seq <= state.lastSeq) return false;
  state.lastSeq = event.seq;
  // 幂等键对**所有**事件生效：重放 / 重复投递只算一次（`retry.scheduled` 靠它不重复派工）。
  if (event.idem !== undefined) {
    if (state.seenIdem.has(event.idem)) return true;
    state.seenIdem.add(event.idem);
  }
  const payload = event.payload;
  switch (event.type) {
    case "snapshot": {
      const restored = restoreState(payload["state"]);
      state.workers = restored.workers;
      state.released = restored.released;
      state.retries = restored.retries;
      state.reports = restored.reports;
      state.notesStatus = restored.notesStatus;
      if (restored.interrupted === undefined) delete state.interrupted;
      else state.interrupted = restored.interrupted;
      state.seenIdem = restored.seenIdem;
      return true;
    }
    case "input.sent": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const planRef = payloadString(payload, "planRef");
      const entry = ensureWorker(state, worker, event.at, planRef === undefined ? {} : { planRef });
      const input: ProjectedInput = {
        seq: event.seq,
        at: event.at,
        kind: (payloadString(payload, "kind") ?? "message") as InputKind,
        delivery: (payloadString(payload, "delivery") ?? "steer") as DeliveryMode,
        delivered: (payloadString(payload, "delivered") ?? "prompt") as DeliveredAs,
        text: clipText(payloadString(payload, "text") ?? "", SUMMARY_MAX),
        ...(payloadString(payload, "note") === undefined
          ? {}
          : { note: payloadString(payload, "note") as string }),
      };
      entry.inputs += 1;
      entry.pending.push(input);
      entry.lastInput = input;
      // 又来输入说明它又活了：超时标记只对最近一次卡死有意义，清掉。
      delete entry.timedOut;
      return true;
    }
    case "input.consumed": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const entry = state.workers.get(worker);
      if (entry === undefined) return true;
      const seqOfSent = payloadNumber(payload, "seqOfSent");
      const index =
        seqOfSent === undefined ? 0 : entry.pending.findIndex((input) => input.seq === seqOfSent);
      if (index >= 0) entry.pending.splice(index, 1);
      // ack 是“worker 真的开始干活”的证据：判活的进展只认它与 `report.filed`。
      entry.lastConsumedAt = event.at;
      return true;
    }
    case "report.filed": {
      const worker = payloadString(payload, "worker");
      const note = payloadString(payload, "note");
      if (worker === undefined || note === undefined) return true;
      const entry = ensureWorker(state, worker, event.at);
      const report: ProjectedReport = {
        seq: event.seq,
        at: event.at,
        worker,
        ...(entry.kind === "temp" ? {} : { planRef: entry.planRef }),
        note,
        outcome: (payloadString(payload, "outcome") ?? "done") as ReportOutcome,
        summary: clipText(payloadString(payload, "summary") ?? "", SUMMARY_MAX),
        ...(payloadString(payload, "question") === undefined
          ? {}
          : { question: clipText(payloadString(payload, "question") as string, SUMMARY_MAX) }),
        ...(payloadStrings(payload, "evidence").length === 0
          ? {}
          : {
              evidence: payloadStrings(payload, "evidence")
                .slice(0, EVIDENCE_MAX_ITEMS)
                .map((item) => clipText(item, EVIDENCE_ITEM_MAX)),
            }),
        read: false,
      };
      state.reports.push(report);
      // report 数组只留最近一批：更早的已经在 note 的 evidence 里，账本里也有。
      if (state.reports.length > 200) state.reports.splice(0, state.reports.length - 200);
      entry.lastReport = report;
      return true;
    }
    case "note.pass": {
      const plan = payloadString(payload, "plan");
      const note = payloadString(payload, "note");
      if (plan === undefined || note === undefined) return true;
      const set = state.released.get(plan) ?? new Set<string>();
      set.add(note);
      state.released.set(plan, set);
      return true;
    }
    case "note.status": {
      const plan = payloadString(payload, "plan");
      const note = payloadString(payload, "note");
      const status = payloadString(payload, "to");
      if (plan === undefined || note === undefined || status === undefined) return true;
      state.notesStatus.set(`${plan}::${note}`, {
        status,
        ...(payloadString(payload, "needs") === undefined
          ? {}
          : { needs: payloadString(payload, "needs") as string }),
        at: event.at,
      });
      return true;
    }
    case "worker.spawned": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const notes = payloadStrings(payload, "notes");
      const sessionPath = payloadString(payload, "sessionPath");
      const planRef = payloadString(payload, "planRef");
      const parent = payloadString(payload, "parent");
      const depth = payloadNumber(payload, "depth");
      const worktree = payload["worktree"];
      const entry = ensureWorker(state, worker, event.at, {
        ...(planRef === undefined ? {} : { planRef }),
        status: "live",
        ...(notes.length === 0 ? {} : { notes }),
        ...(sessionPath === undefined ? {} : { sessionPath }),
        ...(parent === undefined ? {} : { parent }),
        ...(depth === undefined ? {} : { depth }),
        ...(isRecord(worktree) &&
        typeof worktree["name"] === "string" &&
        typeof worktree["branch"] === "string" &&
        typeof worktree["directory"] === "string"
          ? {
              worktree: {
                name: worktree["name"],
                branch: worktree["branch"],
                directory: worktree["directory"],
              },
            }
          : {}),
      });
      delete entry.exitReason;
      delete entry.suspended;
      return true;
    }
    case "worker.suspended": {
      // 会话结束 / 崩溃：**不写 exit** —— jsonl 还在，`resume` 能接着跑。
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const reason = payloadString(payload, "reason") ?? "suspended";
      const planRef = payloadString(payload, "planRef");
      const entry = ensureWorker(state, worker, event.at, planRef === undefined ? {} : { planRef });
      entry.suspended = { at: event.at, reason };
      const notes = payloadStrings(payload, "notes");
      if (notes.length > 0 || isInterruption(reason)) {
        const current = state.interrupted ?? { at: event.at, reason, plans: [], notes: [] };
        current.at = event.at;
        current.reason = reason;
        if (!current.plans.includes(entry.planRef)) current.plans.push(entry.planRef);
        for (const label of notes) {
          if (!current.notes.includes(label)) current.notes.push(label);
        }
        state.interrupted = current;
      }
      return true;
    }
    case "worker.resumed": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const entry = ensureWorker(state, worker, event.at, { status: "live" });
      delete entry.suspended;
      delete entry.exitReason;
      entry.resumedAt = event.at;
      return true;
    }
    case "worker.exit": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const reason = payloadString(payload, "reason") ?? "exit";
      const planRef = payloadString(payload, "planRef");
      const entry = ensureWorker(state, worker, event.at, {
        status: "exited",
        exitReason: reason,
        ...(planRef === undefined ? {} : { planRef }),
      });
      entry.status = "exited";
      entry.exitReason = reason;
      // 崩溃 / 会话退出：把可能悬着的 in_progress 记进凭据（取代 interrupted.json）。
      const notes = payloadStrings(payload, "notes");
      if (notes.length > 0 || isInterruption(reason)) {
        const current = state.interrupted ?? { at: event.at, reason, plans: [], notes: [] };
        current.at = event.at;
        current.reason = reason;
        if (!current.plans.includes(entry.planRef)) current.plans.push(entry.planRef);
        for (const label of notes) {
          if (!current.notes.includes(label)) current.notes.push(label);
        }
        state.interrupted = current;
      }
      return true;
    }
    case "worker.merged": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const entry = ensureWorker(state, worker, event.at);
      const commit = payloadString(payload, "commit");
      entry.merged = { at: event.at, ...(commit === undefined ? {} : { commit }) };
      // 合并成功即撤销上一次的“未合并”标记：现场已经收掉了。
      delete entry.mergeBlocked;
      return true;
    }
    case "worker.merge_blocked": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const entry = ensureWorker(state, worker, event.at);
      entry.mergeBlocked = {
        at: event.at,
        reason: payloadString(payload, "reason") ?? "未知原因",
        directory: payloadString(payload, "directory") ?? "",
      };
      return true;
    }
    case "timeout": {
      const worker = payloadString(payload, "worker");
      if (worker === undefined) return true;
      const entry = ensureWorker(state, worker, event.at);
      entry.timedOut = { at: event.at, elapsedMs: payloadNumber(payload, "elapsedMs") ?? 0 };
      entry.timeouts += 1;
      return true;
    }
    case "timeout.diagnosed": {
      const worker = payloadString(payload, "worker");
      const retryKey = payloadString(payload, "retryKey");
      if (worker === undefined || retryKey === undefined) return true;
      const cause = payloadString(payload, "cause") ?? "未知原因";
      const adjust = payloadStrings(payload, "adjust");
      const entry = ensureWorker(state, worker, event.at);
      entry.lastDiagnosis = {
        at: event.at,
        cause,
        adjust,
        confidence: payloadNumber(payload, "confidence") ?? 0,
        parsed: payload["parsed"] === true,
      };
      const retry = state.retries.get(retryKey) ?? { retryKey, attempts: 0, lastAdjust: [] };
      retry.lastCause = cause;
      retry.lastAdjust = adjust;
      state.retries.set(retryKey, retry);
      return true;
    }
    case "retry.scheduled": {
      const retryKey = payloadString(payload, "retryKey");
      if (retryKey === undefined) return true;
      const retry = state.retries.get(retryKey) ?? { retryKey, attempts: 0, lastAdjust: [] };
      // 幂等：同一 `(retryKey, attempt)` 只算一次（重放账本不重复派工）。
      const attempt = payloadNumber(payload, "attempt") ?? retry.attempts + 1;
      retry.attempts = Math.max(retry.attempts, attempt);
      retry.lastAdjust = payloadStrings(payload, "adjust");
      const cause = payloadString(payload, "cause");
      if (cause !== undefined) retry.lastCause = cause;
      delete retry.exhausted;
      state.retries.set(retryKey, retry);
      return true;
    }
    case "retry.exhausted": {
      const retryKey = payloadString(payload, "retryKey");
      if (retryKey === undefined) return true;
      const retry = state.retries.get(retryKey) ?? { retryKey, attempts: 0, lastAdjust: [] };
      retry.attempts = Math.max(
        retry.attempts,
        payloadNumber(payload, "attempts") ?? retry.attempts,
      );
      retry.exhausted = { at: event.at, reason: payloadString(payload, "reason") ?? "exhausted" };
      state.retries.set(retryKey, retry);
      return true;
    }
    case "state.pulled": {
      for (const report of state.reports) report.read = true;
      return true;
    }
    case "interrupted.forgotten": {
      const planRef = payloadString(payload, "planRef");
      if (state.interrupted === undefined || planRef === undefined) return true;
      const prefix = `${planRef} · `;
      state.interrupted.plans = state.interrupted.plans.filter((item) => item !== planRef);
      state.interrupted.notes = state.interrupted.notes.filter((item) => !item.startsWith(prefix));
      if (state.interrupted.plans.length === 0 && state.interrupted.notes.length === 0) {
        delete state.interrupted;
      }
      return true;
    }
    case "interrupted.cleared": {
      delete state.interrupted;
      return true;
    }
  }
};

/**
 * 纯重放：从事件流重建投影。
 * @param events - 账本事件（按 seq 升序；乱序也无所谓，按 seq 叠）。
 * @returns 投影状态。
 */
export const project = (events: readonly LedgerEvent[]): ProjectionState => {
  const state = emptyState();
  for (const event of [...events].sort((left, right) => left.seq - right.seq)) {
    applyEvent(state, event);
  }
  return state;
};

/** 快照里的结构版本：将来改投影形状时靠它判断要不要丢弃旧快照。 */
export const SNAPSHOT_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 把投影压成可 JSON 化的快照（`snapshot` 事件的 payload.state）。
 *
 * 只留压缩点仍然有用的东西：worker（含待消费输入）、放行集合、未读 report、note 状态缓存、
 * 崩溃凭据；幂等键只留最近 500 条（更早的事件已归档，不会再触发去重）。
 * @param state - 投影状态。
 * @returns 可 JSON 化的快照。
 */
export const snapshotState = (state: ProjectionState): Record<string, unknown> => ({
  version: SNAPSHOT_VERSION,
  workers: [...state.workers.values()],
  released: [...state.released].map(([plan, notes]) => [plan, [...notes]]),
  retries: [...state.retries.values()],
  reports: state.reports,
  notesStatus: [...state.notesStatus],
  ...(state.interrupted === undefined ? {} : { interrupted: state.interrupted }),
  seenIdem: [...state.seenIdem].slice(-500),
});

/**
 * 从快照恢复投影（坏数据当空投影，绝不抛）。
 * @param raw - `snapshot` 事件里的 `payload.state`。
 * @returns 投影状态（`lastSeq` 由调用方随后设定）。
 */
export const restoreState = (raw: unknown): ProjectionState => {
  const state = emptyState();
  if (!isRecord(raw)) return state;
  if (raw["version"] !== SNAPSHOT_VERSION) return state;
  const workers = raw["workers"];
  if (Array.isArray(workers)) {
    for (const item of workers) {
      if (!isRecord(item) || typeof item["worker"] !== "string") continue;
      const worker = item as unknown as ProjectedWorker;
      state.workers.set(worker.worker, {
        ...worker,
        pending: [...(worker.pending ?? [])],
        // 旧的快照里没有这两个计数：缺就补 0，免得后面 `+= 1` 变成 NaN。
        inputs: typeof worker.inputs === "number" ? worker.inputs : 0,
        timeouts: typeof worker.timeouts === "number" ? worker.timeouts : 0,
        depth: typeof worker.depth === "number" ? worker.depth : 0,
      });
    }
  }
  const released = raw["released"];
  if (Array.isArray(released)) {
    for (const pair of released) {
      if (!Array.isArray(pair) || typeof pair[0] !== "string") continue;
      const notes = Array.isArray(pair[1])
        ? pair[1].filter((note): note is string => typeof note === "string")
        : [];
      state.released.set(pair[0], new Set(notes));
    }
  }
  const reports = raw["reports"];
  if (Array.isArray(reports)) {
    for (const item of reports) {
      if (!isRecord(item) || typeof item["seq"] !== "number") continue;
      state.reports.push(item as unknown as ProjectedReport);
    }
  }
  const retries = raw["retries"];
  if (Array.isArray(retries)) {
    for (const item of retries) {
      if (!isRecord(item) || typeof item["retryKey"] !== "string") continue;
      state.retries.set(item["retryKey"], {
        retryKey: item["retryKey"],
        attempts: typeof item["attempts"] === "number" ? item["attempts"] : 0,
        lastAdjust: Array.isArray(item["lastAdjust"])
          ? item["lastAdjust"].filter((value): value is string => typeof value === "string")
          : [],
        ...(typeof item["lastCause"] === "string" ? { lastCause: item["lastCause"] } : {}),
        ...(isRecord(item["exhausted"])
          ? {
              exhausted: {
                at: typeof item["exhausted"]["at"] === "string" ? item["exhausted"]["at"] : "",
                reason:
                  typeof item["exhausted"]["reason"] === "string"
                    ? item["exhausted"]["reason"]
                    : "exhausted",
              },
            }
          : {}),
      });
    }
  }
  const notesStatus = raw["notesStatus"];
  if (Array.isArray(notesStatus)) {
    for (const pair of notesStatus) {
      if (!Array.isArray(pair) || typeof pair[0] !== "string" || !isRecord(pair[1])) continue;
      state.notesStatus.set(pair[0], pair[1] as unknown as ProjectedNoteStatus);
    }
  }
  const interrupted = raw["interrupted"];
  if (isRecord(interrupted) && typeof interrupted["reason"] === "string") {
    state.interrupted = {
      at: typeof interrupted["at"] === "string" ? interrupted["at"] : "",
      reason: interrupted["reason"],
      plans: Array.isArray(interrupted["plans"])
        ? interrupted["plans"].filter((item): item is string => typeof item === "string")
        : [],
      notes: Array.isArray(interrupted["notes"])
        ? interrupted["notes"].filter((item): item is string => typeof item === "string")
        : [],
    };
  }
  const seenIdem = raw["seenIdem"];
  if (Array.isArray(seenIdem)) {
    for (const item of seenIdem) {
      if (typeof item === "string") state.seenIdem.add(item);
    }
  }
  return state;
};

/** 跨进程兜底的轮询间隔（毫秒）：`fs.watch` 之外的保险。 */
export const PROJECTION_POLL_MS = 200;

/** 活的投影：状态 + 订阅 + 跨进程跟随。 */
export interface Projection {
  readonly ledger: Ledger;
  /** 当前状态（不要就地改）。 */
  state(): ProjectionState;
  /** 订阅变化（同进程 append 立刻触发）；返回退订阅函数。 */
  subscribe(listener: () => void): () => void;
  /** 主动读一遍账本（`fs.watch` 之外的兜底）。 */
  sync(): void;
  /** 某个 worker 还没被消费的输入。 */
  pendingOf(worker: string): readonly ProjectedInput[];
  /** 某个 worker 最老一条未消费输入（ack 用）。 */
  oldestPendingOf(worker: string): ProjectedInput | undefined;
  /** 放行判定（`note.pass` 重放出来的）。 */
  isReleased(plan: string, note: string): boolean;
  /** 未读 report。 */
  unreadReports(): readonly ProjectedReport[];
  /** 退订阅、停定时器。 */
  dispose(): void;
}

/**
 * 建一个活投影：先整本重放，再挂同进程订阅与跨进程跟随。
 * @param ledger - 账本句柄。
 * @param options - 轮询间隔覆盖（测试用小值）。
 * @returns 投影。
 */
export const createProjection = (
  ledger: Ledger,
  options: { readonly pollMs?: number } = {},
): Projection => {
  let state = project(ledger.events());
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const stopLedger = ledger.subscribe((event) => {
    if (!applyEvent(state, event)) return;
    notify();
  });
  let watcher: FSWatcher | undefined;
  try {
    // 监听目录而不是文件：压缩会整体替换文件，文件级 watch 在替换后失效。
    watcher = watch(ledger.directory, (_type, filename) => {
      if (filename !== null && filename.toString() !== LEDGER_FILE) return;
      ledger.sync();
    });
    watcher.on("error", () => undefined);
    watcher.unref?.();
  } catch {
    watcher = undefined;
  }
  let lastSize = ledger.size();
  const timer = setInterval(() => {
    const size = ledger.size();
    if (size === lastSize) return;
    lastSize = size;
    ledger.sync();
  }, options.pollMs ?? PROJECTION_POLL_MS);
  timer.unref?.();

  return {
    ledger,
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync() {
      ledger.sync();
      lastSize = ledger.size();
    },
    pendingOf: (worker) => state.workers.get(worker)?.pending ?? [],
    oldestPendingOf: (worker) => state.workers.get(worker)?.pending[0],
    isReleased: (plan, note) => state.released.get(plan)?.has(note) ?? false,
    unreadReports: () => state.reports.filter((report) => !report.read),
    dispose() {
      stopLedger();
      watcher?.close();
      clearInterval(timer);
      listeners.clear();
    },
  };
};

/** 进程内共享投影：与共享账本一一对应。 */
const openProjections = new Map<string, Projection>();

/**
 * 取（或建）某个账本的共享投影。worker 侧的 ack 与编排方的状态必须看同一份。
 * @param ledger - 账本。
 * @returns 投影。
 */
export const openProjection = (ledger: Ledger): Projection => {
  const existing = openProjections.get(ledger.directory);
  if (existing !== undefined && existing.ledger === ledger) return existing;
  existing?.dispose();
  const created = createProjection(ledger);
  openProjections.set(ledger.directory, created);
  return created;
};

/** 关掉共享投影（退出收尾 / 测试清理）。 */
export const closeProjection = (directory: string): void => {
  openProjections.get(directory)?.dispose();
  openProjections.delete(directory);
};

/** 关掉全部共享投影（测试用）。 */
export const resetProjections = (): void => {
  for (const projection of openProjections.values()) projection.dispose();
  openProjections.clear();
};

/** 崩溃凭据的读写口（与 `tools/shared.ts` 的 `InterruptedAccess` 同形）。 */
export interface InterruptedAccessView {
  /** 读当前凭据；没有或已清除时 undefined。 */
  read(): ProjectedInterrupted | undefined;
  /** 移除某个 plan 的条目（落一条 `interrupted.forgotten`）。 */
  forget(planRef: string): void;
  /** 清空整档（落一条 `interrupted.cleared`）。 */
  clear(): void;
}

/**
 * 用账本实现崩溃凭据的读写（取代 `interrupted.json`）。
 *
 * 读走投影、写落事件，所以重启后凭据还在，`forget` / `clear` 也被记账。
 * @param ledger - 账本。
 * @param projection - 这个账本的投影。
 * @returns 读写口。
 */
export const createInterruptedAccess = (
  ledger: Ledger,
  projection: Projection,
): InterruptedAccessView => ({
  read: () => projection.state().interrupted,
  forget: (planRef) => {
    ledger.append({ type: "interrupted.forgotten", payload: { planRef } });
  },
  clear: () => {
    ledger.append({ type: "interrupted.cleared", payload: {} });
  },
});

/** 压缩结果。 */
export interface CompactOutcome {
  /** 归档文件路径。 */
  readonly archived: string;
  /** 被归档的事件条数。 */
  readonly removed: number;
  /** 新 snapshot 事件的 seq。 */
  readonly snapshotSeq: number;
}

/** 默认压缩门槛：主账本超过这么多条才压。 */
export const COMPACT_THRESHOLD = 500;

/**
 * 压缩账本：把当前投影写成一条 `snapshot`，旧行归档后从主账本截断。
 *
 * 加文件锁（跨进程安全）；`events` 条数不超过门槛时直接返回 undefined。
 * @param ledger - 账本。
 * @param options - 门槛与时刻（测试覆盖）。
 * @returns 压缩结果；没压返回 undefined。
 */
export const compactLedger = async (
  ledger: Ledger,
  options: { readonly threshold?: number; readonly now?: Date } = {},
): Promise<CompactOutcome | undefined> => {
  const events = ledger.events();
  const threshold = options.threshold ?? COMPACT_THRESHOLD;
  if (events.length <= threshold) return undefined;
  const lock = await acquireLedgerLock(ledger.directory);
  try {
    const current = ledger.events();
    const upToSeq = current.at(-1)?.seq ?? 0;
    const state = project(current);
    const at = (options.now ?? new Date()).toISOString();
    const snapshot: LedgerEvent = {
      seq: upToSeq + 1,
      at,
      type: "snapshot",
      payload: { upToSeq, state: snapshotState(state) },
    };
    const archived = archiveEvents(ledger.directory, current, options.now);
    ledger.replace([snapshot]);
    return { archived, removed: current.length, snapshotSeq: snapshot.seq };
  } finally {
    releaseLedgerLock(lock);
  }
};
