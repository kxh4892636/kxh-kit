import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import { DEFAULT_NANO_FLOW_SETTINGS } from "./config.ts";
import { registerNanoFlow } from "./register.ts";
import { BINDING_ENTRY, MODE_ENTRY, RESET_ENTRY } from "./mode.ts";

const created: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-nano-register-"));
  created.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Entry {
  type: string;
  customType?: string;
  data?: unknown;
  timestamp?: string;
  message?: unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly controller: { sync(ctx: ExtensionContext): void };
  readonly entries: Entry[];
  readonly tools: Map<string, { execute: (...args: never[]) => unknown }>;
  readonly commands: Map<string, { handler: (...args: never[]) => unknown }>;
  readonly active: () => string[];
  readonly saved: boolean[];
  readonly notifications: string[];
  fire(event: string, ctx: ExtensionContext, payload?: unknown): unknown[];
  ctx(overrides?: Record<string, unknown>): ExtensionContext;
}

const settings = (options: { switchOn?: boolean; always?: boolean } = {}): ToolkitSettings => ({
  ...DEFAULT_SETTINGS,
  tools: { ...DEFAULT_TOOLS, nanoFlow: options.switchOn !== false },
  nanoFlow: {
    ...DEFAULT_NANO_FLOW_SETTINGS,
    always: options.always !== false,
    rotateAt: 0.5,
  },
});

const setup = (options: { switchOn?: boolean; always?: boolean } = {}): Harness => {
  const entries: Entry[] = [];
  const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>();
  const tools = new Map<string, { execute: (...args: never[]) => unknown }>();
  const commands = new Map<string, { handler: (...args: never[]) => unknown }>();
  let active = ["read", "bash"];
  const saved: boolean[] = [];
  const notifications: string[] = [];
  const pi = {
    registerTool: (definition: { name: string }) => tools.set(definition.name, definition as never),
    registerCommand: (name: string, command: { handler: (...args: never[]) => unknown }) =>
      commands.set(name, command),
    on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    appendEntry: (customType: string, data?: unknown) =>
      entries.push({ type: "custom", customType, data }),
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => {
      active = [...names];
    },
  } as unknown as ExtensionAPI;

  const controller = registerNanoFlow(pi, {
    settings: () => settings(options),
    saveAlways: (value) => saved.push(value),
  });

  const ctx = (overrides: Record<string, unknown> = {}): ExtensionContext => {
    const usage = (overrides["usage"] as { tokens: number; contextWindow: number } | undefined) ?? {
      tokens: 10,
      contextWindow: 100,
    };
    return {
      cwd: overrides["cwd"] ?? tempDir(),
      mode: "tui",
      ui: {
        notify: (message: string) => notifications.push(message),
        setWidget: () => undefined,
        select: async () => "关",
        confirm: async () => false,
      },
      sessionManager: { getBranch: () => entries, getSessionId: () => "session" },
      getContextUsage: () => ({ ...usage, percent: (usage.tokens / usage.contextWindow) * 100 }),
      ...overrides,
    } as unknown as ExtensionContext;
  };

  return {
    pi,
    controller,
    entries,
    tools,
    commands,
    active: () => [...active],
    saved,
    notifications,
    fire: (event, context, payload) => {
      const results: unknown[] = [];
      for (const handler of handlers.get(event) ?? [])
        results.push(handler(payload ?? {}, context));
      return results;
    },
    ctx,
  };
};

describe("registerNanoFlow", () => {
  it("activates tools and skills only when the switch and session mode agree", () => {
    const harness = setup({ switchOn: true, always: true });
    const ctx = harness.ctx();
    harness.controller.sync(ctx);
    expect(harness.active()).toEqual(
      expect.arrayContaining(["nano_flow_create", "nano_flow_bind", "nano_flow_check"]),
    );
    const discovered = harness.fire("resources_discover", ctx) as Array<{
      skillPaths?: string[];
    }>;
    expect(discovered[0]?.skillPaths?.[0]).toMatch(/nano-flow\/skills$/u);

    const off = setup({ switchOn: false, always: true });
    const offCtx = off.ctx();
    off.controller.sync(offCtx);
    expect(off.active()).not.toContain("nano_flow_create");
    expect(off.fire("resources_discover", offCtx)).toEqual([undefined]);
  });

  it("injects the prompt and the per-input reminder", () => {
    const harness = setup();
    const ctx = harness.ctx();
    const options = { sections: {} as Record<string, string> };
    const [result] = harness.fire("before_agent_start", ctx, {
      messageType: "user",
      systemPromptOptions: options,
    }) as Array<{ message?: { customType?: string; content?: string } }>;
    expect(options.sections["nano-flow"]).toContain("# Nano Flow");
    expect(result?.message?.customType).toBe("nano-flow/input");
    expect(result?.message?.content).toContain("ask_questions");
  });

  it("resets the context at the threshold and re-injects a seed", () => {
    const harness = setup();
    harness.entries.push({
      type: "message",
      timestamp: "2026-11-09T00:00:00.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "上一轮结论" }] },
    });
    const ctx = harness.ctx({ usage: { tokens: 80, contextWindow: 100 } });
    harness.fire("before_agent_start", ctx, {
      messageType: "user",
      systemPromptOptions: { sections: {} },
    });
    const reset = harness.entries.find((entry) => entry.customType === RESET_ENTRY);
    expect(reset?.data).toMatchObject({ seed: expect.stringContaining("<rotation-last-output>") });

    const at = (reset?.data as { at: number } | undefined)?.at ?? 0;
    const [context] = harness.fire("context", ctx, {
      messages: [
        { role: "user", content: [{ type: "text", text: "旧消息" }], timestamp: 0 },
        { role: "user", content: [{ type: "text", text: "本轮输入" }], timestamp: at + 1 },
      ],
    }) as Array<{ messages: Array<{ content: Array<{ text: string }>; timestamp: number }> }>;
    expect(context?.messages).toHaveLength(2);
    expect(context?.messages[0]?.content[0]?.text).toContain("nano_flow_bind");
    expect(context?.messages[1]?.content[0]?.text).toBe("本轮输入");
  });

  it("binds the plan through a session entry", async () => {
    const harness = setup();
    const ctx = harness.ctx();
    harness.controller.sync(ctx);
    const create = harness.tools.get("nano_flow_create");
    await create?.execute(
      "id" as never,
      { kind: "plan", domain: "demo", name: "2026-11-09-示例" } as never,
      undefined as never,
      undefined as never,
      ctx as never,
    );
    const bind = harness.tools.get("nano_flow_bind");
    await bind?.execute(
      "id" as never,
      { plan: "2026-11-09-示例" } as never,
      undefined as never,
      undefined as never,
      ctx as never,
    );
    const binding = harness.entries.find((entry) => entry.customType === BINDING_ENTRY);
    expect(binding?.data).toMatchObject({
      planPath: ".agents/domains/demo/plans/active/2026-11-09-示例",
    });
  });

  it("binds the only active plan from /nano-flow bind", async () => {
    const harness = setup();
    const ctx = harness.ctx();
    harness.controller.sync(ctx);
    await harness.tools
      .get("nano_flow_create")
      ?.execute(
        "id" as never,
        { kind: "plan", domain: "demo", name: "2026-11-09-示例" } as never,
        undefined as never,
        undefined as never,
        ctx as never,
      );
    await harness.commands.get("nano-flow")?.handler("bind" as never, ctx as never);
    const binding = harness.entries.find((entry) => entry.customType === BINDING_ENTRY);
    expect(binding?.data).toMatchObject({
      planPath: ".agents/domains/demo/plans/active/2026-11-09-示例",
    });
  });

  it("switches the session mode from /nano-flow and can persist the default", async () => {
    const harness = setup({ switchOn: true, always: true });
    const ctx = harness.ctx({
      mode: "print",
      ui: {
        notify: (message: string) => harness.notifications.push(message),
        select: async () => "关",
        confirm: async () => true,
        setWidget: () => undefined,
      },
    });
    await harness.commands.get("nano-flow")?.handler("" as never, ctx as never);
    expect(harness.entries.some((entry) => entry.customType === MODE_ENTRY)).toBe(true);
    expect(harness.saved).toEqual([false]);
    expect(harness.active()).not.toContain("nano_flow_create");
  });
});
