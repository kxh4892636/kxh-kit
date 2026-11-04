/**
 * 宿主服务的最小结构性契约。
 *
 * 宿主 0.2.1-rc.5 的实装只发布 JS（无 d.ts），因此这里按用到的字段做结构声明，
 * 出处见注释；形状漂移会在真机验收时暴露，而不是在编译期。
 */

/** 会话事件：`seq` 与日志下标一致（`dsh-session/lib/index.js` 的 `seq = log.length` 契约）。 */
export interface HostSessionEvent {
  readonly type: string;
  readonly seq: number;
  readonly data?: unknown;
}

/** 存活会话：`snapshotEvents()` 返回当前日志快照（`dsh-session/lib/index.js:1452`）。 */
export interface HostSession {
  snapshotEvents(): readonly HostSessionEvent[];
}

/** SessionStore：`ctx.sessions.get(id)` 只返回存活会话（`dsh-session`）。 */
export interface HostSessionStore {
  get(id: string): HostSession | undefined;
}

/** 会话控制器的 fork：`atSeq` 为闭区间切点（`dsh-api-session-controller/lib/index.js:842-848`）。 */
export interface HostSessionController {
  fork(request: { sessionId: string; atSeq: number }): Promise<{ sessionId: string }>;
}

/** 工作区记录：`detachSession` 从记账里摘掉一个会话 id（`dsh-workspace/lib/index.js:148-151`）。 */
export interface HostWorkspaceRecord {
  readonly sessionIds: readonly string[];
  detachSession(sessionId: string): Promise<void>;
}

/** 工作区注册表：归档即移出所有分组视图，`stopActivity` 同时停掉在跑的工作。 */
export interface HostWorkspaceRegistry {
  list(): readonly HostWorkspaceRecord[];
  archiveSession(sessionId: string, options?: { stopActivity?: boolean }): Promise<void>;
}

/** 从任意 cordis 服务表里按名字取服务；取不到时返回 undefined。 */
export const serviceOf = <T>(ctx: { get(key: string): unknown }, key: string): T | undefined => {
  try {
    const service = ctx.get(key);
    return (service as T | undefined) ?? undefined;
  } catch {
    return undefined;
  }
};

/** 结构性判断：对象上是否存在给定方法。 */
export const hasMethod = <T>(service: unknown, method: string): service is T => {
  return (
    typeof service === "object" &&
    service !== null &&
    typeof (service as Record<string, unknown>)[method] === "function"
  );
};
