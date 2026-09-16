/**
 * Host 契约面: 本插件消费的 Host 服务结构子集与本插件对外的 DTO/寻址形状。
 *
 * 只放类型, 不放行为; 宿主契约逐版比对与升级改动集中在本文件, SessionManagerHost 的
 * 实现留在 host.ts。所有 `*Like` 面都是结构子集(运行时对象由 Host 提供)。
 */

/** 投影解析后的会话摘要(来源: sessionController.list + workspace 归属)。 */
export interface SessionListEntry {
  readonly sessionId: string;
  readonly updatedAt: number;
  readonly running: boolean;
  readonly blank: boolean;
  readonly cwd?: string;
  readonly origin?: "subagent";
  readonly parentSessionId?: string;
  readonly title?: string;
  readonly workspaceId?: string;
  readonly workspaceTitle?: string;
  readonly archived: boolean;
}

/** 模型选择。 */
export interface ModelSelection {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
}

/** 单个模型目录项。 */
export interface ModelEntry {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly reasoning?: {
    readonly efforts: readonly {
      readonly id: string;
      readonly name: string;
      readonly description?: string;
    }[];
    readonly defaultEffort?: string;
  };
}

/** 模型目录(provider 分组 + 默认 + 失败隔离)。 */
export interface ModelCatalog {
  readonly default: ModelSelection;
  readonly routableProviders: readonly string[];
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
    readonly models: readonly ModelEntry[];
  }[];
  readonly failures: readonly {
    readonly id: string;
    readonly name: string;
    readonly message: string;
  }[];
}

/** 读取结果里的一条消息(仅 user/assistant 文本; 其余事件以摘要行出现)。 */
export interface HistoryEntry {
  readonly seq: number;
  readonly time: number;
  readonly kind: "user" | "assistant" | "event";
  readonly text: string;
}

/** 会话读取窗口: 消息对齐的最近记录 + 向前翻页游标。 */
export interface HistoryWindow {
  readonly sessionId: string;
  readonly header: {
    readonly id: string;
    readonly createdAt: number;
    readonly cwd?: string;
    readonly origin?: "subagent";
    readonly parentSessionId?: string;
  };
  readonly throughSeq: number;
  readonly entries: readonly HistoryEntry[];
  readonly hasMore: boolean;
}

/** 会话寻址: 普通会话只给 sessionId; 子会话必须给 parentSessionId。 */
export interface SessionAddressInput {
  readonly sessionId: string;
  readonly parentSessionId?: string;
}

/** sessionController 的结构子集(仅本插件使用的方法)。 */
export interface SessionControllerLike {
  list(
    request: { readonly cursor?: string },
    signal?: AbortSignal,
  ): Promise<{ readonly items: SessionSummaryLike[] }>;
  follow(
    request: {
      readonly address:
        | { readonly kind: "session"; readonly sessionId: string }
        | {
            readonly kind: "subagent";
            readonly parentSessionId: string;
            readonly childSessionId: string;
            readonly mode: SubagentMode;
          };
      readonly maxMessages?: number;
    },
    signal?: AbortSignal,
  ): AsyncIterable<FollowFrameLike>;
  page(
    request: {
      readonly address:
        | { readonly kind: "session"; readonly sessionId: string }
        | {
            readonly kind: "subagent";
            readonly parentSessionId: string;
            readonly childSessionId: string;
            readonly mode: SubagentMode;
          };
      readonly throughSeq: number;
      readonly beforeSeq?: number;
      readonly maxMessages?: number;
    },
    signal?: AbortSignal,
  ): Promise<{ readonly records: readonly RuntimeHistoryRecordLike[]; readonly hasMore: boolean }>;
  create(request: {
    readonly workspaceId?: string;
    readonly cwd?: string;
    readonly sessionId?: string;
    readonly agentPreset?: string;
  }): Promise<{ readonly sessionId: string; readonly agentPreset?: string }>;
  selectModel(request: {
    readonly sessionId: string;
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
  }): Promise<{ readonly selected: ModelSelection }>;
  modelCatalog(): Promise<ModelCatalogLike>;
  prompt(
    request: {
      readonly requestId: string;
      readonly sessionId: string;
      readonly mode: "queue" | "steer";
      readonly content: readonly { readonly type: "text"; readonly text: string }[];
    },
    signal?: AbortSignal,
  ): Promise<{ readonly accepted: true }>;
  rename(request: {
    readonly sessionId: string;
    readonly title: string;
  }): Promise<{ readonly title: string; readonly seq: number }>;
}

/** sessionController.list 返回的摘要行(头部 + 投影提示)。 */
export interface SessionSummaryLike {
  readonly sessionId: string;
  readonly updatedAt: number;
  readonly running: boolean;
  readonly blank: boolean;
  readonly parentSessionId?: string;
  readonly origin?: "subagent";
  readonly cwd?: string;
  readonly projections?: {
    readonly asOfSeq: number;
    readonly values: Record<string, unknown>;
  };
}

/** sessionController.modelCatalog 返回形状。 */
export interface ModelCatalogLike {
  readonly default: ModelSelection;
  readonly routableProviders: readonly string[];
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
    readonly models: readonly {
      readonly id: string;
      readonly name: string;
      readonly description?: string;
      readonly reasoning?: unknown;
    }[];
  }[];
  readonly failures: readonly {
    readonly id: string;
    readonly name: string;
    readonly message: string;
  }[];
}

/** 会话历史记录(wire 形状 = `SessionHistoryRecord`); 当前宿主只传 `{ type: "event", event }`。 */
export interface HistoryRecordLike {
  readonly type: "event";
  readonly event: {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: unknown;
  };
}

/**
 * 运行时记录形状: 宿主契约只承诺 event 记录
 * (`@deepseek-ai/dsh-session/chunk-rows` 与其 `chunks` 变体已移除), 但线上负载可能仍是旧形状,
 * 故类型保留 `type: string` 以便文本化层防御性丢弃非 event 记录。
 */
export interface RuntimeHistoryRecordLike extends Omit<HistoryRecordLike, "type"> {
  readonly type: string;
}

/** follow opening snapshot 帧。 */
export interface FollowFrameLike {
  readonly type: "snapshot";
  readonly header: HeaderLike;
  readonly cursor: number;
  readonly records: readonly RuntimeHistoryRecordLike[];
  readonly hasMore: boolean;
}

/** 会话头部(持久化 header; 只声明读取窗口用到的字段)。 */
export interface HeaderLike {
  readonly id: string;
  readonly createdAt: number;
  readonly cwd?: string;
  readonly parentSession?: string;
  readonly origin?: "subagent";
  readonly agentPreset?: string;
}

/** workspaceRegistry 的结构子集。 */
export interface WorkspaceRegistryLike {
  list(): readonly {
    readonly id: string;
    readonly path: string;
    readonly title?: string;
    readonly sessionIds?: readonly string[];
  }[];
  get(id: string):
    | {
        readonly id: string;
        readonly path: string;
        readonly title?: string;
        readonly sessionIds?: readonly string[];
      }
    | undefined;
  readonly archivedSessionIds: readonly string[];
  archiveSession(sessionId: string): Promise<void>;
}

/**
 * 会话投影服务(仅用于解析子会话 identity.mode)。
 * 宿主契约: `stateOf(session, "subagent")` 返回该 unit 的 host state
 * (`{ identity?: SubagentIdentityProjection }`), 不是 snapshot 的 `values`。
 */
export interface SessionProjectionsLike {
  stateOf(
    session: unknown,
    key: "subagent",
  ): { readonly identity?: { readonly mode?: unknown } } | undefined;
}

/** 会话存储(仅用于取 live Session 对象参与投影解析)。 */
export interface SessionStoreLike {
  get(sessionId: string): unknown;
}

/**
 * 会话查询服务的 observeSession(仅用于冷子会话寻址校验)。
 * 宿主契约: `projections` 是 `ProjectionSnapshot`, `values.subagent` 是该 unit 的 view。
 */
export interface SessionQueryLike {
  observeSession(
    sessionId: string,
    options?: { readonly projectionMode?: "none" | "all" },
  ): Promise<{
    readonly projections?:
      | { readonly values: Readonly<Record<string, unknown>> }
      | null
      | undefined;
  }>;
}

/** HostServices: SessionManagerHost 的全部注入槽。 */
export interface HostServices {
  readonly sessionController: SessionControllerLike;
  readonly workspaceRegistry: WorkspaceRegistryLike;
  readonly sessions?: SessionStoreLike;
  readonly sessionProjections?: SessionProjectionsLike;
  readonly sessionQuery?: SessionQueryLike;
}

/** 结构化条件: 值类型收窄到任意 json 对象节点(宿主负载与远端错误都不可静态信任)。 */
export type JsonObjectLike = { readonly [key: string]: unknown };

/** 子会话 destination mode。 */
export type SubagentMode = "one-shot" | "continuable";

/** Host 寻址(供测试复用的别名)。 */
export type HostAddressLike =
  | { readonly kind: "session"; readonly sessionId: string }
  | {
      readonly kind: "subagent";
      readonly parentSessionId: string;
      readonly childSessionId: string;
      readonly mode: SubagentMode;
    };

/** spawn 落位决策: 显式参数优先, 否则空(由 Host 回退)。 */
export interface SpawnLocationDecision {
  readonly workspaceId?: string;
  readonly cwd?: string;
}

/** 会话上下文注入器: 创建后以系统消息注册上下文。 */
export type ContextInstaller = (sessionId: string, context: string) => Promise<void>;
