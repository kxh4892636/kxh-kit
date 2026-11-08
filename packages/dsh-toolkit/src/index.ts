import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
import type Schema from "@deepseek-ai/schemastery";
import type {
  NanoFlowRotation,
  NanoFlowSettings,
  NotesSnapshot,
  UndoAvailability,
  UndoTurnResponse,
} from "./contract.js";
import { createNanoFlowSettingsStore, nodeNanoFlowSettingsIo } from "./host/nano-flow-settings.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "./host/nano-flow-facade.js";
import { createNanoFlowTool } from "./host/tools/nano-flow.js";
import { applyNanoFlow } from "./nano-flow/plugin.js";
import { assetsCheckScript, locateAssetsRoot } from "./nano-flow/assets.js";
import { formatIssues, runCheck } from "./nano-flow/check-runner.js";
import { DEFAULT_DOMAIN_ROOT } from "./nano-flow/config.js";
import { recordMount, restoreMountReport } from "./nano-flow/mount-report.js";
import { buildNotesSnapshot } from "./nano-flow/notes.js";
import { NANO_FLOW_PRESET_ID, nanoFlowEntryUrl } from "./nano-flow/preset.js";
import { createRotation, type RotationSession } from "./nano-flow/rotate.js";
import { registerRotateCommand } from "./nano-flow/rotate-command.js";
import { createPlanLogService } from "./nano-flow/plan-log-service.js";
import {
  BINDINGS_FILE,
  inheritedPlanDirectory,
  planRelativePath,
  readBindings,
  readBindingsSync,
  writeBindings,
} from "./nano-flow/plan-log.js";
import { listActivePlans } from "./nano-flow/notes.js";
import { hostServices } from "./nano-flow/services.js";
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
  /** 会话↔Plan 绑定表；缺省 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`。 */
  bindingsFile?: string;
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
  bindingsFile: z.string(),
  workspace: z.string(),
  domainRoot: z.string(),
  nanoFlowOnly: z.boolean(),
});

/** 记录一次会话↔Plan 绑定（已绑定则不动）。 */
const recordBinding = async (
  file: string,
  sessionId: string,
  planDirectory: string,
  workspace: string,
): Promise<void> => {
  const table = await readBindings(file);
  if (table[sessionId] !== undefined) return;
  table[sessionId] = {
    planPath: planRelativePath(workspace, planDirectory),
    cwd: workspace,
    boundAt: new Date().toISOString(),
  };
  await writeBindings(file, table);
};

/** 会话↔Plan 绑定表路径：配置优先，缺省落在 `$DSH_HOME/toolkit`。 */
const bindingsFilePath = (config: Config): string =>
  config.bindingsFile !== undefined && config.bindingsFile !== ""
    ? config.bindingsFile
    : join(resolveDshHome(), "toolkit", BINDINGS_FILE);

export const name = "toolkit";
export const inject = ["skills"];

/**
 * 挂载工具集：注册路由、按持久状态启停工具，并清理上次运行遗留的待删除会话。
 * @param ctx - 插件所在 cordis 上下文。
 * @param config - 插件配置；全部字段可选。
 */
export const apply = (ctx: Context, config: Config = {}): void => {
  recordMount("entry", {
    nanoFlowOnly: config.nanoFlowOnly === true,
    via: config.nanoFlowOnly === true ? "preset" : "root",
  });
  if (config.nanoFlowOnly === true) {
    applyNanoFlow(ctx, config);
    return;
  }
  const runtime = createRuntime(ctx, config);
  ctx.effect(() => () => void runtime.dispose(), "toolkit: runtime");
  restoreMountReport();
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
      notes: {
        of: (sessionId: string) => runtime.notesOf(sessionId),
      },
      rotation: () => runtime.lastRotation(),
    });
    child.effect(() => disposeRoutes, "toolkit: routes");
  });
  // 会话轮转挂在宿主层：预设行看不到 `ctx.agent`（cordis 的 inject 守卫），只能由这里按
  // 会话日志里的预设选择判定，再包装 `sessionController.prompt`。
  ctx.inject(["sessionController"], (child: Context) => {
    child.effect(() => {
      /**
       * 轮转后自动跑一次校验（等价于执行 `nano_flow_check`）：校验 Plan，并把轮转前会话的
       * Plan 绑定继承给新会话（与工作区 active Plan 数量无关），让 Note 看板不必等模型
       * 自己调工具就能出现。返回一行结论，由轮转追加到 seed。
       */
      const autoCheck = async (params: {
        sessionId: string;
        previousSessionId: string;
        workspace: string;
      }): Promise<string | undefined> => {
        const domainsPath = config.domainRoot ?? DEFAULT_DOMAIN_ROOT;
        const result = await runCheck({
          script: assetsCheckScript(locateAssetsRoot()),
          workspace: params.workspace,
          domainsPath,
          limits: runtime.nanoFlow.get(),
        });
        // 绑定继承轮转前会话的 Plan，与工作区有几个 active Plan 无关。
        const inherited = inheritedPlanDirectory(
          await readBindings(bindingsFilePath(config)),
          params.previousSessionId,
          params.workspace,
          (directory) => existsSync(directory),
        );
        if (inherited !== undefined) {
          await runtime.bindSession(params.sessionId, inherited, params.workspace);
        }
        const lines: string[] = [];
        if (result.ok) {
          lines.push("轮转后自动执行 `nano_flow_check`：领域文档校验通过，索引已刷新。");
        } else {
          lines.push(`轮转后自动执行 \`nano_flow_check\` 失败，共 ${result.errors.length} 项：`);
          lines.push(formatIssues(result.errors.slice(0, 5)));
          if (result.errors.length > 5)
            lines.push(`…还有 ${result.errors.length - 5} 项，跑一次工具看全部。`);
        }
        lines.push(
          inherited !== undefined
            ? `本会话的 Note 看板绑定已建立（继承轮转前的 Plan：${planRelativePath(params.workspace, inherited)}），无需再跑一次。`
            : "轮转前会话没有绑定 Plan，未建立看板绑定；恢复时确认 Plan 后跑一次 `nano_flow_check`。",
        );
        return lines.join("\n");
      };
      const rotation = createRotation({
        services: hostServices(child),
        config: { presetId: NANO_FLOW_PRESET_ID },
        domainRoot: config.domainRoot ?? DEFAULT_DOMAIN_ROOT,
        settings: () => runtime.nanoFlow.get(),
        autoCheck,
        sessionOf: (sessionId: string) => {
          const sessions = serviceOf<HostSessionStore>(child, "sessions");
          const session = sessions?.get(sessionId);
          return session as unknown as RotationSession | undefined;
        },
        onRotated: (from, to) => runtime.rememberRotation(from, to),
      });
      const disposeRotation = rotation.attach();
      const disposeCommand = registerRotateCommand(child, rotation, NANO_FLOW_PRESET_ID);
      recordMount("rotation", {
        tokenMeter: serviceOf<object>(child, "tokenMeter") !== undefined,
        sessions: serviceOf<object>(child, "sessions") !== undefined,
        workspaceRegistry: serviceOf<object>(child, "workspaceRegistry") !== undefined,
        workingDirectory: serviceOf<object>(child, "workingDirectory") !== undefined,
      });
      return () => {
        disposeCommand();
        disposeRotation();
      };
    }, "toolkit: nano-flow rotation");
  });
  ctx.inject(["workspaceRegistry"], (child: Context) => {
    void runtime.cleanupArchive(child);
  });
  // Plan 轨迹日志：订阅会话事件 firehose（seed 不触发），按轮把 compact 摘要追加到 Plan 的 log.jsonl。
  const planLog = createPlanLogService({
    home: resolveDshHome(),
    bindingsFile: bindingsFilePath(config),
    domainRoot: config.domainRoot ?? DEFAULT_DOMAIN_ROOT,
    logger: ctx.logger,
    plansFor: (workspace: string) => {
      const domainsRoot = isAbsolute(config.domainRoot ?? DEFAULT_DOMAIN_ROOT)
        ? (config.domainRoot ?? DEFAULT_DOMAIN_ROOT)
        : join(workspace, config.domainRoot ?? DEFAULT_DOMAIN_ROOT);
      return listActivePlans(domainsRoot);
    },
  });
  ctx.effect(() => () => void planLog.dispose(), "toolkit: plan log");
  ctx.inject(["sessionPersistence"], (child: Context) => {
    const persistence = serviceOf<{ open(id: string, mode: "read"): Promise<unknown> }>(
      child,
      "sessionPersistence",
    );
    if (persistence === undefined || typeof persistence.open !== "function") return;
    planLog.attach(persistence as never);
    const dispose = child.on(
      "session/event",
      (session: unknown, event: unknown) => {
        planLog.onEvent(session, event);
      },
      { global: true },
    );
    child.effect(() => dispose as () => void, "toolkit: plan log subscription");
  });
  void runtime.start();
};

/** 运行期：状态存储、工具注册表与宿主服务的懒查找。 */
interface ToolkitRuntime {
  readonly registry: ToolkitRegistry;
  start(): Promise<void>;
  /** 已撤回、应在客户端隐藏的会话 id。 */
  hiddenSessions(): readonly string[];
  /** 记录会话↔Plan 绑定（nano_flow 工具成功后调用）。 */
  bindSession(sessionId: string, planDirectory: string, workspace: string): Promise<void>;
  /** Nano Flow 上限设置（面板路由读写）。 */
  readonly nanoFlow: {
    get(): NanoFlowSettings;
    update(patch: unknown): Promise<NanoFlowSettings>;
  };
  /** 当前会话要展示的未完成 note 快照；不写会话日志。 */
  notesOf(sessionId: string): NotesSnapshot | null;
  /** 最近一次轮转记录（from → to）；本次运行还没轮转过时为 null。 */
  lastRotation(): NanoFlowRotation | null;
  /** 记录一次轮转，供客户端切换到新会话。 */
  rememberRotation(from: string, to: string): void;
  inspect(sessionId: string): UndoAvailability;
  undo(sessionId: string): Promise<UndoTurnResponse>;
  /** 工作区注册表就绪后，把日志已删的会话从归档集合里摘掉。 */
  cleanupArchive(ctx: Context): Promise<void>;
  dispose(): Promise<void>;
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
  /** 最近一次轮转（内存即可：命令与客户端切换在同一次宿主运行内完成）。 */
  let lastRotation: NanoFlowRotation | undefined;
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
    bindSession: (sessionId: string, planDirectory: string, workspace: string) =>
      recordBinding(bindingsFilePath(config), sessionId, planDirectory, workspace),
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
    lastRotation() {
      return lastRotation ?? null;
    },
    rememberRotation(from: string, to: string) {
      lastRotation = { from, to, at: new Date().toISOString() };
    },
    async bindSession(sessionId, planDirectory, workspace) {
      await recordBinding(bindingsFilePath(config), sessionId, planDirectory, workspace);
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
    notesOf(sessionId) {
      const sessions = serviceOf<HostSessionStore>(ctx, "sessions");
      if (!hasMethod<HostSessionStore>(sessions, "get")) return null;
      const session = sessions.get(sessionId);
      const workspace =
        config.workspace !== undefined && config.workspace !== ""
          ? config.workspace
          : session?.header?.cwd;
      if (workspace === undefined || workspace === "") return null;
      // 面板只对已绑定 Plan 的会话显示；绑定由 nano_flow 工具执行时写入。
      const binding = readBindingsSync(bindingsFilePath(config))[sessionId];
      if (binding === undefined) return null;
      const planDirectory = isAbsolute(binding.planPath)
        ? binding.planPath
        : join(binding.cwd === "" ? workspace : binding.cwd, binding.planPath);
      try {
        return buildNotesSnapshot(workspace, planDirectory);
      } catch (error) {
        logger.warn(`toolkit: notes snapshot failed: ${describe(error)}`);
        return null;
      }
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
