import type { UndoAvailability, UndoTurnResponse } from "../../contract.js";
import type { ToolkitStateStore } from "../toolkit-state.js";
import type {
  HostSessionController,
  HostSessionStore,
  HostWorkspaceRegistry,
} from "../services.js";
import { deleteSessionLogs, type SessionLogIo } from "./purge.js";
import { findUndoTarget, type UndoTarget } from "./turn-boundary.js";

/** 撤回不可用的原因；路由层转成 409 与 `reason` 字段。 */
export type UndoUnavailableReason = "session-not-live" | "no-previous-turn" | "unsupported-host";

/** 撤回不可用：UI 据此置灰按钮或提示。 */
export class UndoUnavailableError extends Error {
  readonly reason: UndoUnavailableReason;

  constructor(reason: UndoUnavailableReason, message: string) {
    super(message);
    this.name = "UndoUnavailableError";
    this.reason = reason;
  }
}

/** 撤销所需的宿主能力与持久化边界。 */
export interface UndoDeps {
  readonly sessions: HostSessionStore;
  readonly controller: HostSessionController;
  readonly workspaces: HostWorkspaceRegistry | undefined;
  readonly store: ToolkitStateStore;
  readonly sessionsRoot: string;
  readonly logger: { warn(message: string): void };
  readonly logIo?: SessionLogIo;
}

/**
 * 探测某会话能否撤回。
 * @param deps - 宿主能力。
 * @param sessionId - 目标会话。
 * @returns 可用性、不可用原因，以及被撤销那一轮的用户原文。
 */
export const inspectUndo = (deps: UndoDeps, sessionId: string): UndoAvailability => {
  const target = resolveTarget(deps, sessionId);
  if ("reason" in target) return { available: false, reason: target.reason };
  return { available: true, prompt: target.prompt };
};

/**
 * 撤销最后一轮：fork 到上一轮结束 → 归档原会话 → 摘除记账 → 删除原会话日志。
 * 归档失败时不排队删除，避免删掉仍可见的会话。
 * @param deps - 宿主能力。
 * @param sessionId - 被撤销的会话。
 * @returns 新会话 id 与被撤销那一轮的用户原文。
 */
export const undoTurn = async (deps: UndoDeps, sessionId: string): Promise<UndoTurnResponse> => {
  const target = resolveTarget(deps, sessionId);
  if ("reason" in target) throw new UndoUnavailableError(target.reason, target.message);
  const forked = await deps.controller.fork({ sessionId, atSeq: target.cutSeq });
  if (await archive(deps, sessionId)) await retireSource(deps, sessionId);
  return { childSessionId: forked.sessionId, prompt: target.prompt };
};

const resolveTarget = (
  deps: UndoDeps,
  sessionId: string,
): UndoTarget | { reason: UndoUnavailableReason; message: string } => {
  const session = deps.sessions.get(sessionId);
  if (session === undefined) {
    return {
      reason: "session-not-live",
      message: `session "${sessionId}" is not live in this host`,
    };
  }
  const target = findUndoTarget(session.snapshotEvents());
  if (target === undefined) {
    return {
      reason: "no-previous-turn",
      message: "there is no earlier turn to return to",
    };
  }
  return target;
};

/** 归档原会话；失败只降级为「原会话仍可见」，不影响已产生的子会话。 */
const archive = async (deps: UndoDeps, sessionId: string): Promise<boolean> => {
  if (deps.workspaces === undefined) return false;
  try {
    await deps.workspaces.archiveSession(sessionId, { stopActivity: true });
    return true;
  } catch (error) {
    deps.logger.warn(`toolkit: archive of "${sessionId}" failed: ${describe(error)}`);
    return false;
  }
};

/** 摘掉工作区记账并（尽力）删除原会话日志。 */
const retireSource = async (deps: UndoDeps, sessionId: string): Promise<void> => {
  detachFromWorkspace(deps, sessionId);
  if (deps.sessions.get(sessionId) !== undefined) {
    // 会话仍存活在内存里：现在删文件会被存活实例重新写回，推迟到下次启动。
    await deps.store.addPendingDelete(sessionId);
    return;
  }
  const result = await deleteSessionLogs(deps.sessionsRoot, [sessionId], deps.logIo);
  if (result.retained.length > 0) await deps.store.addPendingDelete(sessionId);
};

const detachFromWorkspace = (deps: UndoDeps, sessionId: string): void => {
  if (deps.workspaces === undefined) return;
  for (const record of deps.workspaces.list()) {
    if (!record.sessionIds.includes(sessionId)) continue;
    void record.detachSession(sessionId).catch((error: unknown) => {
      deps.logger.warn(`toolkit: detach of "${sessionId}" failed: ${describe(error)}`);
    });
  }
};

const describe = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
