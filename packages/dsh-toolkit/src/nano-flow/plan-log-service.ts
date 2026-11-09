import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  appendJsonLine,
  BINDINGS_FILE,
  buildTurnRecord,
  groupByTurn,
  isNanoFlowPreset,
  planLogPath,
  readBindings,
  resolvePlanDirectory,
  type BindingTable,
  type CompactTurn,
  type DirectoryExists,
  type PlanBinding,
  type SessionEventLike,
  type SessionHeader,
} from "./plan-log.js";
import { isRecord } from "../shared/record.js";

/** 会话最小的结构形状（宿主 Session）。 */
interface PlanLogSession {
  readonly id?: string;
  readonly header?: {
    readonly cwd?: string;
    readonly origin?: string;
    readonly delegationDepth?: number;
    readonly agentPreset?: string;
  };
}

/** 只读持久化句柄（`sessionPersistence.open(id,'read')` 的结果）。 */
interface ReadHandleLike {
  read(offset?: number, length?: number): Promise<{ readonly events: readonly SessionEventLike[] }>;
  close(): void | Promise<void>;
}

/** 持久化服务的最小形状。 */
export interface PersistenceLike {
  open(id: string, mode: "read"): Promise<ReadHandleLike>;
}

/** 轨迹日志服务选项。 */
interface PlanLogOptions {
  /** `$DSH_HOME`。 */
  readonly home: string;
  /** 绑定表路径；缺省 `$DSH_HOME/toolkit/<BINDINGS_FILE>`。 */
  readonly bindingsFile?: string;
  readonly logger: { warn(message: string): void };
}

/** 轨迹日志服务。 */
interface PlanLogService {
  attach(persistence: PersistenceLike): void;
  onEvent(session: unknown, event: unknown): void;
  dispose(): Promise<void>;
}

interface SessionState {
  readonly sessionId: string;
  /** 会话的 cwd；绑定 `cwd` 失效时用它兜底。 */
  readonly workspace: string;
  readonly binding?: PlanBinding;
  /** 绑定解析出的 Plan 目录；写日志前确认它还在。 */
  planDirectory?: string;
  handle?: ReadHandleLike;
  cursor: number;
  seen: Set<string>;
  headerWritten: boolean;
  /** 目录丢失的告警只报一次，避免每轮刷屏。 */
  skipWarned?: boolean;
  /** 未结束轮的已读事件：跨多次 flush 合并，`turn/end` 到达时一次成型。 */
  pending: Map<number, SessionEventLike[]>;
  chain: Promise<void>;
}

const asSession = (value: unknown): PlanLogSession | undefined =>
  isRecord(value) ? (value as PlanLogSession) : undefined;

const asEvent = (value: unknown): SessionEventLike | undefined =>
  isRecord(value) ? (value as SessionEventLike) : undefined;

const turnedKey = (sessionId: string, turn: number): string => `${sessionId}#${turn}`;

/**
 * 创建 Plan 轨迹日志服务：读绑定、回填、逐轮追加。
 *
 * 只读持久化句柄 + 会话事件 firehose，绝不写会话事件（question 009 的教训）。
 * 绑定不由本服务写入；未绑定时只跟踪事件，绑定后从当前轮开始落盘。
 * @param options - 绑定表位置与日志器。
 * @returns 服务实例。
 */
export const createPlanLogService = (options: PlanLogOptions): PlanLogService => {
  const bindingsFile = options.bindingsFile ?? join(options.home, "toolkit", BINDINGS_FILE);
  const exists: DirectoryExists = existsSync;
  const sessions = new Map<string, SessionState>();
  let persistence: PersistenceLike | undefined;

  const warn = (message: string): void => {
    try {
      options.logger.warn(`nano-flow: plan log ${message}`);
    } catch {
      // 日志失败不影响主流程。
    }
  };

  const loadBindings = async (): Promise<BindingTable> => readBindings(bindingsFile);

  const scanLog = async (
    file: string,
  ): Promise<{ readonly seen: Set<string>; readonly headers: Set<string> }> => {
    const seen = new Set<string>();
    const headers = new Set<string>();
    try {
      const text = await readFile(file, "utf8");
      for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          if (record["type"] === "session" && typeof record["sessionId"] === "string") {
            headers.add(record["sessionId"]);
          }
          if (
            record["type"] === "turn" &&
            typeof record["sessionId"] === "string" &&
            typeof record["turn"] === "number"
          ) {
            seen.add(turnedKey(record["sessionId"], record["turn"]));
          }
        } catch {
          // 单行损坏忽略。
        }
      }
    } catch {
      // 文件不存在：空索引。
    }
    return { seen, headers };
  };

  const ensureState = (session: PlanLogSession): SessionState | undefined => {
    const sessionId = session.id;
    const cwd = session.header?.cwd;
    if (sessionId === undefined || cwd === undefined || cwd === "") return undefined;
    let state = sessions.get(sessionId);
    if (state === undefined) {
      state = {
        sessionId,
        workspace: cwd,
        cursor: -1,
        seen: new Set(),
        headerWritten: false,
        pending: new Map(),
        chain: Promise.resolve(),
      };
      sessions.set(sessionId, state);
    }
    return state;
  };

  /** 绑定身份：cwd 或 planPath 变化时视为切换。 */
  const bindingKey = (binding: PlanBinding): string => `${binding.cwd}\u0000${binding.planPath}`;

  const ensureBound = async (state: SessionState): Promise<void> => {
    const table = await loadBindings();
    const next = table[state.sessionId];
    if (next === undefined) return;
    const previous = state.binding;
    if (previous !== undefined && bindingKey(previous) === bindingKey(next)) return;
    const switching = previous !== undefined;
    const planDirectory = resolvePlanDirectory(next, state.workspace, exists);
    Object.assign(state, { binding: next, planDirectory, skipWarned: false });
    const index = await scanLog(planLogPath(planDirectory));
    state.seen = new Set(index.seen);
    state.headerWritten = index.headers.has(state.sessionId);
    if (switching) return;
    // 只有服务启动时就已绑定才回填；绑定前产生的轮次不属于该 Plan。
    if (state.handle !== undefined || state.cursor >= 0) return;
    if (persistence === undefined) return;
    const handle = await persistence.open(state.sessionId, "read");
    state.handle = handle;
    const snapshot = await handle.read(0);
    let maxSeq = -1;
    for (const event of snapshot.events) {
      if (typeof event.seq === "number" && event.seq > maxSeq) maxSeq = event.seq;
    }
    const boundAt = Date.parse(next.boundAt);
    const owned = (events: readonly SessionEventLike[]): boolean => {
      if (!Number.isFinite(boundAt)) return true;
      const endedAt = events.find((event) => event.type === "turn/end")?.time;
      return typeof endedAt !== "number" || endedAt >= boundAt;
    };
    const turns = groupByTurn(snapshot.events);
    const ordered = [...turns.entries()].sort((left, right) => left[0] - right[0]);
    state.pending.clear();
    for (const [turn, events] of ordered) {
      if (!events.some((event) => event.type === "turn/end")) {
        state.pending.set(turn, [...events]);
        continue;
      }
      if (!owned(events)) continue;
      await appendTurn(state, turn, events);
    }
    state.cursor = Math.max(state.cursor, maxSeq);
  };

  const appendTurn = async (
    state: SessionState,
    turn: number,
    events: readonly SessionEventLike[],
  ): Promise<void> => {
    const binding = state.binding;
    const planDirectory = state.planDirectory;
    if (binding === undefined || planDirectory === undefined) return;
    // Plan 迁移到别的生命周期目录后旧路径不该被重建：目录不在就跳过，别留下孤儿 log.jsonl。
    if (!exists(planDirectory)) {
      if (state.skipWarned !== true) {
        state.skipWarned = true;
        warn(`plan directory missing, skip logging: ${planDirectory}`);
      }
      return;
    }
    const key = turnedKey(state.sessionId, turn);
    if (state.seen.has(key)) return;
    const record: CompactTurn | null = buildTurnRecord({
      sessionId: state.sessionId,
      turn,
      events,
    });
    if (record === null) return;
    const file = planLogPath(planDirectory);
    if (!state.headerWritten) {
      const header: SessionHeader = {
        type: "session",
        v: 1,
        sessionId: state.sessionId,
        // 写文件真实落在 session 的 cwd 上；绑定时的 cwd 可能已失效。
        cwd: state.workspace,
        planPath: binding.planPath,
        boundAt: binding.boundAt,
      };
      await appendJsonLine(file, header);
      state.headerWritten = true;
    }
    await appendJsonLine(file, record);
    state.seen.add(key);
  };

  const flush = async (state: SessionState): Promise<void> => {
    await ensureBound(state);
    if (state.handle === undefined) {
      if (persistence === undefined) return;
      state.handle = await persistence.open(state.sessionId, "read");
    }
    const start = Math.max(state.cursor + 1, 0);
    const read = await state.handle.read(start, 5_000);
    if (read.events.length === 0) return;
    let maxSeq = state.cursor;
    for (const event of read.events) {
      if (typeof event.seq === "number" && event.seq > maxSeq) maxSeq = event.seq;
    }
    const ongoing = [...state.pending.keys()].at(-1);
    const turns = groupByTurn(read.events, ongoing);
    for (const [turn, events] of [...turns.entries()].sort((left, right) => left[0] - right[0])) {
      const buffered = state.pending.get(turn) ?? [];
      const merged = [...buffered, ...events];
      if (!events.some((event) => event.type === "turn/end")) {
        state.pending.set(turn, merged);
        continue;
      }
      // 未绑定：完整轮次直接丢弃，只保留进行中的轮缓冲，供随后绑定接管。
      if (state.binding !== undefined) await appendTurn(state, turn, merged);
      state.pending.delete(turn);
    }
    state.cursor = maxSeq;
  };

  /** 各会话最近一次的预设选择：`true`=nano-flow，`false`=其它，缺席=未知。 */
  const presets = new Map<string, boolean>();

  const onEvent = (rawSession: unknown, rawEvent: unknown): void => {
    const session = asSession(rawSession);
    const event = asEvent(rawEvent);
    if (session === undefined || event === undefined) return;
    const sessionId = session.id;
    if (sessionId === undefined) return;
    if (event.type === "agent-preset/selected") {
      presets.set(sessionId, isNanoFlowPreset([event]));
      return;
    }
    const header = session.header ?? {};
    if (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0) return;
    if (event.type !== "tool/call" && event.type !== "turn/end") return;
    const nanoFlow = presets.get(sessionId);
    if (nanoFlow === false) return;
    const state = ensureState(session);
    if (state === undefined) return;
    const data = event.type === "tool/call" && isRecord(event.data) ? event.data : {};
    const name = typeof data["name"] === "string" ? data["name"] : "";
    const nanoTool = name.startsWith("nano_flow_");
    // 绑定只由 nano_flow_bind 写入；这里只决定是否跟踪会话事件。
    if (
      event.type === "tool/call" &&
      !nanoTool &&
      nanoFlow !== true &&
      state.binding === undefined
    ) {
      return;
    }
    state.chain = state.chain.then(
      () => flush(state),
      () => flush(state),
    );
    state.chain.catch((error: unknown) => {
      warn(`flush failed for ${state.sessionId}: ${String(error)}`);
    });
  };

  return {
    attach(next: PersistenceLike): void {
      persistence = next;
    },
    onEvent,
    async dispose(): Promise<void> {
      for (const state of sessions.values()) {
        try {
          await state.chain;
          await state.handle?.close();
        } catch {
          // 关闭失败忽略。
        }
      }
      sessions.clear();
    },
  };
};
