/**
 * 插件入口测试: apply 注册 9 个工具与指引章节。
 */
import { describe, expect, it, vi } from "vitest";
import { apply } from "./main.ts";
import { makeFakeServices } from "./test-support.ts";

const makeCtx = (): {
  readonly ctx: {
    readonly tools: { readonly register: ReturnType<typeof vi.fn> };
    readonly systemPrompt: { readonly section: ReturnType<typeof vi.fn> };
  };
  readonly registerCalls: ReturnType<typeof vi.fn>;
} => {
  const register = vi.fn();
  const section = vi.fn();
  const fake = makeFakeServices();
  const ctx = {
    ...fake.services,
    tools: { register },
    systemPrompt: { section },
  };
  return {
    ctx: ctx as unknown as {
      readonly tools: { readonly register: typeof register };
      readonly systemPrompt: { readonly section: typeof section };
    },
    registerCalls: register,
  };
};

describe("main.apply", () => {
  it("注册 9 个工具并写入指引章节", () => {
    const { ctx, registerCalls } = makeCtx();
    apply(ctx as never);
    expect(registerCalls).toHaveBeenCalledTimes(9);
    const names = registerCalls.mock.calls.map(
      (call: unknown[]) => (call[0] as { readonly name: string }).name,
    );
    expect(names).toContain("session_list");
    expect(names).toContain("session_wait");
    expect(ctx.systemPrompt.section).toHaveBeenCalledTimes(1);
    const sectionCall = ctx.systemPrompt.section.mock.calls[0]?.[0] as
      | { readonly name: string; readonly order: number }
      | undefined;
    expect(sectionCall?.name).toBe("tool:session-manager");
    expect(sectionCall?.order).toBe(2750);
  });
});
