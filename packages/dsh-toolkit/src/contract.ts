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

/** 已撤回（应隐藏）的会话 id：客户端启动时据此把残留行摘掉。 */
export const TOOLKIT_HIDDEN_PATH = "/api/toolkit/hidden";

/** `GET /api/toolkit/hidden` 的响应体。 */
export interface ToolkitHiddenResponse {
  readonly ids: readonly string[];
}

/**
 * Nano Flow 的数值上限与轮转阈值；由 toolkit 面板的设置区维护，
 * 持久化在 `$DSH_HOME/toolkit/nano-flow.json`。
 */
export interface NanoFlowSettings {
  /** story.md 单文件上限（字节）。 */
  readonly storyMaxBytes: number;
  /** spec.md 单文件上限（字节）。 */
  readonly specMaxBytes: number;
  /** 单条 note 正文上限（字节）。 */
  readonly noteMaxBytes: number;
  /** note 摘要字数上限。 */
  readonly noteDescriptionMaxChars: number;
  /** 关键索引行数上限。 */
  readonly indexMaxRows: number;
  /** CONTEXT.md 上限（字节）。 */
  readonly contextMaxBytes: number;
  /** QUESTIONS.md 上限（字节）。 */
  readonly questionsMaxBytes: number;
  /** 单个 ADR 上限（字节）。 */
  readonly adrMaxBytes: number;
  /** 单个域的 ADR 数量上限。 */
  readonly adrMaxCount: number;
  /** 上下文占用达到最大上下文的这个比例后轮转会话（0–1）。 */
  readonly rotateAt: number;
}

/** 默认值（面板按 KB 显示）：34 / 34 / 13 KB，144 字，13 行，89 / 89 / 13 KB，55 个 ADR，轮转阈值 0.618。 */
export const DEFAULT_NANO_FLOW_SETTINGS: NanoFlowSettings = {
  storyMaxBytes: 34 * 1024,
  specMaxBytes: 34 * 1024,
  noteMaxBytes: 13 * 1024,
  noteDescriptionMaxChars: 144,
  indexMaxRows: 13,
  contextMaxBytes: 89 * 1024,
  questionsMaxBytes: 89 * 1024,
  adrMaxBytes: 13 * 1024,
  adrMaxCount: 55,
  rotateAt: 0.618,
};

/** `GET /api/toolkit/nano-flow` 的响应体。 */
export interface NanoFlowSettingsResponse {
  readonly settings: NanoFlowSettings;
}

/** `POST /api/toolkit/nano-flow` 的请求体：只提交要改的字段。 */
export interface NanoFlowSettingsRequest {
  readonly patch: Partial<NanoFlowSettings>;
}

/** Nano Flow 设置路由（连接服务已鉴权）。 */
export const TOOLKIT_NANO_FLOW_PATH = "/api/toolkit/nano-flow";

/** Nano Flow ready 面板路由：按会话返回当前 active Plan 的未完成分组。 */
export const TOOLKIT_NANO_FLOW_READY_PATH = "/api/toolkit/nano-flow-ready";

/** note 状态；与 `notes.json` 的 status 一致。 */
export type NanoFlowNoteStatus = "pending" | "in_progress" | "waiting" | "blocked" | "completed";

/** `waiting` 时在等什么：answer 等人回答，review 等验收。 */
export type NanoFlowNoteNeeds = "answer" | "review";

/** ready 面板里的一条 note；不含正文。 */
export interface NanoFlowReadyNote {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: NanoFlowNoteStatus;
  readonly needs?: NanoFlowNoteNeeds;
  readonly blocked_by: readonly string[];
  readonly blocked_reason?: string;
}

/** 依赖组：有依赖关系的 note 在同一组，组内按拓扑顺序。 */
export interface NanoFlowReadyGroup {
  readonly notes: readonly NanoFlowReadyNote[];
}

/** ready 面板头部的计数。 */
export interface NanoFlowReadyCounts {
  readonly total: number;
  readonly pending: number;
  readonly in_progress: number;
  readonly waiting: number;
  readonly blocked: number;
  readonly completed: number;
}

/** 当前 active Plan 的引用。 */
export interface NanoFlowReadyPlan {
  readonly domain: string;
  readonly lifecycle: "active" | "reference" | "archived";
  readonly name: string;
}

/** ready 面板不可用的原因。 */
export type NanoFlowReadyReason =
  | "not-nano-flow"
  | "session-not-live"
  | "no-workspace"
  | "no-active-plan"
  | "multiple-active-plans"
  | "read-failed";

/** `GET /api/toolkit/nano-flow-ready` 的响应体。 */
export interface NanoFlowReadyResponse {
  readonly available: boolean;
  readonly reason?: NanoFlowReadyReason;
  readonly plan?: NanoFlowReadyPlan;
  readonly counts?: NanoFlowReadyCounts;
  readonly groups?: readonly NanoFlowReadyGroup[];
}

/** 工具 id；状态文件与面板都以此为键。 */
export const TOOL_IDS = {
  nestedSkill: "nested-skill",
  undoTurn: "undo-turn",
  officeSkills: "office-skills",
  nanoFlow: "nano-flow",
} as const;

/** 侧边栏入口与主面板共用的 key。 */
export const PANEL_ID = "toolkit";

/** 侧边栏入口显示名。 */
export const PANEL_LABEL = "toolkit";
