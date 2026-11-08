import type { NanoFlowRotation } from "../contract.js";
import {
  clientService,
  type ClientContext,
  type ClientSelectionStore,
  type ClientWorkspace,
} from "./contract.js";
import { fetchNanoFlowRotation } from "./host-api.js";
import {
  guardTombstones,
  hideSessionRow,
  rememberTombstone,
  type SessionCatalogLike,
} from "./tombstones.js";

/** 两次目录刷新：覆盖宿主删除窗口 150ms 与落盘。 */
const CATALOG_REFRESH_DELAYS_MS = [600, 1800];

/** 打开新会话的重试节奏：目录刷新最晚按 1.8s 估，第一次仍立即尝试。 */
const OPEN_RETRY_DELAYS_MS = [0, 600, 1800];

/**
 * 已经跟随过的轮转（旧会话 id）。
 *
 * 轮转只能自动触发；根级订阅与会话面板轮询两条路径都会到这里，
 * 同一会话必须只切一次，因此按旧会话 id 记账（打开成功后才记）。
 */
const followed = new Set<string>();

/** 根级跟随是否在跑：dock 的 5s 轮询只在它缺席时兜底。 */
let rootFollowInstalled = false;

/** 根级跟随当前是否已安装（dock 据此决定要不要轮询）。 */
export const rotationFollowInstalled = (): boolean => rootFollowInstalled;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** 会话已经切走之后补一次目录刷新。 */
const refreshCatalog = (ctx: ClientContext): void => {
  const sessions = clientService<{ refresh?: () => unknown }>(ctx, "sessions");
  const refresh = sessions?.refresh;
  if (typeof refresh !== "function") return;
  for (const delay of CATALOG_REFRESH_DELAYS_MS) {
    setTimeout(() => {
      try {
        refresh.call(sessions);
      } catch {
        // 连接中断等情况下刷新失败不影响切换。
      }
    }, delay);
  }
};

/** 当前主视图会话 id；宿主没有选择 store 时 undefined。 */
const currentSession = (workspace: ClientWorkspace): string | undefined =>
  workspace.selection?.getSnapshot().sessionId;

/** 用户是否已经自己切到第三个会话（既不是轮转源也不是目标）。 */
const userMovedAway = (workspace: ClientWorkspace, from: string, to: string): boolean => {
  const current = currentSession(workspace);
  return current !== undefined && current !== from && current !== to;
};

/**
 * 应用一次轮转：隐藏旧行、刷新目录，再把主视图切到新会话。
 *
 * 每次打开前都重读导航选择：用户中途自己切走就不抢导航；打开失败按
 * {@link OPEN_RETRY_DELAYS_MS} 重试（新会话可能还没出现在客户端目录里）。
 * @param ctx - 客户端根上下文。
 * @param workspace - 工作区导航服务。
 * @param from - 被轮转的旧会话 id。
 * @param to - 轮转创建的新会话 id。
 * @returns 是否把主视图切到了新会话。
 */
const applyRotation = async (
  ctx: ClientContext,
  workspace: ClientWorkspace,
  from: string,
  to: string,
): Promise<boolean> => {
  if (userMovedAway(workspace, from, to)) return false;
  const sessions = clientService<SessionCatalogLike>(ctx, "sessions");
  rememberTombstone(from);
  hideSessionRow(sessions, from);
  // 目录重读可能把旧行列回来（宿主把归档中的会话仍当活的），墓碑要持续生效。
  guardTombstones(sessions);
  refreshCatalog(ctx);
  for (const delay of OPEN_RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    if (userMovedAway(workspace, from, to)) return false;
    if (currentSession(workspace) === to) return true;
    try {
      await workspace.openSession(to);
      return true;
    } catch {
      // 目录可能还没列到新会话：按重试节奏再等。
    }
  }
  console.warn(`nano-flow: 轮转后未能自动切到新会话 ${to}（旧会话 ${from}）`);
  return false;
};

/**
 * 回读最近一次轮转；若正是 `from` 被轮转，就执行跟随。
 * @param ctx - 客户端根上下文。
 * @param workspace - 工作区导航服务。
 * @param from - 当前离开/被轮转的会话 id。
 * @returns 是否执行了切换。
 */
const follow = async (
  ctx: ClientContext,
  workspace: ClientWorkspace,
  from: string,
): Promise<boolean> => {
  if (followed.has(from)) return false;
  let rotation: NanoFlowRotation | null;
  try {
    rotation = await fetchNanoFlowRotation();
  } catch {
    return false;
  }
  if (rotation === null || rotation.from !== from) return false;
  const applied = await applyRotation(ctx, workspace, from, rotation.to);
  if (applied) followed.add(from);
  return applied;
};

/**
 * 跟随一次轮转：宿主最近一次轮转的旧会话若是当前会话，就隐藏旧行并打开新会话。
 *
 * 这是会话面板轮询的兜底入口（根级订阅缺席时才会被调用）。
 * @param ctx - 客户端根上下文。
 * @param sessionId - 当前会话 id。
 * @returns 是否真的切到了新会话。
 */
export const followRotation = async (ctx: ClientContext, sessionId: string): Promise<boolean> => {
  if (sessionId === "") return false;
  const workspace = clientService<ClientWorkspace>(ctx, "uiWorkspace");
  if (workspace === undefined || typeof workspace.openSession !== "function") return false;
  return follow(ctx, workspace, sessionId);
};

/**
 * 从「当前会话被换走」这件事出发跟随轮转。
 *
 * 轮转一完成，宿主就归档并物理删除旧会话；客户端的归档清理（`clearArchivedCurrent`）
 * 会**立刻**清空当前选择、卸掉会话视图——挂在会话面板里的 5s 轮询这时已经来不及。
 * 所以跟随挂在客户端根上：订阅导航选择 store，离开旧会话时回读轮转记录再切过去。
 * @param ctx - 客户端根上下文（`uiWorkspace` 已就绪）。
 * @returns 取消订阅的 disposer。
 */
export const installRotationFollow = (ctx: ClientContext): (() => void) => {
  const workspace = clientService<ClientWorkspace>(ctx, "uiWorkspace");
  if (workspace === undefined || typeof workspace.openSession !== "function") {
    console.warn("nano-flow: 宿主没有 uiWorkspace.openSession，轮转后不会自动切视图");
    return () => {};
  }
  const selection: ClientSelectionStore | undefined = workspace.selection;
  if (selection === undefined || typeof selection.getSnapshot !== "function") {
    console.warn("nano-flow: 宿主没有 uiWorkspace.selection，轮转后不会自动切视图");
    return () => {};
  }

  let last = selection.getSnapshot().sessionId;
  let pending = false;
  const onChange = (): void => {
    const current = selection.getSnapshot().sessionId;
    if (current === last) return;
    const previous = last;
    last = current;
    if (previous === undefined || pending) return;
    pending = true;
    void follow(ctx, workspace, previous)
      .catch(() => false)
      .finally(() => {
        pending = false;
      });
  };

  rootFollowInstalled = true;
  const off =
    typeof selection.subscribe === "function"
      ? selection.subscribe(onChange)
      : ((): (() => void) => {
          // 没有订阅能力时退化为轻量轮询（只读本地 store，不发请求）。
          const timer = setInterval(onChange, 500);
          return () => {
            clearInterval(timer);
          };
        })();
  return () => {
    rootFollowInstalled = false;
    off();
  };
};

/** 清空「已跟随」记账；测试用。 */
export const resetRotationFollow = (): void => {
  followed.clear();
  rootFollowInstalled = false;
};
