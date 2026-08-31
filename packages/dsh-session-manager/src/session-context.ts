/**
 * 会话上下文注入: 创建后以系统消息形式注册到会话作用域 prompt 段(ADR-0004)。
 *
 * 经 agent 上下文注册 `agent.ctx.systemPrompt.section`, 不触发模型调用——
 * 首调用由第一条用户消息驱动。幂等: 同一 session 只注册一次。
 */
import type { ContextInstaller } from "./host.ts";

/** Agent 获取服务(ctx.agents 结构子集)。 */
export interface AgentStoreLike {
  get(sessionId: string): unknown;
}

/** 注册到 agent 上下文所需的 systemPrompt 结构子集。 */
export interface AgentLike {
  readonly ctx?: {
    readonly systemPrompt?: {
      section(section: {
        readonly name: string;
        readonly order: number;
        readonly text: string;
      }): void;
    };
  };
}

/** 会话作用域注入的 prompt 段名与排位。 */
export const CONTEXT_SECTION_NAME = "session-manager:context";
export const CONTEXT_SECTION_ORDER = 2850;

/** Agent 就绪等待上限: 超过则放弃(避免无限等待)。 */
export const AGENT_READY_TIMEOUT_MS = 5000;
export const AGENT_READY_POLL_MS = 50;

const asAgent = (value: unknown): AgentLike | undefined =>
  typeof value === "object" && value !== null ? (value as AgentLike) : undefined;

/**
 * 安装会话上下文(系统消息)。返回完成或抛出可读错误提示。
 * @param services - agents 存储
 * @param sessionId - 目标会话
 * @param text - 上下文文本
 * @param options - 可覆盖的等待参数(测试用)
 */
export const installSessionContext = async (
  services: { readonly agents?: AgentStoreLike },
  sessionId: string,
  text: string,
  options?: { readonly timeoutMs?: number; readonly pollMs?: number },
): Promise<void> => {
  const agent = await waitForAgent(services.agents, sessionId, {
    timeoutMs: options?.timeoutMs ?? AGENT_READY_TIMEOUT_MS,
    pollMs: options?.pollMs ?? AGENT_READY_POLL_MS,
  });
  const prompt = agent?.ctx?.systemPrompt;
  if (prompt === undefined) {
    throw new Error(
      `会话上下文注入失败: 会话 "${sessionId}" 的 agent 上下文不可用(无 systemPrompt 服务)`,
    );
  }
  prompt.section({ name: CONTEXT_SECTION_NAME, order: CONTEXT_SECTION_ORDER, text });
};

/** 轮询等待 Agent 就绪; 超时返回 undefined。 */
const waitForAgent = async (
  store: AgentStoreLike | undefined,
  sessionId: string,
  limits: { readonly timeoutMs: number; readonly pollMs: number },
): Promise<AgentLike | undefined> => {
  const deadline = Date.now() + limits.timeoutMs;
  for (;;) {
    const candidate = store?.get(sessionId);
    const agent = asAgent(candidate);
    if (agent?.ctx?.systemPrompt !== undefined) return agent;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, limits.pollMs));
  }
};

/** 供 main.ts 接线使用的工厂: 以 ctx.agents 构造 ContextInstaller(同 session 幂等)。 */
export const makeContextInstaller = (services: {
  readonly agents?: AgentStoreLike;
}): ContextInstaller => {
  const installed = new Set<string>();
  return async (sessionId: string, context: string): Promise<void> => {
    if (installed.has(sessionId)) return;
    installed.add(sessionId);
    await installSessionContext(services, sessionId, context);
  };
};
