import type { UndoAvailability, UndoTurnResponse } from "../../contract.js";
import type { ToolkitStateStore } from "../toolkit-state.js";
import type {
  HostSessionController,
  HostSessionStore,
  HostWorkspaceRecord,
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

/** 撤销前从原会话抄下来的「列表身份」：置顶位与记账顺序。 */
interface SourcePlacement {
  readonly record: HostWorkspaceRecord | undefined;
  readonly siblingId: string | undefined;
  readonly pinIndex: number;
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
 * 撤销最后一轮：fork 到上一轮结束 → 归档原会话 → 继承原会话的置顶位与列表位置 → 删除原会话日志。
 *
 * 归档而不是摘除记账：客户端的手动排序把「fork 出来的子会话」排在它的父会话之前，
 * 因此保留原会话的记账槽位，子会话才会落在原会话那一行上；它的日志仍会按下面的规则删除。
 * @param deps - 宿主能力。
 * @param sessionId - 被撤销的会话。
 * @returns 新会话 id 与被撤销那一轮的用户原文。
 */
export const undoTurn = async (deps: UndoDeps, sessionId: string): Promise<UndoTurnResponse> => {
  const target = resolveTarget(deps, sessionId);
  if ("reason" in target) throw new UndoUnavailableError(target.reason, target.message);
  const placement = capturePlacement(deps, sessionId);
  const forked = await deps.controller.fork({ sessionId, atSeq: target.cutSeq });
  if (await archive(deps, sessionId)) {
    await adoptPlacement(deps, forked.sessionId, placement);
    await retireSource(deps, sessionId);
  }
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

/** 记下原会话所在工作区、它在记账里的后继（作为插回锚点）与置顶序号。 */
const capturePlacement = (deps: UndoDeps, sessionId: string): SourcePlacement => {
  const pins = deps.workspaces?.pinnedSessionIds ?? [];
  const pinIndex = pins.indexOf(sessionId);
  for (const record of deps.workspaces?.list() ?? []) {
    const index = record.sessionIds.indexOf(sessionId);
    if (index < 0) continue;
    return { record, siblingId: record.sessionIds[index + 1], pinIndex };
  }
  return { record: undefined, siblingId: undefined, pinIndex };
};

/** 让新会话接管原会话的记账位置与置顶位。 */
const adoptPlacement = async (
  deps: UndoDeps,
  childId: string,
  placement: SourcePlacement,
): Promise<void> => {
  if (placement.record !== undefined) {
    try {
      await placement.record.insertSessionBefore(childId, placement.siblingId);
    } catch (error) {
      deps.logger.warn(`toolkit: placing "${childId}" failed: ${describe(error)}`);
    }
  }
  if (placement.pinIndex < 0 || deps.workspaces === undefined) return;
  await restorePin(deps, childId, placement.pinIndex);
};

/**
 * 把子会话放回原会话的置顶序号：`pinSession` 只能前插，因此按目标顺序倒序重钉一遍。
 * 置顶数量很小，这里的多次写入可以接受。
 */
const restorePin = async (deps: UndoDeps, childId: string, pinIndex: number): Promise<void> => {
  const workspaces = deps.workspaces;
  if (workspaces === undefined) return;
  const desired = [...workspaces.pinnedSessionIds];
  const childAt = desired.indexOf(childId);
  if (childAt >= 0) desired.splice(childAt, 1);
  desired.splice(Math.min(pinIndex, desired.length), 0, childId);
  try {
    for (const id of Array.from(workspaces.pinnedSessionIds)) await workspaces.unpinSession(id);
    for (const id of Array.from(desired).reverse()) await workspaces.pinSession(id);
  } catch (error) {
    deps.logger.warn(`toolkit: restoring pin for "${childId}" failed: ${describe(error)}`);
  }
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

/**
 * 彻底回收原会话：摘掉工作区记账（不再当位置锚点保留）、删除持久化日志、
 * 最后把它从归档集合里去掉，不留任何占位。
 *
 * 日志删除前必须先摘记账：日志还在时若把 id 从归档集合移除，它会作为 Ungrouped 复活。
 * 会话仍存活在内存里时日志要推迟到下次启动删除（存活实例会向已删路径续写出 seq gap），
 * 相应地，归档 id 也留到那次清理完再撤。
 */
const retireSource = async (deps: UndoDeps, sessionId: string): Promise<void> => {
  detachFromWorkspace(deps, sessionId);
  if (deps.sessions.get(sessionId) !== undefined) {
    await deps.store.addPendingDelete(sessionId);
    return;
  }
  const result = await deleteSessionLogs(deps.sessionsRoot, [sessionId], deps.logIo);
  if (result.retained.length > 0) {
    await deps.store.addPendingDelete(sessionId);
    return;
  }
  await unarchive(deps, sessionId);
};

/** 从归档集合里去掉一个已删干净的会话 id。 */
const unarchive = async (deps: UndoDeps, sessionId: string): Promise<void> => {
  if (deps.workspaces === undefined) {
    await deps.store.addPendingUnarchive(sessionId);
    return;
  }
  try {
    await deps.workspaces.unarchiveSession(sessionId);
  } catch (error) {
    deps.logger.warn(`toolkit: unarchive of "${sessionId}" failed: ${describe(error)}`);
    await deps.store.addPendingUnarchive(sessionId);
  }
};

/** 摘掉工作区记账：会话不再属于任何工作区分组。 */
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
