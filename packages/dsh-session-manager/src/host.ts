import { randomUUID } from "node:crypto";

/**
 * SessionManagerHost: session/model CRUD 的 Host 能力面。
 *
 * 直调 ctx.sessionController 与 ctx.workspaceRegistry(结构上等价子集),
 * 把错误归一化为带 code 的 HostError, 把结果投影为本插件 DTO。
 * 工具只消费本面, 单测以假 HostServices 驱动, 不依赖 DSH 运行时。
 */

/** 任一 RemoteError 形状子集: 只认 code/message/details 三个字段。 */
export interface RemoteErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
}

/** 归一化后的 Host 错误: 保留 code 供调用方分类, message 面向模型/用户。 */
export class HostError extends Error {
  readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "HostError";
    this.code = code;
  }
}

/** 非预期失败统一 code(实现决策: 可读文本 + 日志链)。 */
export const HOST_UNEXPECTED_CODE = "SESSION_MANAGER_TOOL_FAILED";

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
            readonly mode: "one-shot" | "continuable";
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
            readonly mode: "one-shot" | "continuable";
          };
      readonly throughSeq: number;
      readonly beforeSeq?: number;
      readonly maxMessages?: number;
    },
    signal?: AbortSignal,
  ): Promise<{ readonly records: readonly HistoryRecordVariantLike[]; readonly hasMore: boolean }>;
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

/** 历史记录: 原始事件或打包 delta 行(wire 形状, 见 SessionHistoryRecord)。 */
export interface HistoryRecordLike {
  readonly type: "event";
  readonly event: {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: unknown;
  };
}

/** 打包 chunk 行事件(ChunkRowEvent)。 */
export interface ChunkRowEventLike {
  readonly type: `chunkrow/${"text-chunks" | "reasoning-chunks" | "tool-call-chunks"}`;
  readonly seq: number;
  readonly time: number;
  readonly data: unknown;
}

/** 分页记录: 原始事件或打包 chunk 行。 */
export type HistoryRecordVariantLike =
  | HistoryRecordLike
  | { readonly type: "chunks"; readonly event: ChunkRowEventLike };

/** follow opening snapshot 帧。 */
export interface FollowFrameLike {
  readonly type: "snapshot";
  readonly header: HeaderLike;
  readonly cursor: number;
  readonly records: readonly HistoryRecordVariantLike[];
  readonly hasMore: boolean;
}

/** 会话头部(持久化 header)。 */
export interface HeaderLike {
  readonly id: string;
  readonly createdAt: number;
  readonly cwd?: string;
  readonly parentSession?: string;
  readonly origin?: "subagent";
  readonly agentPreset?: string;
  readonly seedLength?: number;
}

/** 历史记录: 原始事件或打包 delta 行。 */
export interface HistoryRecordLike {
  readonly type: "event";
  readonly event: {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: unknown;
  };
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

/** 会话投影服务(仅用于解析子会话 identity.mode)。 */
export interface SessionProjectionsLike {
  stateOf(
    key: "subagent",
    session: unknown,
  ): { readonly values: Readonly<Record<string, unknown>> } | undefined;
}

/** 会话存储(仅用于取 live Session 对象参与投影解析)。 */
export interface SessionStoreLike {
  get(sessionId: string): unknown;
}

/** 会话查询服务的 observeSession(仅用于冷子会话寻址校验)。 */
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

/** 结构化条件: 值类型收窄到字符串的任意 json 节点。 */
type IsKnown = { readonly [key: string]: unknown };

const asObject = (value: unknown): IsKnown | undefined =>
  typeof value === "object" && value !== null ? (value as IsKnown) : undefined;

/** 从 projection 值里取子会话 destination mode; 不可用时返回 undefined。 */
export const subagentModeOf = (
  values: Readonly<Record<string, unknown>> | undefined,
): "one-shot" | "continuable" | undefined => {
  const subagent = asObject(values?.["subagent"]);
  const identity = asObject(subagent?.["identity"]);
  const mode = identity?.["mode"];
  return mode === "continuable" || mode === "one-shot" ? mode : undefined;
};

/** 事件 data 里取文本块内容; 拼不出的返回空串(含打包行的 texts 数组)。 */
export const eventTextOf = (data: unknown): string => {
  const block = asObject(data);
  if (block === undefined) return "";
  const out: string[] = [];
  const content = block["content"];
  if (Array.isArray(content)) {
    for (const part of content) {
      const item = asObject(part);
      if (item?.["type"] !== "text" || typeof item["text"] !== "string") continue;
      out.push(item["text"]);
    }
  }
  if (out.length > 0) return out.join("\n");
  const texts = block["texts"];
  if (Array.isArray(texts) && texts.every((part): part is string => typeof part === "string")) {
    return texts.join("");
  }
  return typeof block["text"] === "string" ? block["text"] : "";
};

const isUserMessage = (record: HistoryRecordLike): boolean =>
  record.type === "event" && record.event.type === "user/message";
const isAssistantMessage = (record: HistoryRecordLike): boolean =>
  record.type === "event" && record.event.type === "assistant/message";
const isChunkRowEvent = (
  event: ChunkRowEventLike | { readonly type: string },
): event is ChunkRowEventLike =>
  event.type === "chunkrow/text-chunks" ||
  event.type === "chunkrow/reasoning-chunks" ||
  event.type === "chunkrow/tool-call-chunks";

const isChunkRecord = (
  record: HistoryRecordVariantLike,
): record is { readonly type: "chunks"; readonly event: ChunkRowEventLike } =>
  record.type === "chunks" && isChunkRowEvent(record.event);

/** 文本化一条历史记录: user/assistant 完整文本, chunk 行展开文本, 其余一行摘要。 */
const entryOf = (record: HistoryRecordVariantLike): HistoryEntry => {
  if (isChunkRecord(record)) {
    const text = eventTextOf(record.event.data);
    if (record.event.type === "chunkrow/text-chunks" && text !== "") {
      return { seq: record.event.seq, time: record.event.time, kind: "assistant", text };
    }
    return {
      seq: record.event.seq,
      time: record.event.time,
      kind: "event",
      text: `[chunk 增量行 ${record.event.type}]`,
    };
  }
  const event = record.event;
  if (isUserMessage(record) || isAssistantMessage(record)) {
    const kind = isUserMessage(record) ? "user" : "assistant";
    return {
      seq: event.seq,
      time: event.time,
      kind,
      text: eventTextOf(event.data),
    };
  }
  return { seq: event.seq, time: event.time, kind: "event", text: `[event ${event.type}]` };
};

/** 归一化未知错误: RemoteError 子集按 code 呈现, 其余落到固定 code。 */
export const normalizeHostError = (error: unknown): HostError => {
  if (error instanceof HostError) return error;
  const like = asObject(error);
  const code = typeof like?.["code"] === "string" ? like["code"] : undefined;
  if (error instanceof Error) {
    return new HostError(
      code ?? "gateway/internal",
      `${code ?? "gateway/internal"}: ${error.message}`,
      error,
    );
  }
  if (code !== undefined) {
    return new HostError(
      code,
      typeof like?.["message"] === "string" ? like["message"] : String(error),
      error,
    );
  }
  return new HostError(HOST_UNEXPECTED_CODE, `${HOST_UNEXPECTED_CODE}: ${String(error)}`, error);
};

/** 选择模型 param → selectModel 请求; 省略 reasoningEffort 时不传。 */
const selectionOf = (
  provider: string,
  model: string,
  reasoningEffort?: string,
): {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
} => ({
  provider,
  model,
  ...(reasoningEffort === undefined || reasoningEffort === "" ? {} : { reasoningEffort }),
});

/** Session/Model 管理 CRUD 的实现面。 */
export class SessionManagerHost {
  private readonly services: HostServices;

  constructor(services: HostServices) {
    this.services = services;
  }

  /** 列全部会话: 摘要 + workspace 归属 + 归档标记(默认隐藏, includeArchived 恢复)。 */
  async list(includeArchived: boolean, signal?: AbortSignal): Promise<SessionListEntry[]> {
    const [records, workspaces, archived] = await Promise.all([
      this.services.sessionController.list({}, signal),
      Promise.resolve(this.services.workspaceRegistry.list()),
      Promise.resolve(this.services.workspaceRegistry.archivedSessionIds),
    ]);
    const archivedSet = new Set(archived);
    const workspaceByPath = new Map(workspaces.map((workspace) => [workspace.path, workspace]));
    const items: SessionListEntry[] = [];
    for (const record of records.items) {
      const workspace = record.cwd === undefined ? undefined : workspaceByPath.get(record.cwd);
      const title =
        typeof record.projections?.values["title"] === "string"
          ? record.projections.values["title"]
          : undefined;
      const workspaceId = workspace?.id;
      const workspaceTitle = workspace?.title;
      items.push({
        sessionId: record.sessionId,
        updatedAt: record.updatedAt,
        running: record.running,
        blank: record.blank,
        archived: archivedSet.has(record.sessionId),
        ...(record.cwd === undefined ? {} : { cwd: record.cwd }),
        ...(record.origin === undefined ? {} : { origin: record.origin }),
        ...(record.parentSessionId === undefined
          ? {}
          : { parentSessionId: record.parentSessionId }),
        ...(title === undefined ? {} : { title }),
        ...(workspaceId === undefined ? {} : { workspaceId }),
        ...(workspaceTitle === undefined ? {} : { workspaceTitle }),
      });
    }
    return includeArchived ? items : items.filter((item) => !item.archived);
  }

  /** 读一段窗口: follow opening snapshot(消息对齐) + 视需要向前 page。 */
  async read(
    address: SessionAddressInput,
    options?: { readonly beforeSeq?: number; readonly maxMessages?: number },
    signal?: AbortSignal,
  ): Promise<HistoryWindow> {
    const hostAddress = await this.hostAddressOf(address);
    const snapshot = await this.openingSnapshot(hostAddress, options?.maxMessages, signal);
    if (options?.beforeSeq === undefined) {
      return this.windowOf(snapshot);
    }
    const page = await this.services.sessionController.page(
      {
        address: hostAddress,
        throughSeq: snapshot.cursor,
        beforeSeq: options.beforeSeq,
        ...(options.maxMessages === undefined ? {} : { maxMessages: options.maxMessages }),
      },
      signal,
    );
    return {
      sessionId: snapshot.header.id,
      header: this.headerOf(snapshot.header),
      throughSeq: snapshot.cursor,
      entries: page.records.map(entryOf),
      hasMore: page.hasMore,
    };
  }

  /** 创建普通会话; 给了模型选择时创建后立即 selectModel。 */
  async spawn(options: {
    readonly workspaceId?: string;
    readonly cwd?: string;
    readonly sessionId?: string;
    readonly provider?: string;
    readonly model?: string;
    readonly reasoningEffort?: string;
  }): Promise<{ readonly sessionId: string }> {
    const created = await this.services.sessionController.create({
      ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    });
    if (options.provider !== undefined && options.model !== undefined) {
      await this.services.sessionController.selectModel({
        sessionId: created.sessionId,
        provider: options.provider,
        model: options.model,
        ...(options.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: options.reasoningEffort }),
      });
    }
    return { sessionId: created.sessionId };
  }

  /** 向会话投递文本消息(queue/steer)。requestId 由插件 mint。 */
  async prompt(
    options: {
      readonly sessionId: string;
      readonly text: string;
      readonly mode: "queue" | "steer";
    },
    signal?: AbortSignal,
  ): Promise<{ readonly accepted: true }> {
    return this.services.sessionController.prompt(
      {
        requestId: randomUUID(),
        sessionId: options.sessionId,
        mode: options.mode,
        content: [{ type: "text", text: options.text }],
      },
      signal,
    );
  }

  /** 模型目录(透传 + 深度归一化)。 */
  async modelList(): Promise<ModelCatalog> {
    const catalog = await this.services.sessionController.modelCatalog();
    return {
      default: catalog.default,
      routableProviders: catalog.routableProviders,
      groups: catalog.groups.map((group) => ({
        id: group.id,
        name: group.name,
        models: group.models.map(modelEntryOf),
      })),
      failures: catalog.failures,
    };
  }

  /** 为会话选择模型, 返回 Host 归一化结果。 */
  async selectModel(options: {
    readonly sessionId: string;
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
  }): Promise<{ readonly selected: ModelSelection }> {
    return this.services.sessionController.selectModel({
      sessionId: options.sessionId,
      ...selectionOf(options.provider, options.model, options.reasoningEffort),
    });
  }

  /** 重命名会话。 */
  async rename(options: {
    readonly sessionId: string;
    readonly title: string;
  }): Promise<{ readonly title: string; readonly seq: number }> {
    return this.services.sessionController.rename(options);
  }

  /** 归档(隐藏)会话。 */
  async archive(sessionId: string): Promise<{ readonly accepted: true }> {
    await this.services.workspaceRegistry.archiveSession(sessionId);
    return { accepted: true };
  }

  /** 轮询直到会话不 running 或超时(pollIntervalMs 间隔)。 */
  async wait(
    options: {
      readonly sessionId: string;
      readonly timeoutMs: number;
      readonly pollIntervalMs: number;
    },
    signal?: AbortSignal,
  ): Promise<SessionListEntry> {
    const deadline = Date.now() + options.timeoutMs;
    let last: SessionListEntry | undefined;
    for (;;) {
      signal?.throwIfAborted();
      const items = await this.list(true, signal);
      last = items.find((item) => item.sessionId === options.sessionId);
      if (last !== undefined && !last.running) return last;
      if (Date.now() >= deadline) {
        throw new HostError(
          "SESSION_MANAGER_TIMEOUT",
          `session "${options.sessionId}" 等待超时(${options.timeoutMs}ms, 当前状态: ${last === undefined ? "无记录" : last.running ? "运行中" : "未运行"})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
    }
  }

  private async openingSnapshot(
    address: HostAddressLike,
    maxMessages: number | undefined,
    signal?: AbortSignal,
  ): Promise<FollowFrameLike> {
    for await (const frame of this.services.sessionController.follow(
      {
        address,
        ...(maxMessages === undefined ? {} : { maxMessages }),
      },
      signal,
    )) {
      if (frame.type !== "snapshot") continue;
      return frame;
    }
    throw new HostError("SESSION_MANAGER_READ_FAILED", "会话读取未返回 opening snapshot");
  }

  private windowOf(snapshot: FollowFrameLike): HistoryWindow {
    return {
      sessionId: snapshot.header.id,
      header: this.headerOf(snapshot.header),
      throughSeq: snapshot.cursor,
      entries: snapshot.records.map(entryOf),
      hasMore: snapshot.hasMore,
    };
  }

  private headerOf(header: HeaderLike): HistoryWindow["header"] {
    return {
      id: header.id,
      createdAt: header.createdAt,
      ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
      ...(header.origin === undefined ? {} : { origin: header.origin }),
      ...(header.parentSession === undefined ? {} : { parentSessionId: header.parentSession }),
    };
  }

  /** 解析 subagent mode: 先投影, 再 cold observeSession, 失败给出明确错误。 */
  private async subagentModeOfAddress(
    address: SessionAddressInput,
  ): Promise<"one-shot" | "continuable"> {
    const live = this.services.sessionProjections;
    const session = this.services.sessions?.get(address.sessionId);
    if (live !== undefined && session !== undefined) {
      const state = live.stateOf("subagent", session);
      const mode = subagentModeOf(state?.values);
      if (mode !== undefined) return mode;
    }
    const query = this.services.sessionQuery;
    if (query !== undefined) {
      const observed = await query.observeSession(address.sessionId, { projectionMode: "all" });
      const mode = subagentModeOf(observed.projections?.values ?? undefined);
      if (mode !== undefined) return mode;
    }
    throw new HostError(
      "SESSION_MANAGER_SUBAGENT_UNAVAILABLE",
      `子会话 "${address.sessionId}" 的投射描述不可用, 无法解析其读取寻址; 请确认父会话仍在运行`,
    );
  }

  /** 构造 Host 寻址: 普通会话 direct; 子会话需 parent+mode。 */
  private async hostAddressOf(address: SessionAddressInput): Promise<HostAddressLike> {
    if (address.parentSessionId === undefined) {
      return { kind: "session", sessionId: address.sessionId };
    }
    return {
      kind: "subagent",
      parentSessionId: address.parentSessionId,
      childSessionId: address.sessionId,
      mode: await this.subagentModeOfAddress(address),
    };
  }
}

/** Host 寻址(供测试复用的别名)。 */
export type HostAddressLike =
  | { readonly kind: "session"; readonly sessionId: string }
  | {
      readonly kind: "subagent";
      readonly parentSessionId: string;
      readonly childSessionId: string;
      readonly mode: "one-shot" | "continuable";
    };

const modelEntryOf = (entry: {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly reasoning?: unknown;
}): ModelEntry => {
  const reasoning = asObject(entry.reasoning);
  if (reasoning === undefined)
    return {
      id: entry.id,
      name: entry.name,
      ...(entry.description === undefined ? {} : { description: entry.description }),
    };
  const effortsRaw = reasoning["efforts"];
  const efforts = Array.isArray(effortsRaw)
    ? effortsRaw
        .map((effort) => {
          const item = asObject(effort);
          return {
            id: typeof item?.["id"] === "string" ? item["id"] : "",
            name: typeof item?.["name"] === "string" ? item["name"] : "",
            ...(typeof item?.["description"] === "string"
              ? { description: item["description"] }
              : {}),
          };
        })
        .filter((effort) => effort.id !== "" && effort.name !== "")
    : [];
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(efforts.length === 0
      ? {}
      : {
          reasoning: {
            efforts,
            ...(typeof reasoning["defaultEffort"] === "string"
              ? { defaultEffort: reasoning["defaultEffort"] }
              : {}),
          },
        }),
  };
};
