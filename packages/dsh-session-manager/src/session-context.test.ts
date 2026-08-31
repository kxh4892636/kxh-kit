/**
 * 会话上下文注入测试: 注册参数、就绪等待、幂等与失败路径。
 */
import { describe, expect, it } from "vitest";
import {
  AGENT_READY_POLL_MS,
  AGENT_READY_TIMEOUT_MS,
  CONTEXT_SECTION_NAME,
  CONTEXT_SECTION_ORDER,
  installSessionContext,
  makeContextInstaller,
} from "./session-context.ts";
import type { AgentLike } from "./session-context.ts";

/** 可编程的 agent 存储: 返回或不返回就绪 agent。 */
const makeAgentStore = (
  ready: boolean,
): {
  readonly store: { get(sessionId: string): unknown };
  readonly available: { value: boolean };
} => {
  const available = { value: ready };
  return {
    available,
    store: {
      get: () =>
        available.value ? { ctx: { systemPrompt: { section: () => undefined } } } : undefined,
    },
  };
};

const makeAgent = (): { readonly agent: AgentLike; readonly sections: unknown[] } => {
  const sections: unknown[] = [];
  return {
    sections,
    agent: { ctx: { systemPrompt: { section: (section) => sections.push(section) } } },
  };
};

describe("installSessionContext", () => {
  it("agent 就绪时注册系统消息 prompt 段", async () => {
    const { agent, sections } = makeAgent();
    const store = { get: () => agent };
    await installSessionContext({ agents: store }, "session-a", "自定义上下文");
    expect(sections).toEqual([
      { name: CONTEXT_SECTION_NAME, order: CONTEXT_SECTION_ORDER, text: "自定义上下文" },
    ]);
  });

  it("agent 未就绪时轮询等待后注册", async () => {
    const { agent, sections } = makeAgent();
    const available = { value: false };
    const store = { get: () => (available.value ? agent : undefined) };
    const pending = installSessionContext({ agents: store }, "session-a", "later");
    available.value = true;
    await pending;
    expect(sections).toHaveLength(1);
  });

  it("超时无 agent 时抛出可读错误", async () => {
    const { store: neverReady } = makeAgentStore(false);
    await expect(
      installSessionContext({ agents: neverReady }, "session-a", "x", {
        timeoutMs: 100,
        pollMs: 10,
      }),
    ).rejects.toThrow("agent 上下文不可用");
  });

  it("无 agents 存储时同样失败", async () => {
    await expect(
      installSessionContext({}, "session-a", "x", { timeoutMs: 100, pollMs: 10 }),
    ).rejects.toThrow("agent 上下文不可用");
  });
});

describe("makeContextInstaller", () => {
  it("幂等: 同 session 只注册一次; context 传递正确", async () => {
    const { agent, sections } = makeAgent();
    const installer = makeContextInstaller({ agents: { get: () => agent } });
    await installer("session-a", "第一次");
    await installer("session-a", "第二次");
    expect(sections).toHaveLength(1);
    expect((sections[0] as { readonly text: string }).text).toBe("第一次");
  });

  it("不同 session 各自注册", async () => {
    const { agent, sections } = makeAgent();
    const installer = makeContextInstaller({ agents: { get: () => agent } });
    await installer("session-a", "a");
    await installer("session-b", "b");
    expect(sections).toHaveLength(2);
  });
});

describe("常量", () => {
  it("默认等待时长与轮询间隔为正", () => {
    expect(AGENT_READY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AGENT_READY_POLL_MS).toBeGreaterThan(0);
    expect(AGENT_READY_TIMEOUT_MS).toBeGreaterThan(AGENT_READY_POLL_MS);
  });
});
