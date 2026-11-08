import { randomUUID } from "node:crypto";

import type { NanoFlowSettings } from "../contract.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "../host/nano-flow-facade.js";
import { deleteSessionLogs } from "../host/undo/purge.js";
import { activePlans, listPlans, planRefOf } from "./plan.js";
import type { HostServices } from "./services.js";

/** 会话的最小形状：id、header 与日志快照。 */
export interface RotationSession {
  readonly id: string;
  readonly header?: {
    readonly cwd?: string;
    readonly origin?: string;
    readonly delegationDepth?: number;
    readonly agentPreset?: string;
  };
  /** 会话日志快照；用来读最后一条预设选择事件（live header 的 `agentPreset` 不可靠）。 */
  snapshotEvents?(): readonly { readonly type: string; readonly data?: unknown }[];
}

/** tokenMeter 的上下文压力读取。 */
interface TokenMeterLike {
  contextPressure(session: RotationSession): {
    readonly pressureTokens?: number;
    /** 下一次请求的预计 prompt；与界面占用率同口径。 */
    readonly projectedTokens?: number;
    readonly contextWindow?: number;
  };
}

/** 一次用户 prompt 里本插件需要保留的字段。 */
export interface PromptContentLike {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface PromptRequestLike {
  readonly requestId: string;
  readonly sessionId: string;
  readonly mode: "queue" | "steer";
  readonly content: readonly PromptContentLike[];
  readonly [key: string]: unknown;
}

/** 会话控制器的创建与提示注入。 */
interface SessionControllerLike {
  create(request: { cwd?: string; agentPreset?: string }): Promise<{ sessionId: string }>;
  prompt(request: PromptRequestLike, signal: AbortSignal): Promise<{ accepted: boolean }>;
}

/** 一个工作区记录：会话记账与成员方法。 */
interface WorkspaceRecordLike {
  readonly sessionIds: readonly string[];
  attachSession?(sessionId: string): Promise<void>;
  insertSessionBefore?(sessionId: string, beforeSessionId?: string): Promise<void>;
  detachSession(sessionId: string): Promise<void>;
}

/** 工作区注册表的最小形状（与撤回共用同一套记账；置顶为 0.2 起的新面）。 */
interface WorkspaceRegistryLike {
  list(): readonly WorkspaceRecordLike[];
  archiveSession(sessionId: string, options?: { stopActivity?: boolean }): Promise<void>;
  unarchiveSession(sessionId: string): Promise<void>;
  readonly pinnedSessionIds?: readonly string[];
  pinSession?(sessionId: string): Promise<void>;
  unpinSession?(sessionId: string): Promise<void>;
}

/** 工作目录服务。 */
interface WorkingDirectoryLike {
  get(session: RotationSession): string;
}

/** 轮转所需依赖。 */
export interface RotationOptions {
  readonly services: HostServices;
  readonly config: { readonly presetId?: string; readonly workspace?: string };
  readonly domainRoot: string;
  readonly settings: () => NanoFlowSettings;
  /** 会话 id → 存活会话；取不到时轮转不介入（宿主没有会话存储）。 */
  readonly sessionOf?: (id: string) => RotationSession | undefined;
  /** 会话是否运行本预设；缺省用 {@link selectedPreset} 读日志。 */
  readonly isNanoFlow?: (session: RotationSession) => boolean;
  /** 每次轮转成功后回调（from → to），供路由把目标会话交给客户端切换。 */
  readonly onRotated?: (from: string, to: string) => void;
  /**
   * 新会话建立后立刻跑一次校验（等价于执行一次 `nano_flow_check`）。
   * 返回值是一行结论，会追加到 seed 末尾；抛错只记 warn，不阻断轮转。
   */
  readonly autoCheck?: (params: {
    readonly sessionId: string;
    /** 被轮转的旧会话；新会话继承它的 Plan 绑定。 */
    readonly previousSessionId: string;
    readonly workspace: string;
  }) => Promise<string | undefined>;
}

/**
 * 会话当前运行的预设：以日志里最后一条 `agent-preset/selected` 为准。
 *
 * 存活会话 header 的 `agentPreset` 在恢复会话时并不可靠（回到默认值），
 * 因此优先扫事件，扫不到才退回 header。
 * @param session - 目标会话。
 * @returns 预设 id；两个来源都没有时 undefined。
 */
export const selectedPreset = (session: RotationSession): string | undefined => {
  let events: readonly { readonly type: string; readonly data?: unknown }[] = [];
  try {
    events = session.snapshotEvents?.() ?? [];
  } catch {
    events = [];
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "agent-preset/selected") continue;
    const preset = (event.data as { agentPreset?: unknown } | undefined)?.agentPreset;
    if (typeof preset === "string" && preset !== "") return preset;
  }
  return session.header?.agentPreset;
};

const ROTATE_DELAY_MS = 150;

/** 命令路径退役旧会话的延迟：让 `command/done` 先写进旧会话日志。 */
const MANUAL_RETIRE_DELAY_MS = 500;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const service = <T>(services: HostServices, name: string): T | undefined => {
  try {
    const value = services.get(name);
    return typeof value === "object" && value !== null ? (value as T) : undefined;
  } catch {
    // 读数失败（宿主不暴露该服务）时按缺失处理，轮转直接不介入。
    return undefined;
  }
};

const buildSeed = async (workspace: string, domainRoot: string): Promise<string> => {
  let planReference: string | undefined;
  try {
    const plans = activePlans(await listPlans(workspace, domainRoot));
    const only = plans[0];
    if (plans.length === 1 && only !== undefined) planReference = planRefOf(only);
  } catch {
    planReference = undefined;
  }
  const head =
    planReference === undefined
      ? "恢复当前 Plan：先按 `.agents/domains/CONTEXT-MAP.md` 定位本会话的业务域，工作区里有多个 active 的 Plan 时先问用户是哪个"
      : `恢复当前 Plan：${planReference}`;
  return [
    "（上一会话因上下文达到阈值已轮转；Plan 在磁盘上，状态不丢。）",
    `${head}。`,
    "先读 spec.md 与 notes_index.md，只读报告进度与可推进队列，等用户放行后再执行。",
  ].join("");
};

/**
 * 在用户发送消息时检查上下文压力：达到阈值就把这次 prompt 重定向到新会话。
 *
 * 新会话先拿到「上一会话已轮转 + 继续当前 Plan」的种子，再带上用户这次的消息；
 * 旧会话在新 prompt 被接受后彻底删除。新 prompt 失败时回落到旧会话，消息不丢。
 * 只在 `mode === "queue"`、且该会话确实运行本预设时检查；steer 与其它会话直接放行。
 *
 * 挂在宿主层（根插件）而不是预设行：预设行看不到 `ctx.agent`（cordis 的 inject 守卫），
 * 所以「这个会话是不是 Nano Flow」由会话日志里最后一条 `agent-preset/selected` 判定。
 * @param options - 宿主能力、领域根、设置与会话解析。
 * @returns 还原 prompt 包装的 disposer。
 */
/** 轮转引擎：压力路径挂 prompt 包装，命令路径立即轮转。 */
export interface RotationEngine {
  /** 挂上压力触发的 prompt 包装；返回 disposer。 */
  attach(): () => void;
  /** 立即轮转：建新会话、继承分组/置顶、投递 seed、退役旧会话。 */
  rotate(session: RotationSession, signal?: AbortSignal): Promise<{ readonly accepted: boolean }>;
}

/** 自动轮转时给用户原文套的 XML 标记。 */
const PRIOR_INPUT_TAG = "rotation-prior-input";

/**
 * 把自动轮转触发的那条用户输入包进 XML，标明它来自轮转前的旧会话。
 * @param content - 用户这次提交的内容块。
 * @returns 带说明与 XML 包裹的新内容数组。
 */
export const wrapPriorInput = (
  content: readonly PromptContentLike[],
): readonly PromptContentLike[] => [
  { type: "text", text: "以下 XML 块是轮转前用户在旧会话发出的输入：" },
  { type: "text", text: `<${PRIOR_INPUT_TAG}>` },
  ...content,
  { type: "text", text: `</${PRIOR_INPUT_TAG}>` },
];

/**
 * 创建轮转引擎。
 * @param options - 宿主能力、领域根、设置与会话解析。
 * @returns 可挂载、可手动触发的引擎；宿主缺少 sessionController 时两个方法都是空操作。
 */
export const createRotation = (options: RotationOptions): RotationEngine => {
  const { services, config, domainRoot, settings } = options;
  const meter = service<TokenMeterLike>(services, "tokenMeter");
  const controller = service<SessionControllerLike>(services, "sessionController");
  const workspaces = service<WorkspaceRegistryLike>(services, "workspaceRegistry");
  const workingDirectory = service<WorkingDirectoryLike>(services, "workingDirectory");
  const presetId = config.presetId ?? "nano-flow";
  const sessionOf = options.sessionOf ?? ((): undefined => undefined);
  const isNanoFlow = (session: RotationSession): boolean =>
    options.isNanoFlow?.(session) ?? selectedPreset(session) === presetId;
  const facade = (): ToolkitNanoFlowFacade | undefined =>
    service<ToolkitNanoFlowFacade>(services, NANO_FLOW_SERVICE);
  /** 同一会话的并发/重复轮转只执行一次；旧会话会被删掉，所以按 id 记账。 */
  const rotating = new Set<string>();
  const rotated = new Set<string>();

  const retire = async (sessionId: string): Promise<void> => {
    const root = facade()?.sessionsRoot();
    if (root === undefined) return;
    if (workspaces !== undefined) {
      try {
        await workspaces.archiveSession(sessionId, { stopActivity: true });
      } catch (error) {
        services.logger.warn(`nano-flow: archive of "${sessionId}" failed: ${describe(error)}`);
      }
      for (const record of workspaces.list()) {
        if (!record.sessionIds.includes(sessionId)) continue;
        await record.detachSession(sessionId).catch((error: unknown) => {
          services.logger.warn(`nano-flow: detach of "${sessionId}" failed: ${describe(error)}`);
        });
      }
    }
    const current = facade();
    if (current !== undefined) await current.recordPendingDelete(sessionId).catch(() => undefined);
    await delay(ROTATE_DELAY_MS);
    const result = await deleteSessionLogs(root, [sessionId]);
    if (result.retained.length > 0) return;
    if (workspaces !== undefined) {
      await workspaces.unarchiveSession(sessionId).catch(() => undefined);
    }
    if (current !== undefined) await current.announceRemoved(sessionId).catch(() => undefined);
  };

  const warnPlacement = (what: string, error: unknown): void => {
    services.logger.warn(`nano-flow: carry ${what} during rotation failed: ${describe(error)}`);
  };

  /** 把旧会话的分组与置顶状态过继给新会话；失败只警告，不阻断轮转。 */
  const inheritPlacement = async (oldId: string, newId: string): Promise<void> => {
    if (workspaces === undefined) return;
    let holders: readonly WorkspaceRecordLike[] = [];
    let pinned = false;
    try {
      holders = workspaces.list().filter((record) => record.sessionIds.includes(oldId));
      pinned = (workspaces.pinnedSessionIds ?? []).includes(oldId);
    } catch (error) {
      warnPlacement("read", error);
    }
    for (const record of holders) {
      try {
        await record.attachSession?.(newId);
        const index = record.sessionIds.indexOf(oldId);
        const successor = index >= 0 ? record.sessionIds[index + 1] : undefined;
        await record.insertSessionBefore?.(newId, successor);
      } catch (error) {
        warnPlacement("workspace membership", error);
      }
    }
    if (!pinned) return;
    try {
      await workspaces.pinSession?.(newId);
    } catch (error) {
      warnPlacement("pin", error);
    }
    try {
      await workspaces.unpinSession?.(oldId);
    } catch (error) {
      warnPlacement("unpin", error);
    }
  };

  /** 新会话建立后跑一次校验（等价于 `nano_flow_check`）；摘要进 seed，失败只 warn。 */
  const runAutoCheck = async (
    sessionId: string,
    previousSessionId: string,
    workspace: string,
  ): Promise<string | undefined> => {
    const check = options.autoCheck;
    if (check === undefined) return undefined;
    try {
      return await check({ sessionId, previousSessionId, workspace });
    } catch (error) {
      services.logger.warn(`nano-flow: auto check after rotation failed: ${describe(error)}`);
      return `轮转后自动执行 \`nano_flow_check\` 失败：${describe(error)}。先手工跑一次确认 Plan 状态。`;
    }
  };

  /** 建新会话并继承槽位/置顶；返回新会话 id 与 seed。 */
  const replacement = async (
    session: RotationSession,
  ): Promise<{ readonly sessionId: string; readonly seed: string }> => {
    const header = session.header ?? {};
    const cwd = header.cwd ?? workingDirectory?.get(session) ?? config.workspace;
    const created = await controller!.create({
      ...(cwd === undefined ? {} : { cwd }),
      agentPreset: presetId,
    });
    await inheritPlacement(session.id, created.sessionId);
    const workspace = cwd ?? process.cwd();
    const checked = await runAutoCheck(created.sessionId, session.id, workspace);
    const seed = await buildSeed(workspace, domainRoot);
    return {
      sessionId: created.sessionId,
      seed: checked === undefined ? seed : `${seed}\n\n${checked}`,
    };
  };

  const original =
    controller !== undefined && typeof controller.prompt === "function"
      ? controller.prompt.bind(controller)
      : undefined;
  const target =
    controller === undefined
      ? undefined
      : (controller as unknown as { prompt: SessionControllerLike["prompt"] });

  const redirect = async (
    session: RotationSession,
    request: PromptRequestLike,
    signal: AbortSignal,
  ): Promise<{ accepted: boolean }> => {
    const fallback = (): Promise<{ accepted: boolean }> => original!(request, signal);
    if (meter === undefined || original === undefined) return fallback();
    const pressure = meter.contextPressure(session);
    const used = pressure.projectedTokens ?? pressure.pressureTokens;
    const window = pressure.contextWindow;
    if (used === undefined || window === undefined || window <= 0) return fallback();
    if (used < window * settings().rotateAt) return fallback();
    if (rotating.has(session.id) || rotated.has(session.id)) return fallback();

    rotating.add(session.id);
    try {
      const created = await replacement(session);
      const result = await original(
        {
          ...request,
          requestId: randomUUID(),
          sessionId: created.sessionId,
          content: [{ type: "text", text: created.seed }, ...wrapPriorInput(request.content)],
        },
        signal,
      );
      rotated.add(session.id);
      options.onRotated?.(session.id, created.sessionId);
      await retire(session.id);
      return result;
    } catch (error) {
      services.logger.warn(`nano-flow: rotation failed: ${describe(error)}`);
      return fallback();
    } finally {
      rotating.delete(session.id);
    }
  };

  return {
    attach(): () => void {
      if (original === undefined || target === undefined) return () => {};
      const previous = target.prompt;
      const wrapped: SessionControllerLike["prompt"] = async (request, signal) => {
        if (request.mode !== "queue") return original(request, signal);
        const session = sessionOf(request.sessionId);
        if (session === undefined) return original(request, signal);
        const header = session.header ?? {};
        if (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0) {
          return original(request, signal);
        }
        if (!isNanoFlow(session)) return original(request, signal);
        return redirect(session, request, signal);
      };
      target.prompt = wrapped;
      return () => {
        if (target.prompt === wrapped) target.prompt = previous;
      };
    },

    async rotate(session: RotationSession, signal?: AbortSignal): Promise<{ accepted: boolean }> {
      if (original === undefined || controller === undefined) return { accepted: false };
      if (!isNanoFlow(session)) return { accepted: false };
      if (rotating.has(session.id) || rotated.has(session.id)) return { accepted: false };
      const owned = signal ?? new AbortController().signal;
      rotating.add(session.id);
      try {
        const created = await replacement(session);
        const result = await original(
          {
            requestId: randomUUID(),
            sessionId: created.sessionId,
            mode: "queue",
            content: [{ type: "text", text: created.seed }],
          },
          owned,
        );
        rotated.add(session.id);
        options.onRotated?.(session.id, created.sessionId);
        // 命令的生命周期事件（command/done）在 handler 返回后才落盘，退役要等它写完。
        setTimeout(() => {
          void retire(session.id).catch((error: unknown) => {
            services.logger.warn(`nano-flow: retire of "${session.id}" failed: ${describe(error)}`);
          });
        }, MANUAL_RETIRE_DELAY_MS);
        return result;
      } catch (error) {
        services.logger.warn(`nano-flow: manual rotation failed: ${describe(error)}`);
        return { accepted: false };
      } finally {
        rotating.delete(session.id);
      }
    },
  };
};

/**
 * 挂载压力触发的轮转包装（兼容入口）。
 * @param options - 宿主能力、领域根、设置与会话解析。
 * @returns 还原 prompt 包装的 disposer。
 */
export const attachRotation = (options: RotationOptions): (() => void) =>
  createRotation(options).attach();
