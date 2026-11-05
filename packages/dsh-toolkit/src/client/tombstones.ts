/**
 * 撤回后的「行墓碑」：宿主把会话当成活的（`session/list` 会合并存活会话，
 * `dsh-session-query/lib/index.js` 的 `listSessions` 里 `this._ctx.sessions.list()`），
 * 因此删掉日志也仍然会被列出来；只有重载宿主或把会话归档才会消失。
 *
 * 这里在**客户端**补一刀：告诉会话目录「这一行已经被删了」（宿主在 `session/disposed`
 * 时就是这么做的 `handleSessionRemoved`），并在每次目录刷新后再补一次，直到宿主重启
 * （那时日志已不存在，宿主自己就不再列出它）。
 * 墓碑放在 localStorage 里，页面刷新也继续生效。
 */

/** 墓碑的存储键；宿主重启后这些 id 不会再次出现，因此允许长期保存。 */
const STORAGE_KEY = "dshtk.tombstones.v1";

/** 读取已记录的墓碑 id。 */
export const tombstones = (): readonly string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
};

/** 记录一个需要隐藏的会话 id（幂等）。 */
export const rememberTombstone = (sessionId: string): void => {
  const current = tombstones();
  if (current.includes(sessionId)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, sessionId]));
  } catch {
    // 存储不可用（隐私模式/配额满）：本页内存里仍然生效。
  }
};

/** 清空墓碑（测试与插件卸载使用）。 */
export const clearTombstones = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略。
  }
};

/** 会话目录最小面：宿主在会话被销毁时会调用的同一个方法。 */
export interface SessionCatalogLike {
  readonly handleSessionRemoved?: (sessionId: string) => void;
  readonly list?: {
    readonly getSnapshot?: () => { readonly ids?: readonly string[] };
    readonly subscribe?: (listener: () => void) => () => void;
  };
}

/**
 * 从会话目录里移除一行；目录没有该方法时返回 false（宿主版本差异，不影响撤回本身）。
 * @param catalog - 客户端 `sessions` 服务。
 * @param sessionId - 要隐藏的会话。
 * @returns 是否真的调用了移除。
 */
export const hideSessionRow = (
  catalog: SessionCatalogLike | undefined,
  sessionId: string,
): boolean => {
  const remove = catalog?.handleSessionRemoved;
  if (typeof remove !== "function") return false;
  try {
    remove.call(catalog, sessionId);
    return true;
  } catch {
    return false;
  }
};

/** 已经在监听的目录（每个目录实例只挂一次）。 */
const guarded = new WeakSet<object>();

/**
 * 让墓碑持续生效：目录每次变化都检查一遍，把重新出现的行再移除。
 * 宿主重启后日志已不存在，目录里不会再出现这些 id，墓碑自然失效。
 * @param catalog - 客户端 `sessions` 服务。
 */
export const guardTombstones = (catalog: SessionCatalogLike | undefined): void => {
  const list = catalog?.list;
  if (catalog === undefined || typeof list?.subscribe !== "function") return;
  if (guarded.has(catalog)) return;
  guarded.add(catalog);
  const sweep = (): void => {
    const ids = list.getSnapshot?.()?.ids ?? [];
    for (const sessionId of tombstones()) {
      if (ids.includes(sessionId)) hideSessionRow(catalog, sessionId);
    }
  };
  list.subscribe(sweep);
  sweep();
};
