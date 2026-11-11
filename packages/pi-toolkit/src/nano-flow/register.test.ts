import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  id?: string;
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
  readonly sent: string[];
  /** 覆盖 `pi.exec` 的返回值，用于门禁测试。 */
  setExec(result: { stdout?: string; stderr?: string; code?: number }): void;
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
  const sent: string[] = [];
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
      entries.push({ type: "custom", customType, data, id: `e${entries.length + 1}` }),
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => {
      active = [...names];
    },
    sendUserMessage: (content: string) => sent.push(content),
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false, truncated: false }),
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
      sessionManager: {
        getBranch: () => entries,
        getSessionId: () => "session",
        getLeafId: () => entries[entries.length - 1]?.id,
        getSessionFile: () => "/sessions/session.jsonl",
      },
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
    sent,
    setExec: (result) => {
      (pi as unknown as { exec: () => Promise<unknown> }).exec = async () => ({
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        code: result.code ?? 0,
        killed: false,
        truncated: false,
      });
    },
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
    // Windows joins these paths with `\`, so the assertion must accept both separators.
    expect(discovered[0]?.skillPaths?.[0]).toMatch(/nano-flow[/\\]skills$/u);

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
    expect(result?.message?.customType).toBe("nano-flow/input");
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

  it("cancels manual, threshold and overflow compaction while Nano Flow is active", () => {
    const harness = setup();
    const ctx = harness.ctx();
    for (const reason of ["manual", "threshold", "overflow"]) {
      expect(harness.fire("session_before_compact", ctx, { reason })).toEqual([{ cancel: true }]);
    }

    // 关闭 Nano Flow（开关或会话模式任一为假）后压缩恢复默认行为。
    const off = setup({ switchOn: false, always: true });
    expect(off.fire("session_before_compact", off.ctx(), { reason: "manual" })).toEqual([
      undefined,
    ]);
    const notInMode = setup({ switchOn: true, always: false });
    expect(notInMode.fire("session_before_compact", notInMode.ctx(), { reason: "manual" })).toEqual(
      [undefined],
    );
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

  it("writes one plan log record per run", async () => {
    const harness = setup();
    const planDir = tempDir();
    const ctx = harness.ctx({ cwd: planDir });
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
    await harness.tools
      .get("nano_flow_bind")
      ?.execute(
        "id" as never,
        { plan: "2026-11-09-示例" } as never,
        undefined as never,
        undefined as never,
        ctx as never,
      );

    // 第一次 run：先记 mark，再追加本轮条目，最后在 agent_end 写盘。
    harness.fire("agent_start", ctx);
    harness.entries.push({ type: "message", id: "u1", message: { role: "user" } });
    harness.entries.push({ type: "message", id: "a1", message: { role: "assistant" } });
    await Promise.all(harness.fire("agent_end", ctx));

    const logFile = join(planDir, ".agents/domains/demo/plans/active/2026-11-09-示例/log.jsonl");
    const lines = readFileSync(logFile, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] ?? "{}") as {
      run: number;
      planPath: string;
      entries: Array<{ id?: string }>;
    };
    expect(record.run).toBe(1);
    expect(record.planPath).toBe(".agents/domains/demo/plans/active/2026-11-09-示例");
    expect(record.entries.map((entry) => entry.id)).toEqual(["u1", "a1"]);

    // 第二次 run：只记新增条目，序号递增。
    harness.fire("agent_start", ctx);
    harness.entries.push({ type: "message", id: "u2", message: { role: "user" } });
    await Promise.all(harness.fire("agent_end", ctx));
    const after = readFileSync(logFile, "utf8").trim().split("\n");
    expect(after).toHaveLength(2);
    expect(JSON.parse(after[1] ?? "{}")).toMatchObject({ run: 2 });
    expect((JSON.parse(after[1] ?? "{}") as { entries: Array<{ id?: string }> }).entries).toEqual([
      { type: "message", id: "u2", message: { role: "user" } },
    ]);
  });

  it("skips the plan log when nano-flow is off or no plan is bound", async () => {
    const off = setup({ switchOn: false });
    const dir = tempDir();
    const ctx = off.ctx({ cwd: dir });
    off.controller.sync(ctx);
    off.fire("agent_start", ctx);
    off.entries.push({ type: "message", id: "u1" });
    await Promise.all(off.fire("agent_end", ctx));
    expect(() => readFileSync(join(dir, "log.jsonl"), "utf8")).toThrow();

    const unbound = setup();
    const dir2 = tempDir();
    const ctx2 = unbound.ctx({ cwd: dir2 });
    unbound.controller.sync(ctx2);
    unbound.fire("agent_start", ctx2);
    unbound.entries.push({ type: "message", id: "u1" });
    await Promise.all(unbound.fire("agent_end", ctx2));
    expect(() => readFileSync(join(dir2, "log.jsonl"), "utf8")).toThrow();
  });

  it("starts a dream run for every domain from /dream", async () => {
    const harness = setup();
    const workspace = tempDir();
    mkdirSync(join(workspace, ".agents/domains/demo/plans/active/2026-11-09-示例"), {
      recursive: true,
    });
    writeFileSync(
      join(workspace, ".agents/domains/demo/plans/active/2026-11-09-示例/spec.md"),
      "---\nname: 'x'\ndescription: 'y'\n---\n",
      "utf8",
    );
    const ctx = harness.ctx({ cwd: workspace, isIdle: () => true });
    harness.controller.sync(ctx);
    await harness.commands.get("dream")?.handler("" as never, ctx as never);

    expect(harness.entries.some((entry) => entry.customType === "nano-flow-dream")).toBe(true);
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]).toContain("你是 Nano Flow 的 dream 维护者");
    expect(harness.sent[0]).toContain("2026-11-09-示例");
  });

  it("refuses to dream with a dirty worktree, while busy, or without plans", async () => {
    const harness = setup();
    const workspace = tempDir();
    const ctx = harness.ctx({ cwd: workspace, isIdle: () => true });
    harness.controller.sync(ctx);
    const dream = harness.commands.get("dream");

    // 工作区脏：拒绝。
    harness.setExec({ stdout: " M spec.md\n" });
    await dream?.handler("" as never, ctx as never);
    expect(harness.sent).toHaveLength(0);
    expect(harness.notifications.at(-1)).toContain("未提交改动");

    // 没有 Plan：拒绝。
    harness.setExec({ stdout: "" });
    await dream?.handler("" as never, ctx as never);
    expect(harness.sent).toHaveLength(0);
    expect(harness.notifications.at(-1)).toContain("没有 active / reference 的 Plan");

    // 代理忙：拒绝。
    mkdirSync(join(workspace, ".agents/domains/demo/plans/active/2026-11-09-示例"), {
      recursive: true,
    });
    writeFileSync(
      join(workspace, ".agents/domains/demo/plans/active/2026-11-09-示例/spec.md"),
      "---\nname: 'x'\ndescription: 'y'\n---\n",
      "utf8",
    );
    const busy = harness.ctx({ cwd: workspace, isIdle: () => false });
    await dream?.handler("" as never, busy as never);
    expect(harness.sent).toHaveLength(0);
    expect(harness.notifications.at(-1)).toContain("等当前轮结束");
  });

  it("refuses to dream when nano-flow is off or the session is not in nano-flow", async () => {
    const off = setup({ switchOn: false });
    const ctx = off.ctx({ cwd: tempDir(), isIdle: () => true });
    off.controller.sync(ctx);
    await off.commands.get("dream")?.handler("" as never, ctx as never);
    expect(off.sent).toHaveLength(0);
    expect(off.notifications.at(-1)).toContain("/toolkit");

    const idle = setup({ switchOn: true, always: false });
    idle.entries.push({
      type: "custom",
      customType: MODE_ENTRY,
      data: { enabled: false },
      id: "m1",
    });
    const inactive = idle.ctx({ cwd: tempDir(), isIdle: () => true });
    idle.controller.sync(inactive);
    await idle.commands.get("dream")?.handler("" as never, inactive as never);
    expect(idle.sent).toHaveLength(0);
    expect(idle.notifications.at(-1)).toContain("/nano-flow");
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
