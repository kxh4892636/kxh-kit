import { randomUUID } from "node:crypto";

import type { NanoFlowSettings } from "../contract.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "../host/nano-flow-facade.js";
import { deleteSessionLogs } from "../host/undo/purge.js";
import { activePlans, listPlans, planRefOf } from "./plan.js";
import type { HostServices } from "./services.js";

/** 会话事件的最小形状。 */
interface RotationEvent {
  readonly type: string;
  readonly data?: { readonly reason?: { readonly kind?: string } };
}

/** 会话的最小形状：id、header 与工作目录。 */
interface RotationSession {
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
    readonly contextWindow?: number;
  };
}

/** 会话控制器的创建与提示注入。 */
interface SessionControllerLike {
  create(request: { cwd?: string; agentPreset?: string }): Promise<{ sessionId: string }>;
  prompt(
    request: {
      requestId: string;
      sessionId: string;
      mode: "queue" | "steer";
      content: readonly { type: "text"; text: string }[];
    },
    signal: AbortSignal,
  ): Promise<{ accepted: boolean }>;
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
 * 在 `turn/end` 后检查上下文压力，达到阈值就轮转：
 * 建新会话并让它重新读取当前 Plan，然后彻底删除旧会话（不是归档）。
 *
 * 任何一步失败都只记 warn，不影响正在进行的轮次；同一会话只轮转一次。
 * @param options - 宿主能力、领域根与设置读取。
 * @returns 注销监听与清理的 disposer。
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
  const rotated = new Set<string>();
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

  const rotate = async (session: RotationSession): Promise<void> => {
    const header = session.header ?? {};
    if (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0) return;
    if (header.agentPreset !== undefined && header.agentPreset !== presetId) return;
    const pressure = meter.contextPressure(session);
    const used = pressure.pressureTokens;
    const window = pressure.contextWindow;
    if (used === undefined || window === undefined || window <= 0) return;
    if (used < window * settings().rotateAt) return;
    const cwd =
      header.cwd ??
      (workingDirectory === undefined ? undefined : workingDirectory.get(session)) ??
      config.workspace;
    const created = await controller.create({
      ...(cwd === undefined ? {} : { cwd }),
      agentPreset: presetId,
    });
    const seed = await buildSeed(cwd ?? process.cwd(), domainRoot);
    await controller.prompt(
      {
        requestId: randomUUID(),
        sessionId: created.sessionId,
        mode: "queue",
        content: [{ type: "text", text: seed }],
      },
      new AbortController().signal,
    );
    await retire(session.id);
  };

  const dispose = services.on("session/event", (...args: unknown[]) => {
    const [rawSession, rawEvent] = args as [RotationSession | undefined, RotationEvent | undefined];
    if (rawSession === undefined || rawEvent === undefined) return;
    if (rawEvent.type !== "turn/end") return;
    if (rawEvent.data?.reason?.kind !== "completed") return;
    if (rotated.has(rawSession.id)) return;
    rotated.add(rawSession.id);
    void rotate(rawSession).catch((error: unknown) => {
      options.services.logger.warn(`nano-flow: rotation failed: ${describe(error)}`);
    });
  });
  return dispose;
};
