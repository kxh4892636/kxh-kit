/**
 * 测试支撑: 假 HostServices 与调用记录。
 *
 * 只提供宿主边界的结构等价替身, 不引入任何 DSH 运行时依赖;
 * 覆盖统计排除本文件。
 */
import type {
  FollowFrameLike,
  HeaderLike,
  RuntimeHistoryRecordLike,
  HostServices,
  SubagentMode,
} from "./host.ts";
import { SessionManagerHost } from "./host.ts";

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
  readonly pageRecords?: readonly RuntimeHistoryRecordLike[];
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
  readonly subagentMode?: SubagentMode;
}

/** 默认会话头。 */
export const headerOf = (id: string, extra?: Partial<HeaderLike>): HeaderLike => ({
  id,
  createdAt: 1788197007031,
  ...extra,
});

/**
 * 默认消息事件记录(wire 形状与宿主一致):
 * `user/message` 把块放在 `data.content`, `assistant/message` 放在 `data.message.content`。
 */
export const messageRecordOf = (
  kind: "user/message" | "assistant/message",
  seq: number,
  text: string,
): RuntimeHistoryRecordLike => ({
  type: "event",
  event: {
    type: kind,
    seq,
    time: 1788197007136 + seq,
    data:
      kind === "user/message"
        ? { content: [{ type: "text", text }] }
        : { turn: 1, step: 1, message: { role: "assistant", content: [{ type: "text", text }] } },
  },
});

/** 默认快照帧。 */
export const snapshotOf = (
  records: RuntimeHistoryRecordLike[],
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

/** 严格假 ctx 的构造参数。 */
export interface StrictCtxOptions {
  /** 组合提供的服务面(名字 → 值): 缺席的名字模拟「该组合没有这个服务」。 */
  readonly provided: Readonly<Record<string, unknown>>;
  /** 本层 inject 声明的服务(直读可用; 其余直读抛错)。 */
  readonly injected: readonly string[];
  /** 可选服务是否经 `get` 返回; false 模拟可选服务缺席。 */
  readonly optionalAvailable?: boolean;
}

/**
 * 复刻 cordis strict inject 的假 ctx: 直读未 inject 的服务抛错,
 * `get(name)` 不带 inject 要求地返回组合里的服务(缺席时返回 undefined),
 * `inject(deps, callback)` 只在依赖齐备时执行回调——依赖缺席时回调不执行,
 * 对应真实 cordis 下嵌套 fiber 停在 pending 而不影响入口激活。
 */
export const makeStrictCtx = (options: StrictCtxOptions): Record<string, unknown> => {
  const missing = options.injected.filter((name) => !(name in options.provided));
  if (missing.length > 0) {
    // 条目级 inject 缺一即 pending, app-boot 的 assertEntriesActivated 会抛错。
    throw new Error(`entry pending (waiting for service: ${missing.join(", ")})`);
  }
  const store: Record<string, unknown> = {};
  for (const name of options.injected) store[name] = options.provided[name];
  store["get"] = (name: string): unknown =>
    options.optionalAvailable === false ? undefined : options.provided[name];
  store["inject"] = (deps: readonly string[], callback: (ctx: unknown) => void): void => {
    if (!deps.every((name) => name in options.provided)) return;
    callback(makeStrictCtx({ ...options, injected: [...options.injected, ...deps] }));
  };
  return new Proxy(store, {
    get: (target, prop, receiver) => {
      if (typeof prop === "string" && !(prop in target)) {
        throw new Error(`cannot get property "${prop}" without inject`);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
};

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
      // 形状与宿主一致: stateOf 返回该 unit 的 host state(`{identity}`), key 守卫
      // 镜像宿主分派, 使参数顺序写反时假服务同样落空。
      stateOf: (_session, key) =>
        key === "subagent" && options?.subagentMode !== undefined
          ? { identity: { mode: options.subagentMode } }
          : undefined,
    },
    sessionQuery: {
      observeSession: async (sessionId) => {
        calls.observe.push(sessionId);
        // 形状与宿主一致: ProjectionSnapshot.values.subagent 是 view(无 identity 层)。
        return options?.subagentMode === undefined
          ? { projections: null }
          : { projections: { values: { subagent: { mode: options.subagentMode } } } };
      },
    },
  };
  return { services, calls };
};

/** 以假服务构造 SessionManagerHost(读窗口用例与 host 用例共用)。 */
export const makeHost = (
  options?: FakeOptions,
): { readonly host: SessionManagerHost; readonly calls: FakeCalls } => {
  const fake = makeFakeServices(options);
  return { host: new SessionManagerHost(fake.services), calls: fake.calls };
};
