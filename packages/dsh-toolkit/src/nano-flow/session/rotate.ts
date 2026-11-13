import { randomUUID } from "node:crypto";

import type { NanoFlowSettings } from "../../contract.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "../../host/nano-flow-facade.js";
import { deleteSessionLogs } from "../../host/undo/purge.js";
import {
  ASSISTANT_LIMIT,
  groupByTurn,
  textOf,
  type SessionEventLike,
} from "../planning/plan-log.js";
import { asRecord } from "../../shared/record.js";
import { activePlans, listPlans, planRefOf } from "../planning/plan.js";
import type { HostServices } from "./services.js";
import { describeError } from "../../shared/errors.js";

/** 会话的最小形状：id、header 与日志快照。 */
export interface RotationSession {
  readonly id: string;
  readonly header?: {
    readonly cwd?: string;
    readonly origin?: string;
    readonly delegationDepth?: number;
    readonly agentPreset?: string;
  };
  /** 会话日志快照；读最后一条预设选择（live header 的 `agentPreset` 不可靠）与上一轮输出。 */
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
interface PromptContentLike {
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
interface RotationOptions {
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
   *
   * 结论写进 seed（在输出块之前）；抛错只记 warn，不阻断轮转。
   */
  readonly autoCheck?: (params: {
    readonly sessionId: string;
    readonly previousSessionId: string;
    readonly workspace: string;
  }) => Promise<{ readonly text: string } | undefined>;
  /**
   * 把旧会话的 Plan 绑定过继给新会话，返回 Plan 引用（`<domain>/<lifecycle>/<name>`）。
   *
   * 过继成功后新会话的看板与轨迹立刻续上同一个 Plan；旧会话没有绑定或目录失效时返回
   * undefined，seed 保留「先 bind」的要求。抛错只记 warn，不阻断轮转。
   */
  readonly adoptBinding?: (params: {
    readonly sessionId: string;
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

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const service = <T>(services: HostServices, name: string): T | undefined => {
  try {
    const value = services.get(name);
    return typeof value === "object" && value !== null ? (value as T) : undefined;
  } catch {
    // 读数失败（宿主不暴露该服务）时按缺失处理，轮转直接不介入。
    return undefined;
  }
};

/** 上一轮模型输出在 seed 里的标签。 */
export const LAST_OUTPUT_TAG = "rotation-last-output";

/** 触发轮转的那条用户原文的标签。 */
export const PRIOR_INPUT_TAG = "rotation-prior-input";

/**
 * 把触发自动轮转的用户原文包进 XML：说明行 + 开标签 + 原文内容块 + 闭标签。
 *
 * 包装放在 seed 之后，让「上一轮输出」与「用户原文」一起落在消息最末。
 * @param content - 用户这次提交的内容块（文本、图片等原样保留）。
 * @returns 追加了说明与包裹标签的内容块数组。
 */
const wrapPriorInput = (content: readonly PromptContentLike[]): readonly PromptContentLike[] => [
  { type: "text", text: "以下 XML 块是轮转前用户在旧会话发出的输入：" },
  { type: "text", text: `<${PRIOR_INPUT_TAG}>` },
  ...content,
  { type: "text", text: `</${PRIOR_INPUT_TAG}>` },
];

/** 单轮输出进入 seed 的字节上限：复用 log.jsonl 的 assistant 预算（这里保尾，log 保头）。 */
const LAST_OUTPUT_LIMIT = ASSISTANT_LIMIT;

/**
 * 保尾截断：超过上限时丢掉开头，保住结尾的结论。
 *
 * 按字节切会把一个 UTF-8 字符劈开，`toString("utf8")` 会在切口处留下 U+FFFD；
 * 这里剥掉开头全部替换字符，使标注的字节数与实际保留内容一致。
 * @param text - 原文。
 * @param limit - 字节上限。
 * @returns 截断后的文本（头部标注被截掉的字节数）。
 */
export const truncateTail = (text: string, limit: number): string => {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= limit) return text;
  const tail = Buffer.from(text, "utf8")
    .subarray(bytes - limit)
    .toString("utf8")
    .replace(/^\uFFFD+/u, "");
  const dropped = bytes - Buffer.byteLength(tail, "utf8");
  return `…（前 ${dropped} 字节已截断）\n${tail}`;
};

/**
 * 最后一个已结束轮的「最后一条含文本的 assistant 消息」。
 *
 * 轮次归属复用 plan-log 的 `groupByTurn`；只读会话快照，不写任何事件。
 * @param session - 被轮转的会话。
 * @returns 截断到上限的文本；没有已结束轮或没有文本时 undefined。
 */
export const lastAssistantText = (session: RotationSession): string | undefined => {
  let events: readonly { readonly type?: string; readonly data?: unknown }[] = [];
  try {
    events = session.snapshotEvents?.() ?? [];
  } catch {
    events = [];
  }
  if (events.length === 0) return undefined;
  const turns = groupByTurn(events as readonly SessionEventLike[]);
  let target: number | undefined;
  for (const [turn, list] of turns) {
    if (!list.some((event) => event.type === "turn/end")) continue;
    if (target === undefined || turn > target) target = turn;
  }
  if (target === undefined) return undefined;
  let text: string | undefined;
  for (const event of turns.get(target) ?? []) {
    if (event.type !== "assistant/message") continue;
    const message = asRecord(asRecord(event.data)["message"]);
    const joined = textOf(message["content"]);
    if (joined.trim() !== "") text = joined;
  }
  if (text === undefined) return undefined;
  return truncateTail(text.trim(), LAST_OUTPUT_LIMIT);
};

/** seed 的可选片段。 */
interface SeedParts {
  /** 上一轮 assistant 最终文本；没有已结束轮时省略。 */
  readonly lastOutput?: string;
  /** 轮转后自动校验结论；没有 autoCheck 时省略。 */
  readonly checked?: string;
  /** 轮转前会话绑定的 Plan（`<domain>/<lifecycle>/<name>`）。 */
  readonly planReference?: string;
  /** 绑定已过继给新会话；seed 据此不再要求调用 `nano_flow_bind`。 */
  readonly bindingAdopted?: boolean;
}

const buildSeed = async (
  workspace: string,
  domainRoot: string,
  seed: SeedParts,
): Promise<string> => {
  let planReference = seed.planReference;
  if (planReference === undefined) {
    try {
      const plans = activePlans(await listPlans(workspace, domainRoot));
      const only = plans[0];
      if (plans.length === 1 && only !== undefined) planReference = planRefOf(only);
    } catch {
      // 读不到 Plan 时保留“先问用户”的提示。
    }
  }
  const head =
    planReference === undefined
      ? "恢复当前 Plan：先按 `.agents/domains/CONTEXT-MAP.md` 定位本会话的业务域，工作区里有多个 active 的 Plan 时先问用户是哪个"
      : `恢复当前 Plan：${planReference}`;
  const parts = [
    "（上一会话因上下文达到阈值已轮转；Plan 在磁盘上，状态不丢。）",
    `${head}。`,
    seed.bindingAdopted === true
      ? "Plan 绑定已从上一会话过继（看板与轨迹续在同一 Plan 上），无需再调 `nano_flow_bind`；读 spec.md 与 notes_index.md，只读报告进度与可推进队列，等用户放行后再执行。"
      : "先确认 Plan 并调用 `nano_flow_bind` 绑定（未绑定时看板与 log 不会出现），再读 spec.md 与 notes_index.md，只读报告进度与可推进队列，等用户放行后再执行。",
  ];
  if (seed.checked !== undefined) parts.push(`\n\n${seed.checked}`);
  if (seed.lastOutput !== undefined) {
    parts.push(
      `\n\n以下 XML 块是轮转前会话最后一轮的模型输出：\n<${LAST_OUTPUT_TAG}>\n${seed.lastOutput}\n</${LAST_OUTPUT_TAG}>`,
    );
  }
  return parts.join("");
};

/** 轮转引擎：只挂压力触发的 prompt 包装（轮转只能自动触发）。 */
interface RotationEngine {
  /** 挂上压力触发的 prompt 包装；返回 disposer。 */
  attach(): () => void;
}

/**
 * 创建轮转引擎：只在 `queue` 消息进入时检查上下文压力，达到阈值就把这次 prompt 重定向到新会话。
 *
 * 新会话先拿到 seed（「已轮转」+ 当前 Plan + 只读恢复要求 + 校验结论 + 上一轮输出块），
 * 再带上包在 `<rotation-prior-input>` 里的用户原文；旧会话在新 prompt 被接受后归档并删除。
 * 新 prompt 失败时回落到旧会话，消息不丢。挂在宿主层（根插件）而不是预设行：预设行看不到
 * `ctx.agent`（cordis 的 inject 守卫），由会话日志里最后一条 `agent-preset/selected` 判定预设。
 * @param options - 宿主能力、领域根、设置与会话解析。
 * @returns 只挂压力包装的引擎；宿主缺少 sessionController 时 attach 为空操作。
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
        services.logger.warn(
          `nano-flow: archive of "${sessionId}" failed: ${describeError(error)}`,
        );
      }
      for (const record of workspaces.list()) {
        if (!record.sessionIds.includes(sessionId)) continue;
        await record.detachSession(sessionId).catch((error: unknown) => {
          services.logger.warn(
            `nano-flow: detach of "${sessionId}" failed: ${describeError(error)}`,
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

  const warnPlacement = (what: string, error: unknown): void => {
    services.logger.warn(
      `nano-flow: carry ${what} during rotation failed: ${describeError(error)}`,
    );
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

  /** 新会话建立后跑一次校验（等价于 `nano_flow_check`）；结论进 seed，失败只 warn。 */
  const runAutoCheck = async (
    sessionId: string,
    previousSessionId: string,
    workspace: string,
  ): Promise<{ readonly text: string } | undefined> => {
    const check = options.autoCheck;
    if (check === undefined) return undefined;
    try {
      return await check({ sessionId, previousSessionId, workspace });
    } catch (error) {
      services.logger.warn(`nano-flow: auto check after rotation failed: ${describeError(error)}`);
      return {
        text: `轮转后自动执行 \`nano_flow_check\` 失败：${describeError(error)}。先手工跑一次确认 Plan 状态。`,
      };
    }
  };

  /** 把旧会话的绑定过继给新会话；失败只 warn，轮转照常。 */
  const adopt = async (
    previousSessionId: string,
    sessionId: string,
    workspace: string,
  ): Promise<string | undefined> => {
    const inherit = options.adoptBinding;
    if (inherit === undefined) return undefined;
    try {
      return await inherit({ sessionId, previousSessionId, workspace });
    } catch (error) {
      services.logger.warn(
        `nano-flow: adopt binding during rotation failed: ${describeError(error)}`,
      );
      return undefined;
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
    const adopted = await adopt(session.id, created.sessionId, workspace);
    const checked = await runAutoCheck(created.sessionId, session.id, workspace);
    const lastOutput = lastAssistantText(session);
    const seed = await buildSeed(workspace, domainRoot, {
      ...(lastOutput === undefined ? {} : { lastOutput }),
      ...(checked === undefined ? {} : { checked: checked.text }),
      ...(adopted === undefined ? {} : { planReference: adopted, bindingAdopted: true }),
    });
    return { sessionId: created.sessionId, seed };
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
      services.logger.warn(`nano-flow: rotation failed: ${describeError(error)}`);
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
  };
};

/**
 * 挂载压力触发的轮转包装（兼容入口）。
 * @param options - 宿主能力、领域根、设置与会话解析。
 * @returns 还原 prompt 包装的 disposer。
 */
export const attachRotation = (options: RotationOptions): (() => void) =>
  createRotation(options).attach();
