import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
import type Schema from "@deepseek-ai/schemastery";
import type { UndoAvailability, UndoTurnResponse } from "./contract.js";
import type { NanoFlowReadyResponse } from "./contract.js";
import { createNanoFlowSettingsStore, nodeNanoFlowSettingsIo } from "./host/nano-flow-settings.js";
import { readNanoFlowReady } from "./host/nano-flow-ready.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "./host/nano-flow-facade.js";
import type { NanoFlowSettings } from "./contract.js";
import { createNanoFlowTool } from "./host/tools/nano-flow.js";
import { applyNanoFlow } from "./nano-flow/plugin.js";
import { DEFAULT_DOMAIN_ROOT } from "./nano-flow/config.js";
import { NANO_FLOW_PRESET_ID, nanoFlowEntryUrl } from "./nano-flow/preset.js";
import { createNestedSkillTool } from "./host/tools/nested-skill.js";
import { createOfficeSkillsTool } from "./host/tools/office-skills.js";
import { createUndoTurnTool } from "./host/tools/undo-turn.js";
import { registerToolkitRoutes, type ToolkitRouteRegistry } from "./host/toolkit-routes.js";
import { ToolkitRegistry } from "./host/toolkit-registry.js";
import { nodeToolkitStateIo, ToolkitStateStore } from "./host/toolkit-state.js";
import { runPendingPurge, runPendingUnarchive } from "./host/undo/purge.js";
import {
  UndoUnavailableError,
  inspectUndo,
  undoTurn,
  type UndoDeps,
} from "./host/undo/undo-turn.js";
import {
  hasMethod,
  serviceOf,
  type HostSessionController,
  type HostSessionPersistence,
  type HostSessionStore,
  type HostWorkspaceRegistry,
} from "./host/services.js";
import { DEFAULT_EXCLUDED_DIRS, type NestedSkillOptions } from "./nested-skill/provider.js";

export { NESTED_SKILL_RANKS, nestedRank, PROVIDER_NAME } from "./nested-skill/provider.js";
export type { NestedSkillSource } from "./nested-skill/provider.js";
export { TOOL_IDS } from "./contract.js";

/** 插件配置：嵌套 skill 工具的选项 + 工具目录状态与会话日志根的位置覆盖。 */
export type Config = NestedSkillOptions & {
  /** 工具状态文件；缺省 `$DSH_HOME/toolkit/state.json`。 */
  stateFile?: string;
  /** 会话日志根；缺省 `$DSH_HOME/sessions`。 */
  sessionsRoot?: string;
  /** Nano Flow 上限设置文件；缺省 `$DSH_HOME/toolkit/nano-flow.json`。 */
  nanoFlowFile?: string;
  /** Nano Flow 的工作区覆盖（预设行可传）。 */
  workspace?: string;
  /** Nano Flow 的领域根覆盖（预设行可传）。 */
  domainRoot?: string;
  /** 内部：为 true 时只挂载 Nano Flow 预设内的那一半（由预设行传入）。 */
  nanoFlowOnly?: boolean;
};

export const Config: Schema<Config> = z.object({
  watch: z.boolean().default(true),
  watchUsePolling: z.boolean().default(false),
  watchPollIntervalMs: z.number().default(100),
  watchStabilityThresholdMs: z.number().default(200),
  includeUserRoots: z.boolean().default(true),
  agentsHome: z.string(),
  excludedDirs: z.array(z.string()).default(DEFAULT_EXCLUDED_DIRS),
  extraRoots: z.array(z.string()).default([]),
  stateFile: z.string(),
  sessionsRoot: z.string(),
  nanoFlowFile: z.string(),
  workspace: z.string(),
  domainRoot: z.string(),
  nanoFlowOnly: z.boolean(),
});

export const name = "toolkit";
export const inject = ["skills"];

/**
 * 挂载工具集：注册路由、按持久状态启停工具，并清理上次运行遗留的待删除会话。
 * @param ctx - 插件所在 cordis 上下文。
 * @param config - 插件配置；全部字段可选。
 */
export const apply = (ctx: Context, config: Config = {}): void => {
  if (config.nanoFlowOnly === true) {
    applyNanoFlow(ctx, config);
    return;
  }
  const runtime = createRuntime(ctx, config);
  ctx.effect(() => () => void runtime.dispose(), "toolkit: runtime");
  ctx.inject(["connection"], (child: Context) => {
    const connection = serviceOf<ToolkitRouteRegistry>(child, "connection");
    if (!hasRouteRegistry(connection)) return;
    const disposeRoutes = registerToolkitRoutes({
      registry: runtime.registry,
      connection,
      logger: ctx.logger,
      undo: {
        inspect: (sessionId: string) => runtime.inspect(sessionId),
        run: (sessionId: string) => runtime.undo(sessionId),
      },
      hiddenSessions: () => runtime.hiddenSessions(),
      nanoFlow: {
        get: () => runtime.nanoFlow.get(),
        update: (patch: unknown) => runtime.nanoFlow.update(patch),
      },
      nanoFlowReady: (sessionId: string) => runtime.ready(sessionId),
    });
    child.effect(() => disposeRoutes, "toolkit: routes");
  });
  ctx.inject(["workspaceRegistry"], (child: Context) => {
    void runtime.cleanupArchive(child);
  });
  void runtime.start();
};

/** 运行期：状态存储、工具注册表与宿主服务的懒查找。 */
interface ToolkitRuntime {
  readonly registry: ToolkitRegistry;
  start(): Promise<void>;
  /** 已撤回、应在客户端隐藏的会话 id。 */
  hiddenSessions(): readonly string[];
  /** Nano Flow 上限设置（面板路由读写）。 */
  readonly nanoFlow: {
    get(): NanoFlowSettings;
    update(patch: unknown): Promise<NanoFlowSettings>;
  };
  /** 工作区注册表就绪后，把日志已删的会话从归档集合里摘掉。 */
  cleanupArchive(ctx: Context): Promise<void>;
  dispose(): Promise<void>;
  inspect(sessionId: string): UndoAvailability;
  undo(sessionId: string): Promise<UndoTurnResponse>;
  /** ready 面板数据：按会话解析 Nano Flow 的 active Plan。 */
  ready(sessionId: string): Promise<NanoFlowReadyResponse>;
}

const createRuntime = (ctx: Context, config: Config): ToolkitRuntime => {
  const logger = ctx.logger;
  const home = resolveDshHome();
  const sessionsRoot = config.sessionsRoot ?? join(home, "sessions");
  const store = new ToolkitStateStore(
    nodeToolkitStateIo(config.stateFile ?? join(home, "toolkit", "state.json")),
  );
  const settings = createNanoFlowSettingsStore(
    nodeNanoFlowSettingsIo(config.nanoFlowFile ?? join(home, "toolkit", "nano-flow.json")),
    logger,
  );
  const tools = [
    createNestedSkillTool(nestedOptions(config)),
    createUndoTurnTool(),
    createOfficeSkillsTool(),
    createNanoFlowTool({ entryUrl: nanoFlowEntryUrl(import.meta.url) }),
  ];
  const registry = new ToolkitRegistry({ ctx, tools, store, logger });
  /** 广播「会话已移除」：`api-session/removed` 是宿主销毁会话时客户端依赖的那条事件。 */
  const registerRemoval = (sessionId: string): void => {
    const emit = (ctx as { emit?: (event: string, ...args: unknown[]) => void }).emit;
    if (typeof emit !== "function") return;
    emit.call(ctx, "api-session/removed", sessionId);
  };
  const undoTarget = (): UndoDeps | undefined => {
    const sessions = serviceOf<HostSessionStore>(ctx, "sessions");
    const controller = serviceOf<HostSessionController>(ctx, "sessionController");
    if (!hasMethod<HostSessionStore>(sessions, "get")) return undefined;
    if (!hasMethod<HostSessionController>(controller, "fork")) return undefined;
    return {
      sessions,
      controller,
      workspaces: workspaceRegistry(ctx),
      store,
      sessionsRoot,
      logger,
      announceRemoved: (sessionId: string) => {
        void store.addHiddenSession(sessionId).catch((error: unknown) => {
          logger.warn(`toolkit: recording hidden session failed: ${describe(error)}`);
        });
        try {
          // 宿主「会话已销毁」用的同一条广播：客户端据此把那一行摘掉。
          registerRemoval?.(sessionId);
        } catch (error) {
          logger.warn(`toolkit: announcing removal failed: ${describe(error)}`);
        }
      },
    };
  };
  const nanoFlow: ToolkitNanoFlowFacade = {
    settings: () => settings.current(),
    updateSettings: (patch: unknown) => settings.update(patch),
    announceRemoved: async (sessionId: string) => {
      await store.addHiddenSession(sessionId);
      registerRemoval(sessionId);
    },
    recordPendingDelete: async (sessionId: string) => {
      await store.addPendingDelete(sessionId);
    },
    sessionsRoot: () => sessionsRoot,
  };
  ctx.effect(() => {
    try {
      const disposer = (
        ctx as unknown as { provide?: (name: string, value: unknown) => unknown }
      ).provide?.(NANO_FLOW_SERVICE, nanoFlow);
      return typeof disposer === "function"
        ? () => {
            void (disposer as () => unknown)();
          }
        : () => {};
    } catch (error) {
      logger.warn(`toolkit: providing ${NANO_FLOW_SERVICE} failed: ${describe(error)}`);
      return () => {};
    }
  }, "toolkit: nano-flow service");

  return {
    registry,
    nanoFlow: {
      get: () => settings.current(),
      update: (patch: unknown) => settings.update(patch),
    },
    async start() {
      try {
        await settings.load();
        await registry.initialize();
        const workspaces = workspaceRegistry(ctx);
        await runPendingPurge(
          store,
          sessionsRoot,
          logger,
          undefined,
          workspaces === undefined
            ? undefined
            : async (sessionId: string) => {
                await workspaces.unarchiveSession(sessionId);
              },
        );
      } catch (error) {
        logger.warn(`toolkit: start failed: ${describe(error)}`);
      }
    },
    hiddenSessions() {
      return store.snapshot().hiddenSessionIds;
    },
    async cleanupArchive(child: Context) {
      const workspaces = workspaceRegistry(child);
      if (workspaces === undefined) return;
      try {
        await runPendingUnarchive(
          store,
          async (sessionId: string) => {
            await workspaces.unarchiveSession(sessionId);
          },
          logger,
        );
        await sweepOrphanArchives(child, workspaces, logger);
      } catch (error) {
        logger.warn(`toolkit: archive cleanup failed: ${describe(error)}`);
      }
    },
    async dispose() {
      await registry.dispose();
    },
    inspect(sessionId) {
      const deps = undoTarget();
      if (deps === undefined) return { available: false, reason: "unsupported-host" };
      return inspectUndo(deps, sessionId);
    },
    async undo(sessionId) {
      const deps = undoTarget();
      if (deps === undefined) {
        throw new UndoUnavailableError("unsupported-host", "this host exposes no session control");
      }
      return undoTurn(deps, sessionId);
    },
    async ready(sessionId) {
      const sessions = serviceOf<HostSessionStore>(ctx, "sessions");
      const session = sessions?.get(sessionId);
      if (session === undefined) return { available: false, reason: "session-not-live" };
      if (session.header?.agentPreset !== NANO_FLOW_PRESET_ID) {
        return { available: false, reason: "not-nano-flow" };
      }
      const workspace = config.workspace ?? session.header.cwd;
      if (workspace === undefined || workspace === "") {
        return { available: false, reason: "no-workspace" };
      }
      return readNanoFlowReady({
        workspace,
        domainRoot: config.domainRoot ?? DEFAULT_DOMAIN_ROOT,
        limits: settings.current(),
      });
    },
  };
};

/**
 * 清掉「归档集合里、但会话已经不存在」的 id：日志删掉之后留下的最后一点痕迹。
 * 活着的会话与会话日志仍在的会话都保留（它们的归档是有意义的）。
 */
const sweepOrphanArchives = async (
  ctx: Context,
  workspaces: HostWorkspaceRegistry,
  logger: { warn(message: string): void },
): Promise<void> => {
  const archived = workspaces.archivedSessionIds;
  if (archived.length === 0) return;
  const persistence = serviceOf<HostSessionPersistence>(ctx, "sessionPersistence");
  const sessions = serviceOf<HostSessionStore>(ctx, "sessions");
  const stored =
    hasMethod<HostSessionPersistence>(persistence, "list") === true
      ? new Set((await persistence.list()).map((snapshot) => snapshot.header.id))
      : undefined;
  for (const sessionId of archived) {
    if (sessions !== undefined && sessions.get(sessionId) !== undefined) continue;
    if (stored !== undefined && stored.has(sessionId)) continue;
    try {
      await workspaces.unarchiveSession(sessionId);
    } catch (error) {
      logger.warn(`toolkit: dropping orphan archive "${sessionId}" failed: ${describe(error)}`);
    }
  }
};

const workspaceRegistry = (ctx: Context): HostWorkspaceRegistry | undefined => {
  const service = serviceOf<HostWorkspaceRegistry>(ctx, "workspaceRegistry");
  if (!hasMethod<HostWorkspaceRegistry>(service, "list")) return undefined;
  if (!hasMethod<HostWorkspaceRegistry>(service, "archiveSession")) return undefined;
  return service;
};

/** `ctx.connection.fetch` 是对象而不是函数，因此单独判断其 `register` 成员。 */
const hasRouteRegistry = (service: unknown): service is ToolkitRouteRegistry => {
  if (typeof service !== "object" || service === null) return false;
  const fetch = (service as { fetch?: unknown }).fetch;
  if (typeof fetch !== "object" || fetch === null) return false;
  return typeof (fetch as { register?: unknown }).register === "function";
};

/** 只把嵌套 skill 工具认识的字段传下去，避免工具集选项被当成 provider 选项。 */
const nestedOptions = (config: Config): NestedSkillOptions => {
  const options: NestedSkillOptions = {};
  if (config.watch !== undefined) options.watch = config.watch;
  if (config.watchUsePolling !== undefined) options.watchUsePolling = config.watchUsePolling;
  if (config.watchPollIntervalMs !== undefined) {
    options.watchPollIntervalMs = config.watchPollIntervalMs;
  }
  if (config.watchStabilityThresholdMs !== undefined) {
    options.watchStabilityThresholdMs = config.watchStabilityThresholdMs;
  }
  if (config.includeUserRoots !== undefined) options.includeUserRoots = config.includeUserRoots;
  if (config.agentsHome !== undefined) options.agentsHome = config.agentsHome;
  if (config.excludedDirs !== undefined) options.excludedDirs = config.excludedDirs;
  if (config.extraRoots !== undefined) options.extraRoots = config.extraRoots;
  return options;
};

const describe = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
