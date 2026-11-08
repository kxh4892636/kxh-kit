import { PANEL_ID, PANEL_LABEL } from "../contract.js";
import { clientService, type ClientContext, type ClientWorkspace } from "./contract.js";
import { fetchHiddenSessions, fetchNanoFlowRotation, fetchToolkitState } from "./host-api.js";
import { NotesDock } from "./notes-dock.js";
import { ToolkitPanel } from "./panel.js";
import { ToolkitPanelIcon } from "./panel-icon.js";
import { toolkitClientState } from "./state.js";
import {
  guardTombstones,
  hideSessionRow,
  rememberTombstone,
  tombstones,
  type SessionCatalogLike,
} from "./tombstones.js";
import { UndoButton } from "./undo-button.js";

/** 客户端半只硬依赖 slot 服务；其余服务（uiWorkspace/conversation/sessions）按需懒取。 */
export const inject = ["slots"];

/**
 * 客户端插件体：注册侧边栏入口、toolkit 面板与 composer 的「撤回」按钮，
 * 并把宿主侧的工具开关同步到客户端 store（按钮据此隐藏）。
 * @param ctx - 客户端根上下文。
 */
export const apply = (ctx: ClientContext): void => {
  ctx.effect(
    () => () => {
      toolkitClientState.reset();
    },
    "toolkit: client state",
  );
  ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register(
      { name: "sidebar.panellist", id: PANEL_ID, order: 30, label: PANEL_LABEL },
      ToolkitPanelIcon,
    ),
  );
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: PANEL_ID }, ToolkitPanel));
  ctx.slots.inject("conversation.input.right", () =>
    ctx.slots.register(
      {
        name: "conversation.input.right",
        id: "toolkit-undo",
        order: 100,
        inject: () => ({ ctx }),
      },
      UndoButton,
    ),
  );
  ctx.slots.inject("conversation.input.dock", () =>
    ctx.slots.register(
      { name: "conversation.input.dock", id: "nano-flow-notes", order: 5 },
      NotesDock,
    ),
  );
  void fetchToolkitState()
    .then((tools) => toolkitClientState.publish(tools))
    .catch(() => {
      // 宿主路由不可达时保持默认启用：面板会显示具体错误。
    });
  void fetchHiddenSessions().then((ids) => {
    for (const sessionId of ids) rememberTombstone(sessionId);
    applyHiddenRows(ctx);
  });
  ctx.effect(() => {
    const off = ctx.on?.("command/executed", (sessionId: unknown, name: unknown) => {
      if (name !== "rotate" || typeof sessionId !== "string") return;
      followRotation(ctx, sessionId);
    });
    return () => {
      off?.();
    };
  }, "toolkit: rotation follow");
};

/**
 * `/rotate` 之后把视图切到新会话：读宿主最近一次轮转记录，只认当前会话触发的那次。
 * @param ctx - 客户端根上下文。
 * @param sessionId - 执行命令的旧会话 id。
 */
const followRotation = (ctx: ClientContext, sessionId: string): void => {
  void fetchNanoFlowRotation()
    .then((rotation) => {
      if (rotation === null || rotation.from !== sessionId) return undefined;
      rememberTombstone(rotation.from);
      hideSessionRow(clientService<SessionCatalogLike>(ctx, "sessions"), rotation.from);
      refreshCatalog(ctx);
      const workspace = clientService<ClientWorkspace>(ctx, "uiWorkspace");
      if (workspace === undefined || typeof workspace.openSession !== "function") {
        return undefined;
      }
      return workspace.openSession(rotation.to);
    })
    .catch(() => {
      // 宿主路由不可达时保持原会话，用户可手动选择新会话。
    });
};

/** 两次目录刷新：覆盖宿主删除窗口 150ms 与落盘。 */
const CATALOG_REFRESH_DELAYS_MS = [600, 1800];

/**
 * 让会话目录重读一次，使被轮转掉的旧行立即消失。
 * @param ctx - 客户端根上下文。
 */
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

/**
 * 把「已撤回」的会话行从目录里摘掉。
 *
 * 宿主 `session/list` 会合并存活会话，删掉日志也仍会被列出（只有重启宿主才消失），
 * 因此这里用宿主「会话已销毁」时走的同一条路径移除行；服务尚未就绪时按 300ms 重试。
 * @param ctx - 客户端根上下文。
 * @param attempt - 已重试次数。
 */
const applyHiddenRows = (ctx: ClientContext, attempt = 0): void => {
  const catalog = clientService<SessionCatalogLike>(ctx, "sessions");
  const ids = tombstones();
  if (ids.length === 0) return;
  let hidden = 0;
  for (const sessionId of ids) if (hideSessionRow(catalog, sessionId)) hidden += 1;
  guardTombstones(catalog);
  if (hidden < ids.length && attempt < HIDDEN_RETRIES) {
    setTimeout(() => applyHiddenRows(ctx, attempt + 1), HIDDEN_RETRY_MS);
  }
};

/** 服务未就绪时的重试节奏：20 × 300ms 覆盖首屏加载。 */
const HIDDEN_RETRIES = 20;
const HIDDEN_RETRY_MS = 300;
