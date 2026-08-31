/**
 * 测试支撑: 假 HostServices 与调用记录。
 *
 * 只提供宿主边界的结构等价替身, 不引入任何 DSH 运行时依赖;
 * 覆盖统计排除本文件。
 */
import type { FollowFrameLike, HeaderLike, HistoryRecordLike, HostServices } from "./host.ts";

/** 调用记录容器。 */
export interface FakeCalls {
  list: { readonly cursor?: string; readonly includeArchived?: boolean }[];
  follow: unknown[];
  page: unknown[];
  create: unknown[];
  selectModel: unknown[];
  modelCatalog: number;
  prompt: unknown[];
  rename: unknown[];
  archive: string[];
  observe: string[];
}

/** 假服务的构造参数。 */
export interface FakeOptions {
  readonly items?: readonly {
    readonly sessionId: string;
    readonly updatedAt?: number;
    readonly running?: boolean;
    readonly blank?: boolean;
    readonly cwd?: string;
    readonly origin?: "subagent";
    readonly parentSessionId?: string;
    readonly title?: string;
  }[];
  readonly frames?: FollowFrameLike[];
  readonly pageRecords?: readonly HistoryRecordLike[];
  readonly pageHasMore?: boolean;
  readonly catalogModels?: readonly string[];
  readonly workspaces?: readonly {
    readonly id: string;
    readonly path: string;
    readonly title?: string;
    readonly sessionIds?: readonly string[];
  }[];
  readonly archived?: readonly string[];
  /** 投影解析返回的 subagent mode(仅用于子会话寻址测试)。 */
  readonly subagentMode?: "continuable" | "one-shot";
}

/** 默认会话头。 */
export const headerOf = (id: string, extra?: Partial<HeaderLike>): HeaderLike => ({
  id,
  createdAt: 1788197007031,
  ...extra,
});

/** 默认消息事件记录。 */
export const messageRecordOf = (
  kind: "user/message" | "assistant/message",
  seq: number,
  text: string,
): HistoryRecordLike => ({
  type: "event",
  event: {
    type: kind,
    seq,
    time: 1788197007136 + seq,
    data: { content: [{ type: "text", text }] },
  },
});

/** 默认快照帧。 */
export const snapshotOf = (
  records: HistoryRecordLike[],
  cursor = 10,
  hasMore = false,
  header?: HeaderLike,
): FollowFrameLike => ({
  type: "snapshot",
  header: header ?? headerOf("session-a"),
  cursor,
  records,
  hasMore,
});

/** 构造一套假 HostServices(可覆盖各槽并记录调用)。 */
export const makeFakeServices = (
  options?: FakeOptions,
): { readonly services: HostServices; readonly calls: FakeCalls } => {
  const calls: FakeCalls = {
    list: [],
    follow: [],
    page: [],
    create: [],
    selectModel: [],
    modelCatalog: 0,
    prompt: [],
    rename: [],
    archive: [],
    observe: [],
  };
  const items = options?.items ?? [];
  const services: HostServices = {
    sessionController: {
      list: async (request, _signal) => {
        calls.list.push(request);
        return {
          items: items.map((item) => ({
            sessionId: item.sessionId,
            updatedAt: item.updatedAt ?? 1000,
            running: item.running ?? false,
            blank: item.blank ?? false,
            ...(item.cwd === undefined ? {} : { cwd: item.cwd }),
            ...(item.origin === undefined ? {} : { origin: item.origin }),
            ...(item.parentSessionId === undefined
              ? {}
              : { parentSessionId: item.parentSessionId }),
            ...(item.title === undefined
              ? {}
              : { projections: { asOfSeq: 0, values: { title: item.title } } }),
          })),
        };
      },
      follow: async function* (request, _signal) {
        calls.follow.push(request);
        for (const frame of options?.frames ?? [snapshotOf([])]) yield frame;
      },
      page: async (request, _signal) => {
        calls.page.push(request);
        return { records: options?.pageRecords ?? [], hasMore: options?.pageHasMore ?? false };
      },
      create: async (request) => {
        calls.create.push(request);
        return {
          sessionId: "session-new-1",
          ...(request.agentPreset === undefined ? {} : { agentPreset: request.agentPreset }),
        };
      },
      selectModel: async (request) => {
        calls.selectModel.push(request);
        return {
          selected: {
            provider: request.provider,
            model: request.model,
            ...(request.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: request.reasoningEffort }),
          },
        };
      },
      modelCatalog: async () => {
        calls.modelCatalog++;
        return {
          default: {
            provider: "deepseek-official",
            model: "deepseek-v4-flash",
            reasoningEffort: "max",
          },
          routableProviders: ["deepseek-official"],
          groups: [
            {
              id: "deepseek-official",
              name: "DeepSeek",
              models: (options?.catalogModels ?? ["deepseek-v4-flash"]).map((id) => ({
                id,
                name: id,
                ...(id === "deepseek-v4-pro" ? { description: "pro" } : {}),
              })),
            },
          ],
          failures: [],
        };
      },
      prompt: async (request) => {
        calls.prompt.push(request);
        return { accepted: true as const };
      },
      rename: async (request) => {
        calls.rename.push(request);
        return { title: request.title.toUpperCase(), seq: 42 };
      },
    },
    workspaceRegistry: {
      list: () => options?.workspaces ?? [],
      get: (id) => options?.workspaces?.find((workspace) => workspace.id === id),
      archivedSessionIds: options?.archived ?? [],
      archiveSession: async (sessionId) => {
        calls.archive.push(sessionId);
      },
    },
    sessions: {
      get: (sessionId) => items.find((item) => item.sessionId === sessionId) as unknown,
    },
    sessionProjections: {
      stateOf: (_key, _session) =>
        options?.subagentMode === undefined
          ? undefined
          : { values: { subagent: { identity: { mode: options.subagentMode } } } },
    },
    sessionQuery: {
      observeSession: async (sessionId) => {
        calls.observe.push(sessionId);
        return options?.subagentMode === undefined
          ? { projections: null }
          : { projections: { values: { subagent: { identity: { mode: options.subagentMode } } } } };
      },
    },
  };
  return { services, calls };
};
