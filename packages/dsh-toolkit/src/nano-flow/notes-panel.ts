import { isAbsolute, join } from "node:path";

import {
  buildNotesSnapshot,
  NOTES_EVENT,
  NOTES_PROJECTION_KEY,
  NOTES_REFRESH_MS,
  notesStateSchema,
  resolveBoundPlan,
  type AgentLike,
  type NotesState,
} from "./notes.js";

/** 宿主 `ctx.sessionProjections` 的最小形状。 */
export interface ProjectionRegistryLike {
  register(definition: unknown): () => void;
}

/** 会话投影单元定义：宿主据它计算快照。 */
export const notesProjection = {
  key: NOTES_PROJECTION_KEY,
  stateSchema: notesStateSchema,
  init: (): NotesState => null,
  apply: (state: NotesState, event: { type?: string; data?: unknown }): NotesState => {
    if (event?.type !== NOTES_EVENT) return state;
    const next = event.data;
    return next === undefined ? null : (next as NotesState);
  },
  wire: {
    viewSchema: notesStateSchema,
    view: (state: NotesState): NotesState => state,
  },
  stateVersion: 1,
} as const;

/** 面板宿主半的选项。 */
export interface NotesPanelOptions {
  /** 领域根：配置值或默认 `.agents/domains`。 */
  readonly domainRoot: string;
  /** 配置里的工作区覆盖；缺省取会话 header 的 cwd。 */
  readonly workspace?: string | undefined;
  /** 轮询节奏；测试可加速。 */
  readonly refreshMs?: number;
  readonly logger: { warn(message: string): void };
}

/** 面板宿主半：按会话解析 Plan、写快照事件、驱动 5s 轮询。 */
export interface NotesPanel {
  /** 注册进 `ctx.sessionProjections` 的单元定义。 */
  readonly projection: unknown;
  /** 立即重算并（有变化时）写事件。 */
  refresh(agent: unknown): void;
  /** 为会话启动轮询；重复调用无副作用。 */
  attach(agent: unknown): void;
  /** 停止全部轮询。 */
  dispose(): void;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * 创建 note 面板的宿主半。
 *
 * 快照只在变化时写进会话日志；客户端经会话投影读取，所以宿主重启后仍能回放。
 * @param options - 领域根、工作区覆盖、轮询节奏与日志。
 * @returns 面板宿主半。
 */
export const createNotesPanel = (options: NotesPanelOptions): NotesPanel => {
  const timers = new Map<object, ReturnType<typeof setInterval>>();
  const lastBySession = new WeakMap<object, string>();
  const boundBySession = new WeakMap<object, string>();
  let disposed = false;

  const workspaceOf = (agent: AgentLike): string => {
    if (options.workspace !== undefined && options.workspace !== "") return options.workspace;
    const cwd = agent.session?.header?.cwd;
    return cwd === undefined || cwd === "" ? process.cwd() : cwd;
  };

  const refresh = (agent: unknown): void => {
    if (disposed) return;
    if (typeof agent !== "object" || agent === null) return;
    const session = (agent as AgentLike).session;
    if (session === undefined || typeof session.append !== "function") return;
    const workspace = workspaceOf(agent as AgentLike);
    const domainsDirectory = isAbsolute(options.domainRoot)
      ? options.domainRoot
      : join(workspace, options.domainRoot);
    const planDirectory = resolveBoundPlan({
      workspace,
      domainsDirectory,
      boundPlanPath: boundBySession.get(session),
    });
    if (planDirectory !== undefined && !boundBySession.has(session)) {
      boundBySession.set(session, planDirectory);
    }
    const snapshot =
      planDirectory === undefined ? null : buildNotesSnapshot(workspace, planDirectory);
    // 首次就没有可展示内容时不写事件：避免每个会话日志多一条空快照。
    if (!lastBySession.has(session) && snapshot === null) return;
    const json = JSON.stringify(snapshot);
    if (lastBySession.get(session) === json) return;
    try {
      session.append(NOTES_EVENT, snapshot);
      lastBySession.set(session, json);
    } catch (error) {
      options.logger.warn(`nano-flow: 写入 note 面板快照失败: ${describe(error)}`);
    }
  };

  return {
    projection: notesProjection,
    refresh,
    attach(agent: unknown): void {
      if (disposed) return;
      if (typeof agent !== "object" || agent === null) return;
      const session = (agent as AgentLike).session;
      if (session === undefined || timers.has(session)) return;
      const timer = setInterval(() => {
        refresh(agent);
      }, options.refreshMs ?? NOTES_REFRESH_MS);
      (timer as { unref?: () => void }).unref?.();
      timers.set(session, timer);
    },
    dispose(): void {
      disposed = true;
      for (const timer of timers.values()) clearInterval(timer);
      timers.clear();
    },
  };
};
