import { randomUUID } from "node:crypto";
import { entriesOf } from "../history-text.ts";
import { asObject } from "./json-object.ts";
import type {
  ContextInstaller,
  FollowFrameLike,
  HeaderLike,
  HistoryWindow,
  HostAddressLike,
  HostServices,
  ModelCatalog,
  ModelEntry,
  ModelSelection,
  SessionAddressInput,
  SessionListEntry,
  SpawnLocationDecision,
  SubagentMode,
} from "./host-contract.ts";

/**
 * SessionManagerHost: session/model CRUD 的 Host 能力面。
 *
 * 直调 ctx.sessionController 与 ctx.workspaceRegistry(结构上等价子集), 把错误归一化为
 * 带 code 的 HostError, 把结果投影为本插件 DTO; 工具只消费本面, 单测以假 HostServices 驱动。
 * 契约类型集中在 host-contract.ts, 本文件只放行为。
 */

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

const asSubagentMode = (mode: unknown): SubagentMode | undefined =>
  mode === "continuable" || mode === "one-shot" ? mode : undefined;

/**
 * 从投影 host state 取子会话 mode(`stateOf(session, "subagent")` 的返回形状:
 * `{ identity?: { mode } }`); 形状不符时返回 undefined。
 */
export const subagentModeOfState = (state: unknown): SubagentMode | undefined =>
  asSubagentMode(asObject(asObject(state)?.["identity"])?.["mode"]);

/**
 * 从投影 view 值集取子会话 mode(`ProjectionSnapshot.values` 的形状:
 * `values.subagent` 直接是 `{ mode, label?, seq } | null`, 没有 identity 层);
 * 形状不符时返回 undefined。
 */
export const subagentModeOfSnapshotValues = (
  values: Readonly<Record<string, unknown>> | null | undefined,
): SubagentMode | undefined => asSubagentMode(asObject(values?.["subagent"])?.["mode"]);

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

/**
 * 解析 spawn 的 workspace 落位。决策规则: workspaceId/cwd 显式给出时原样透传;
 * 两者都省略时以 callerCwd 兜底(与调用方会话同一 workspace); 均无则返回空(Host 回退默认 cwd)。
 */
export const resolveSpawnLocation = (options: {
  readonly workspaceId?: string;
  readonly cwd?: string;
  readonly callerCwd?: string;
}): SpawnLocationDecision => {
  if (options.workspaceId !== undefined || options.cwd !== undefined) {
    return {
      ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    };
  }
  if (options.callerCwd !== undefined) {
    return { cwd: options.callerCwd };
  }
  return {};
};

/** Session/Model 管理 CRUD 的实现面。 */
export class SessionManagerHost {
  private readonly services: HostServices;
  private readonly contextInstaller: ContextInstaller | undefined;

  constructor(services: HostServices, options?: { readonly contextInstaller?: ContextInstaller }) {
    this.services = services;
    this.contextInstaller = options?.contextInstaller;
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
      entries: entriesOf(page.records),
      hasMore: page.hasMore,
    };
  }

  /** 创建普通会话; 给了模型选择时创建后立即 selectModel; context 经注入器生效。 */
  async spawn(options: {
    readonly workspaceId?: string;
    readonly cwd?: string;
    readonly callerCwd?: string;
    readonly sessionId?: string;
    readonly provider?: string;
    readonly model?: string;
    readonly reasoningEffort?: string;
    readonly context?: string;
  }): Promise<{ readonly sessionId: string }> {
    const location = resolveSpawnLocation({
      ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.callerCwd === undefined ? {} : { callerCwd: options.callerCwd }),
    });
    const created = await this.services.sessionController.create({
      ...(location.workspaceId === undefined ? {} : { workspaceId: location.workspaceId }),
      ...(location.cwd === undefined ? {} : { cwd: location.cwd }),
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    });
    if (options.provider !== undefined && options.model !== undefined) {
      await this.services.sessionController.selectModel({
        sessionId: created.sessionId,
        ...selectionOf(options.provider, options.model, options.reasoningEffort),
      });
    }
    if (
      options.context !== undefined &&
      options.context !== "" &&
      this.contextInstaller !== undefined
    ) {
      await this.contextInstaller(created.sessionId, options.context);
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
      entries: entriesOf(snapshot.records),
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
  private async subagentModeOfAddress(address: SessionAddressInput): Promise<SubagentMode> {
    const live = this.services.sessionProjections;
    const session = this.services.sessions?.get(address.sessionId);
    if (live !== undefined && session !== undefined) {
      const mode = subagentModeOfState(live.stateOf(session, "subagent"));
      if (mode !== undefined) return mode;
    }
    const query = this.services.sessionQuery;
    if (query !== undefined) {
      const observed = await query.observeSession(address.sessionId, { projectionMode: "all" });
      const mode = subagentModeOfSnapshotValues(observed.projections?.values);
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
