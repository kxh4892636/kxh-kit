/**
 * 插件入口测试: apply 注册 9 个工具与指引章节, 并在严格 ctx 下只经 inject/ctx.get 取服务。
 */
import { describe, expect, it, vi } from "vitest";
import { apply, capabilityInject, inject } from "./main.ts";
import type { HostServices, SubagentMode } from "./host.ts";
import {
  headerOf,
  makeFakeServices,
  makeStrictCtx,
  messageRecordOf,
  snapshotOf,
} from "./test-support.ts";

/** 子会话样本: 一条 assistant 消息 + 可解析的 subagent 模式。 */
const childFixture = (subagentMode: SubagentMode): HostServices =>
  makeFakeServices({
    subagentMode,
    items: [{ sessionId: "child-1", origin: "subagent", parentSessionId: "parent-1" }],
    frames: [
      snapshotOf([messageRecordOf("assistant/message", 3, "hi")], 10, false, headerOf("child-1")),
    ],
  }).services;

/**
 * 严格假 ctx: `injected` 由导出的 `inject` 派生, 因此「漏声明却仍被直读」的服务
 * 会像真实 cordis 一样抛错, 而不是静默通过。
 */
const makeCtx = (options?: {
  readonly optionalAvailable?: boolean;
  readonly services?: HostServices;
  /** 组合是否提供 sessionController: false 模拟无 web-app 层的组合(如 dsh-tui)。 */
  readonly capabilityAvailable?: boolean;
}): {
  readonly ctx: Record<string, unknown>;
  readonly register: ReturnType<typeof vi.fn>;
  readonly section: ReturnType<typeof vi.fn>;
} => {
  const services = options?.services ?? childFixture("continuable");
  const register = vi.fn();
  const section = vi.fn();
  const provided: Record<string, unknown> = {
    ...services,
    tools: { register },
    systemPrompt: { section },
    agents: { get: () => undefined },
  };
  if (options?.capabilityAvailable === false) delete provided["sessionController"];
  const ctx = makeStrictCtx({
    provided,
    injected: inject,
    ...(options?.optionalAvailable === undefined
      ? {}
      : { optionalAvailable: options.optionalAvailable }),
  });
  return { ctx, register, section };
};

/** 调用已注册的 `session_read` 读取子会话(子会话寻址需要投影与冷查询两条可选服务)。 */
const readChild = async (register: ReturnType<typeof vi.fn>): Promise<unknown> => {
  const tool = register.mock.calls
    .map((call: unknown[]) => call[0] as { readonly name: string })
    .find((candidate) => candidate.name === "session_read");
  if (tool === undefined) throw new Error("tool session_read not found");
  const execute = (
    tool as unknown as {
      execute: (args: unknown, exec: unknown) => Promise<unknown>;
    }
  ).execute.bind(tool);
  return execute(
    { sessionId: "child-1", parentSessionId: "parent-1" },
    {
      signal: new AbortController().signal,
    },
  );
};

/** 取工具结果里第一条消息的文本。 */
const textOf = (result: unknown): string | undefined =>
  (result as { readonly messages: readonly { readonly text: string }[] }).messages[0]?.text;

describe("main.apply", () => {
  it("注册 9 个工具并写入指引章节", () => {
    const { ctx, register, section } = makeCtx();
    apply(ctx as never);
    expect(register).toHaveBeenCalledTimes(9);
    const names = register.mock.calls.map((call: unknown[]) => (call[0] as { name: string }).name);
    expect(names).toContain("session_list");
    expect(names).toContain("session_wait");
    expect(section).toHaveBeenCalledTimes(1);
    const sectionCall = section.mock.calls[0]?.[0] as
      | { readonly name: string; readonly order: number }
      | undefined;
    expect(sectionCall?.name).toBe("tool:session-manager");
    expect(sectionCall?.order).toBe(2750);
  });

  it("入口 inject 只声明组合无关的服务(能力服务放进嵌套作用域)", () => {
    // 能力服务写进入口 inject 会让缺该服务的组合(dsh-tui)条目永远 pending,
    // app-boot 的 assertEntriesActivated 直接抛错(退出码 7), 整棵树起不来。
    expect(inject).toContain("tools");
    expect(inject).toContain("systemPrompt");
    expect(inject).not.toContain("sessionController");
    expect(inject).not.toContain("workspaceRegistry");
    expect(inject).not.toContain("agents");
    expect(capabilityInject).toContain("sessionController");
    expect(capabilityInject).toContain("workspaceRegistry");
    expect(capabilityInject).toContain("agents");
  });

  it("组合缺少 sessionController(dsh-tui): apply 不抛错, 也不登记工具与指引", () => {
    const { ctx, register, section } = makeCtx({ capabilityAvailable: false });
    expect(() => apply(ctx as never)).not.toThrow();
    expect(register).not.toHaveBeenCalled();
    expect(section).not.toHaveBeenCalled();
  });

  it("strict inject: 子会话读取经 ctx.get 装配的可选服务完成", async () => {
    // 直读未 inject 的服务会抛错; 可选服务未装配则子会话寻址失败。
    const { ctx, register } = makeCtx();
    apply(ctx as never);
    expect(textOf(await readChild(register))).toBe("hi");
  });

  it("strict inject: live 投影缺席时经 ctx.get 的 sessionQuery 解析子会话", async () => {
    const services = { ...childFixture("one-shot") };
    delete services.sessionProjections;
    const { ctx, register } = makeCtx({ services });
    apply(ctx as never);
    expect(textOf(await readChild(register))).toBe("hi");
  });

  it("strict inject: 冷查询缺席时经 ctx.get 的 live 投影解析子会话", async () => {
    const services = { ...childFixture("continuable") };
    delete services.sessionQuery;
    const { ctx, register } = makeCtx({ services });
    apply(ctx as never);
    expect(textOf(await readChild(register))).toBe("hi");
  });

  it("strict inject: 可选服务缺席时仍注册 9 个工具并给出可读错误", async () => {
    const { ctx, register } = makeCtx({ optionalAvailable: false });
    apply(ctx as never);
    expect(register).toHaveBeenCalledTimes(9);
    await expect(readChild(register)).rejects.toThrow(/SESSION_MANAGER_SUBAGENT_UNAVAILABLE/);
  });
});
