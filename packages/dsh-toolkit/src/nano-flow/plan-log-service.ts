import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  appendJsonLine,
  BINDINGS_FILE,
  buildTurnRecord,
  groupByTurn,
  planLogPath,
  planRelativePath,
  readBindings,
  writeBindings,
  type BindingTable,
  type CompactTurn,
  type PlanBinding,
  type SessionEventLike,
  type SessionHeader,
} from "./plan-log.js";

/** 会话最小的结构形状（宿主 Session）。 */
export interface PlanLogSession {
  readonly id?: string;
  readonly header?: {
    readonly cwd?: string;
    readonly origin?: string;
    readonly delegationDepth?: number;
    readonly agentPreset?: string;
  };
}

/** 只读持久化句柄（`sessionPersistence.open(id,'read')` 的结果）。 */
export interface ReadHandleLike {
  read(offset?: number, length?: number): Promise<{ readonly events: readonly SessionEventLike[] }>;
  close(): void | Promise<void>;
}

/** 持久化服务的最小形状。 */
export interface PersistenceLike {
  open(id: string, mode: "read"): Promise<ReadHandleLike>;
}

/** 轨迹日志服务选项。 */
export interface PlanLogOptions {
  /** `$DSH_HOME`。 */
  readonly home: string;
  /** 领域根（相对工作区或绝对路径）。 */
  readonly domainRoot: string;
  readonly logger: { warn(message: string): void };
  /** 列出工作区下所有 active Plan 目录。 */
  readonly plansFor: (workspace: string) => readonly string[];
}

/** 轨迹日志服务。 */
export interface PlanLogService {
  attach(persistence: PersistenceLike): void;
  onEvent(session: unknown, event: unknown): void;
  dispose(): Promise<void>;
}

interface SessionState {
  readonly sessionId: string;
  readonly binding?: PlanBinding;
  handle?: ReadHandleLike;
  cursor: number;
  seen: Set<string>;
  headerWritten: boolean;
  chain: Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asSession = (value: unknown): PlanLogSession | undefined =>
  isRecord(value) ? (value as PlanLogSession) : undefined;

const asEvent = (value: unknown): SessionEventLike | undefined =>
  isRecord(value) ? (value as SessionEventLike) : undefined;

const turnedKey = (sessionId: string, turn: number): string => `${sessionId}#${turn}`;

/**
 * 创建 Plan 轨迹日志服务：绑定、回填、逐轮追加。
 *
 * 只读持久化句柄 + 会话事件 firehose，绝不写会话事件（question 009 的教训）。
 * @param options - 领域根、绑定表位置与 Plan 枚举器。
 * @returns 服务实例。
 */
export const createPlanLogService = (options: PlanLogOptions): PlanLogService => {
  const bindingsFile = join(options.home, "toolkit", BINDINGS_FILE);
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
        cursor: -1,
        seen: new Set(),
        headerWritten: false,
        chain: Promise.resolve(),
      };
      sessions.set(sessionId, state);
    }
    return state;
  };

  const ensureBound = async (
    session: PlanLogSession,
    state: SessionState,
    allowBind: boolean,
  ): Promise<void> => {
    const sessionId = state.sessionId;
    const cwd = session.header?.cwd ?? "";
    let binding: PlanBinding | undefined;
    const table = await loadBindings();
    const stored = table[sessionId];
    if (stored !== undefined) {
      binding = stored;
    } else {
      if (!allowBind) return;
      const plans = options.plansFor(cwd);
      if (plans.length !== 1) {
        warn(`skip bind for ${sessionId}: expected exactly one active plan, got ${plans.length}`);
        return;
      }
      const plan = plans[0];
      if (plan === undefined) return;
      binding = { planPath: planRelativePath(cwd, plan), cwd, boundAt: new Date().toISOString() };
      table[sessionId] = binding;
      await writeBindings(bindingsFile, table);
    }
    Object.assign(state, { binding });
    const file = planLogPath(binding);
    const index = await scanLog(file);
    state.seen = new Set(index.seen);
    state.headerWritten = index.headers.has(sessionId);
    if (persistence === undefined) return;
    const handle = await persistence.open(sessionId, "read");
    state.handle = handle;
    const snapshot = await handle.read(0);
    let maxSeq = -1;
    for (const event of snapshot.events) {
      if (typeof event.seq === "number" && event.seq > maxSeq) maxSeq = event.seq;
    }
    const turns = groupByTurn(snapshot.events);
    const ordered = [...turns.entries()].sort((left, right) => left[0] - right[0]);
    for (const [turn, events] of ordered) {
      if (!events.some((event) => event.type === "turn/end")) continue;
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
    if (binding === undefined) return;
    const key = turnedKey(state.sessionId, turn);
    if (state.seen.has(key)) return;
    const record: CompactTurn | null = buildTurnRecord({
      sessionId: state.sessionId,
      turn,
      events,
    });
    if (record === null) return;
    const file = planLogPath(binding);
    if (!state.headerWritten) {
      const header: SessionHeader = {
        type: "session",
        v: 1,
        sessionId: state.sessionId,
        cwd: binding.cwd,
        planPath: binding.planPath,
        boundAt: binding.boundAt,
      };
      await appendJsonLine(file, header);
      state.headerWritten = true;
    }
    await appendJsonLine(file, record);
    state.seen.add(key);
  };

  const flush = async (
    state: SessionState,
    session: PlanLogSession,
    allowBind: boolean,
  ): Promise<void> => {
    if (state.binding === undefined) await ensureBound(session, state, allowBind);
    if (state.binding === undefined || state.handle === undefined) return;
    const start = Math.max(state.cursor + 1, 0);
    const read = await state.handle.read(start, 5_000);
    let maxSeq = state.cursor;
    for (const event of read.events) {
      if (typeof event.seq === "number" && event.seq > maxSeq) maxSeq = event.seq;
    }
    const turns = groupByTurn(read.events);
    for (const [turn, events] of [...turns.entries()].sort((left, right) => left[0] - right[0])) {
      if (!events.some((event) => event.type === "turn/end")) continue;
      await appendTurn(state, turn, events);
    }
    state.cursor = maxSeq;
  };

  const onEvent = (rawSession: unknown, rawEvent: unknown): void => {
    const session = asSession(rawSession);
    const event = asEvent(rawEvent);
    if (session === undefined || event === undefined) return;
    const header = session.header ?? {};
    if (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0) return;
    const state = ensureState(session);
    if (state === undefined) return;
    if (event.type === "tool/call") {
      const data = isRecord(event.data) ? event.data : {};
      const name = typeof data["name"] === "string" ? data["name"] : "";
      if (!name.startsWith("nano_flow_")) return;
    }
    if (event.type !== "tool/call" && event.type !== "turn/end") return;
    const allowBind = event.type === "tool/call";
    state.chain = state.chain.then(
      () => flush(state, session, allowBind),
      () => flush(state, session, allowBind),
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
