import type { SkillProviderControlLike } from "./contract.js";
import { describe, expect, it, vi } from "vitest";
import { apply, Config, inject, name, NESTED_SKILL_RANK, PROVIDER_NAME } from "./main.js";
import type { NestedSkillProvider } from "./provider.js";

describe("plugin entry", () => {
  it("registers the provider and wires effects and fs/observed", () => {
    const handlers = new Map<
      string,
      (target: unknown, observation: unknown, actor: unknown) => void
    >();
    let registered: NestedSkillProvider | undefined;
    const ctx = {
      logger: { warn: vi.fn() },
      get: () => undefined,
      skills: {
        registerProvider: (create: (control: SkillProviderControlLike) => NestedSkillProvider) => {
          registered = create({ signal: new AbortController().signal, invalidate: vi.fn() });
          return () => {};
        },
      },
      effect: vi.fn(),
      on: (
        event: string,
        handler: (target: unknown, observation: unknown, actor: unknown) => void,
      ) => {
        handlers.set(event, handler);
      },
    };
    apply(ctx as never);
    expect(ctx.effect).toHaveBeenCalledOnce();
    expect(registered?.name).toBe(PROVIDER_NAME);
    const handler = handlers.get("fs/observed");
    expect(handler).toBeDefined();
    handler?.({ displayPath: "C:/project/.agents/skills/loop-x" }, undefined, { name: "edit" });
    handler?.({ displayPath: "C:/project/.agents/skills/loop-x" }, undefined, { name: "write" });
    handler?.({ displayPath: "C:/project/.agents/skills/loop-x" }, undefined, { name: "read" });
    handler?.({ displayPath: "C:/project/.agents/skills/loop-x" }, undefined, undefined);
    const effectCall = (ctx.effect as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0];
    const iterator = (effectCall as () => Generator<() => Promise<void>>)();
    const disposer = iterator.next().value;
    expect(disposer).toBeTypeOf("function");
  });

  it("declares identity, injections, and constants", () => {
    expect(name).toBe("nested-skill");
    expect(inject).toEqual(["skills"]);
    expect(NESTED_SKILL_RANK).toBe(250);
    expect(PROVIDER_NAME).toBe("nested-agents");
    expect(Config).toBeDefined();
  });
});
