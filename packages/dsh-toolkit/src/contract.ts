/**
 * 宿主半与客户端半共享的契约：工具目录、开关与撤销请求的形状。
 * 客户端 bundle 直接内联本模块（相对导入会被打包），因此这里不得引入任何宿主依赖。
 */

/** 工具在面板中的一项：标题与说明用于展示，`enabled` 是宿主当前生效的状态。 */
export interface ToolkitToolInfo {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly enabled: boolean;
}

/** `GET /api/toolkit/state` 的响应。 */
export interface ToolkitStateResponse {
  readonly tools: readonly ToolkitToolInfo[];
}

/** `POST /api/toolkit/state` 的请求体。 */
export interface ToolkitStateRequest {
  readonly id: string;
  readonly enabled: boolean;
}

/** 撤回可用性探测的响应；`prompt` 是被撤销那一轮的用户原文，供确认弹窗预览。 */
export interface UndoAvailability {
  readonly available: boolean;
  /** 不可用原因：`no-previous-turn`、`session-not-live`、`tool-disabled` 等。 */
  readonly reason?: string;
  readonly prompt?: string;
}

/** `POST /api/toolkit/undo-turn` 的请求体。 */
export interface UndoTurnRequest {
  readonly sessionId: string;
}

/** `POST /api/toolkit/undo-turn` 的响应。 */
export interface UndoTurnResponse {
  readonly childSessionId: string;
  readonly prompt: string;
}

/** 宿主路由的错误体；客户端据 `error` 选择本地化文案。 */
export interface ToolkitErrorBody {
  readonly error: string;
  readonly message: string;
}

/** 宿主工具目录路由（连接服务已鉴权，客户端用同源相对地址调用）。 */
export const TOOLKIT_STATE_PATH = "/api/toolkit/state";

/** 撤回工具路由：GET 探测可用性，POST 执行。 */
export const TOOLKIT_UNDO_PATH = "/api/toolkit/undo-turn";

/** 工具 id；状态文件与面板都以此为键。 */
export const TOOL_IDS = {
  nestedSkill: "nested-skill",
  undoTurn: "undo-turn",
  officeSkills: "office-skills",
} as const;

/** 侧边栏入口与主面板共用的 key。 */
export const PANEL_ID = "toolkit";

/** 侧边栏入口显示名。 */
export const PANEL_LABEL = "toolkit";
