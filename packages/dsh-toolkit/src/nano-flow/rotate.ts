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

/** 工作区注册表的最小形状（与撤回共用同一套记账）。 */
interface WorkspaceRegistryLike {
  list(): readonly {
    readonly sessionIds: readonly string[];
    detachSession(sessionId: string): Promise<void>;
  }[];
  archiveSession(sessionId: string, options?: { stopActivity?: boolean }): Promise<void>;
  unarchiveSession(sessionId: string): Promise<void>;
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
      ? "恢复当前 Plan：先按 CONTEXT-MAP 定位本会话的业务域，工作区里有多个 active 的 Plan 时先问用户是哪个"
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
export const attachRotation = (options: RotationOptions): (() => void) => {
  const { services, config, domainRoot, settings } = options;
  const meter = service<TokenMeterLike>(services, "tokenMeter");
  const controller = service<SessionControllerLike>(services, "sessionController");
  const workspaces = service<WorkspaceRegistryLike>(services, "workspaceRegistry");
  const workingDirectory = service<WorkingDirectoryLike>(services, "workingDirectory");
  if (meter === undefined || controller === undefined) return () => {};
  if (typeof controller.create !== "function" || typeof controller.prompt !== "function") {
    return () => {};
  }
  const presetId = config.presetId ?? "nano-flow";
  const sessionOf = options.sessionOf ?? ((): undefined => undefined);
  const isNanoFlow =
    options.isNanoFlow ?? ((session: RotationSession) => selectedPreset(session) === presetId);
  const facade = (): ToolkitNanoFlowFacade | undefined =>
    service<ToolkitNanoFlowFacade>(services, NANO_FLOW_SERVICE);

  const retire = async (sessionId: string): Promise<void> => {
    const root = facade()?.sessionsRoot();
    if (root === undefined) return;
    if (workspaces !== undefined) {
      try {
        await workspaces.archiveSession(sessionId, { stopActivity: true });
      } catch (error) {
        options.services.logger.warn(
          `nano-flow: archive of "${sessionId}" failed: ${describe(error)}`,
        );
      }
      for (const record of workspaces.list()) {
        if (!record.sessionIds.includes(sessionId)) continue;
        await record.detachSession(sessionId).catch((error: unknown) => {
          options.services.logger.warn(
            `nano-flow: detach of "${sessionId}" failed: ${describe(error)}`,
          );
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

  const original = controller.prompt.bind(controller);
  const target = controller as unknown as { prompt: SessionControllerLike["prompt"] };
  const previous = target.prompt;
  /** 同一会话的并发/重复 prompt 只轮转一次；旧会话会被删掉，所以按 id 记账。 */
  const rotating = new Set<string>();
  const rotated = new Set<string>();

  const redirect = async (
    session: RotationSession,
    request: PromptRequestLike,
    signal: AbortSignal,
  ): Promise<{ accepted: boolean }> => {
    const pressure = meter.contextPressure(session);
    const used = pressure.projectedTokens ?? pressure.pressureTokens;
    const window = pressure.contextWindow;
    if (used === undefined || window === undefined || window <= 0) {
      return original(request, signal);
    }
    if (used < window * settings().rotateAt) return original(request, signal);
    if (rotating.has(session.id) || rotated.has(session.id)) return original(request, signal);

    rotating.add(session.id);
    try {
      const header = session.header ?? {};
      const cwd = header.cwd ?? workingDirectory?.get(session) ?? config.workspace;
      const created = await controller.create({
        ...(cwd === undefined ? {} : { cwd }),
        agentPreset: presetId,
      });
      const seed = await buildSeed(cwd ?? process.cwd(), domainRoot);
      const result = await original(
        {
          ...request,
          requestId: randomUUID(),
          sessionId: created.sessionId,
          content: [{ type: "text", text: seed }, ...request.content],
        },
        signal,
      );
      rotated.add(session.id);
      await retire(session.id);
      return result;
    } catch (error) {
      options.services.logger.warn(`nano-flow: rotation failed: ${describe(error)}`);
      return original(request, signal);
    } finally {
      rotating.delete(session.id);
    }
  };

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
};
