import { randomUUID } from "node:crypto";

import type { NanoFlowSettings } from "../contract.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "../host/nano-flow-facade.js";
import { deleteSessionLogs } from "../host/undo/purge.js";
import { activePlans, listPlans, planRefOf } from "./plan.js";
import type { HostServices } from "./services.js";

/** 会话的最小形状：id、header 与工作目录。 */
export interface RotationSession {
  readonly id: string;
  readonly header?: {
    readonly cwd?: string;
    readonly origin?: string;
    readonly delegationDepth?: number;
    readonly agentPreset?: string;
  };
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
  /** 本插件实例所属的会话；由预设行在 agent 作用域内注入。 */
  readonly session?: RotationSession | undefined;
}

const ROTATE_DELAY_MS = 150;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const service = <T>(services: HostServices, name: string): T | undefined => {
  const value = services.get(name);
  return typeof value === "object" && value !== null ? (value as T) : undefined;
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
      ? "继续执行当前 Plan：先按 CONTEXT-MAP 定位本会话的业务域，工作区里有多个 active 的 Plan 时先问用户是哪个"
      : `继续执行当前 Plan：${planReference}`;
  return [
    "（上一会话因上下文达到阈值已轮转；Plan 在磁盘上，状态不丢。）",
    `${head}。`,
    "先调 nano_flow_read 的 resume 拿恢复包，再读 spec.md 与 story.md，从可推进队列继续。",
  ].join("");
};

/**
 * 在用户发送消息时检查上下文压力：达到阈值就把这次 prompt 重定向到新会话。
 *
 * 新会话先拿到「上一会话已轮转 + 继续当前 Plan」的种子，再带上用户这次的消息；
 * 旧会话在新 prompt 被接受后彻底删除。新 prompt 失败时回落到旧会话，消息不丢。
 * 只在 `mode === "queue"` 的新轮次检查；steer 与其它会话直接放行。
 * @param options - 宿主能力、领域根、设置与本实例所属会话。
 * @returns 还原 prompt 包装的 disposer。
 */
export const attachRotation = (options: RotationOptions): (() => void) => {
  const { services, config, domainRoot, settings, session } = options;
  if (session === undefined) return () => {};
  const meter = service<TokenMeterLike>(services, "tokenMeter");
  const controller = service<SessionControllerLike>(services, "sessionController");
  const workspaces = service<WorkspaceRegistryLike>(services, "workspaceRegistry");
  const workingDirectory = service<WorkingDirectoryLike>(services, "workingDirectory");
  if (meter === undefined || controller === undefined) return () => {};
  if (typeof controller.create !== "function" || typeof controller.prompt !== "function") {
    return () => {};
  }
  const header = session.header ?? {};
  if (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0) return () => {};
  const presetId = config.presetId ?? "nano-flow";
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
  let rotating = false;
  let rotated = false;

  const redirect = async (
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
    if (rotating || rotated) return original(request, signal);

    rotating = true;
    try {
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
      rotated = true;
      await retire(session.id);
      return result;
    } catch (error) {
      options.services.logger.warn(`nano-flow: rotation failed: ${describe(error)}`);
      return original(request, signal);
    } finally {
      rotating = false;
    }
  };

  const wrapped: SessionControllerLike["prompt"] = async (request, signal) => {
    if (request.sessionId !== session.id || request.mode !== "queue") {
      return original(request, signal);
    }
    return redirect(request, signal);
  };
  target.prompt = wrapped;
  return () => {
    if (target.prompt === wrapped) target.prompt = previous;
  };
};
