import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import { assetsSkillsRoot } from "./assets.ts";
import { MODE_ENTRY, RESET_ENTRY, type BranchEntryLike } from "./mode.ts";
import { NANO_FLOW_TOOL_NAMES, registerNanoFlow } from "./register.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

interface FakeTool {
  name: string;
  defaultActive?: boolean;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly active: () => string[];
  readonly branch: BranchEntryLike[];
  readonly notifications: Array<{ message: string; level: string | undefined }>;
  readonly alwaysCalls: boolean[];
  readonly flags: Map<string, boolean | string>;
  current: ToolkitSettings;
  start(ctx: ExtensionContext): void;
  fire(event: string, ctx: ExtensionContext, payload?: unknown): Promise<unknown[]>;
  command(args: string, ctx: ExtensionContext): Promise<void>;
}

const created: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-nano-register-"));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const settingsWith = (patch: { switchOn?: boolean; always?: boolean }): ToolkitSettings => ({
  ...DEFAULT_SETTINGS,
  tools: { ...DEFAULT_TOOLS, nanoFlow: patch.switchOn ?? true },
  nanoFlow: { ...DEFAULT_SETTINGS.nanoFlow, always: patch.always ?? false },
});

const setup = (settings: ToolkitSettings): Harness => {
  const handlers = new Map<string, Handler[]>();
  const notifications: Array<{ message: string; level: string | undefined }> = [];
  const alwaysCalls: boolean[] = [];
  const flags = new Map<string, boolean | string>();
  const branch: BranchEntryLike[] = [];
  const tools: FakeTool[] = [];
  let active = ["read", "bash"];
  const commands = new Map<string, Handler>();
  const pi = {
    registerTool: (tool: FakeTool) => {
      tools.push(tool);
    },
    registerCommand: (name: string, command: { handler: Handler }) => {
      commands.set(name, command.handler);
    },
    registerFlag: (name: string) => {
      flags.set(name, false);
    },
    getFlag: (name: string) => flags.get(name),
    appendEntry: (customType: string, data?: unknown) => {
      branch.push({ type: "custom", customType, data });
    },
    on: (event: string, handler: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => {
      active = [...names];
    },
  } as unknown as ExtensionAPI;
  const harness: Harness = {
    pi,
    active: () => [...active],
    branch,
    notifications,
    alwaysCalls,
    flags,
    current: settings,
    async fire(event, ctx, payload) {
      const results: unknown[] = [];
      for (const handler of handlers.get(event) ?? []) {
        results.push(await handler(payload ?? {}, ctx));
      }
      return results;
    },
    start(ctx) {
      handle?.start(ctx);
    },
    async command(args, ctx) {
      const handler = commands.get("nano-flow");
      if (handler === undefined) throw new Error("nano-flow command not registered");
      await handler(args, ctx);
    },
  };
  let handle: import("./register.ts").NanoFlowHandle | undefined;
  handle = registerNanoFlow(pi, {
    settings: () => harness.current,
    setAlways: (always) => {
      alwaysCalls.push(always);
      harness.current = {
        ...harness.current,
        nanoFlow: { ...harness.current.nanoFlow, always },
      };
    },
  });
  return harness;
};

interface CtxOptions {
  readonly usage?: { tokens: number | null; contextWindow: number; percent: number | null };
  readonly select?: (title: string, labels: string[]) => Promise<string | undefined>;
  readonly confirm?: (title: string, message: string) => Promise<boolean>;
  readonly mode?: string;
}

const makeCtx = (
  branch: readonly BranchEntryLike[],
  notifications: Array<{ message: string; level: string | undefined }>,
  cwd: string,
  options: CtxOptions = {},
): ExtensionContext => {
  return {
    cwd,
    mode: options.mode ?? "tui",
    hasUI: true,
    isProjectTrusted: () => true,
    model: undefined,
    sessionManager: {
      getBranch: () => branch,
      getSessionId: () => "session",
      getSessionFile: () => undefined,
    },
    getContextUsage: () => options.usage ?? { tokens: 10, contextWindow: 100, percent: 10 },
    ui: {
      notify: (message: string, level?: string) => notifications.push({ message, level }),
      select: options.select ?? (async () => undefined),
      confirm: options.confirm ?? (async () => false),
      custom: undefined,
      addAutocompleteProvider: () => undefined,
    },
  } as unknown as ExtensionContext;
};

describe("registerNanoFlow", () => {
  it("stays inert while the toolkit switch is off", async () => {
    const harness = setup(settingsWith({ switchOn: false, always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.active()).toEqual(["read", "bash"]);
    const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
    await harness.fire("before_agent_start", ctx, event);
    expect(event.systemPromptOptions.sections["nano_flow"]).toBeUndefined();
    expect(await harness.fire("session_before_compact", ctx)).toEqual([undefined]);
    expect(await harness.fire("resources_discover", ctx)).toEqual([undefined]);
  });

  it("activates the four tools and injects the fixed prompt when always-on", async () => {
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    for (const name of NANO_FLOW_TOOL_NAMES) expect(harness.active()).toContain(name);

    const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
    await harness.fire("before_agent_start", ctx, event);
    expect(event.systemPromptOptions.sections["nano_flow"]).toContain("Nano Flow");
    expect(await harness.fire("session_before_compact", ctx)).toEqual([{ cancel: true }]);

    const discovered = (await harness.fire("resources_discover", ctx)) as {
      skillPaths?: string[];
    }[];
    expect(discovered[0]?.skillPaths?.[0]).toBe(assetsSkillsRoot());
  });

  it("lets a session override turn always-on back off", async () => {
    const harness = setup(settingsWith({ always: true }));
    harness.branch.push({ type: "custom", customType: MODE_ENTRY, data: { enabled: false } });
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.active()).toEqual(["read", "bash"]);
  });

  it("starts in Nano Flow when the CLI flag is set", async () => {
    const harness = setup(settingsWith({}));
    harness.flags.set("nano-flow", true);
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.branch.at(-1)).toMatchObject({
      customType: MODE_ENTRY,
      data: { enabled: true },
    });
    expect(harness.active()).toContain("nano_flow_read");
  });

  it("changes the session mode and persists the default separately", async () => {
    const harness = setup(settingsWith({}));
    const choose = (picked: string, persist: boolean) => ({
      mode: "print",
      select: async (_title: string, labels: string[]) => labels.find((label) => label === picked),
      confirm: async () => persist,
    });
    const ctx = makeCtx(
      harness.branch,
      harness.notifications,
      await tempDir(),
      choose("开", false),
    );
    await harness.command("", ctx);
    expect(harness.active()).toContain("ask_questions");
    expect(harness.branch.at(-1)).toMatchObject({ data: { enabled: true } });
    expect(harness.alwaysCalls).toEqual([]);

    const offCtx = makeCtx(
      harness.branch,
      harness.notifications,
      await tempDir(),
      choose("关", true),
    );
    await harness.command("", offCtx);
    expect(harness.alwaysCalls).toEqual([false]);
    expect(harness.active()).toEqual(["read", "bash"]);
    expect(harness.branch.at(-1)).toMatchObject({ data: { enabled: false } });
  });

  it("refuses /nano-flow while the switch is off", async () => {
    const harness = setup(settingsWith({ switchOn: false }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir(), { mode: "print" });
    await harness.command("", ctx);
    expect(harness.notifications.at(-1)).toEqual({
      message: "Nano Flow 未启用：先在 /toolkit 打开 Nano Flow 开关。",
      level: "warning",
    });
  });

  it("blocks direct notes.json access in Nano Flow mode", async () => {
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    const blocked = await harness.fire("tool_call", ctx, {
      toolName: "read",
      input: { path: ".agents/domains/demo/plans/active/x/notes.json" },
    });
    expect(blocked).toEqual([
      {
        block: true,
        reason: "notes.json 只能经 nano_flow_* 工具读写；请改用 nano_flow_read / nano_flow_write。",
      },
    ]);
    expect(
      await harness.fire("tool_call", ctx, {
        toolName: "nano_flow_read",
        input: { op: "notes" },
      }),
    ).toEqual([undefined]);
    expect(
      await harness.fire("tool_call", ctx, { toolName: "read", input: { path: "spec.md" } }),
    ).toEqual([undefined]);
  });

  it("clears context at the threshold and re-seeds the plan", async () => {
    const cwd = await tempDir();
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, cwd, {
      usage: { tokens: 90, contextWindow: 100, percent: 90 },
    });
    harness.start(ctx);
    await harness.fire("input", ctx, { source: "interactive", text: "继续" });
    const marker = harness.branch.at(-1) as { customType?: string; data?: { at?: number } };
    expect(marker.customType).toBe(RESET_ENTRY);
    const at = marker.data?.at ?? 0;

    const contextResult = (await harness.fire("context", ctx, {
      messages: [{ timestamp: at - 100 }, { timestamp: at }, { timestamp: at + 5 }],
    })) as { messages: { role: string; content: { text: string }[]; timestamp: number }[] }[];
    const messages = contextResult[0]?.messages ?? [];
    expect(messages).toHaveLength(3);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content[0]?.text).toContain("上下文已达阈值");
    expect(messages[1]?.timestamp).toBe(at);
    expect(messages[2]?.timestamp).toBe(at + 5);
  });

  it("reports status through /nano-flow status", async () => {
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir(), { mode: "print" });
    harness.start(ctx);
    await harness.command("status", ctx);
    const message = harness.notifications.at(-1)?.message ?? "";
    expect(message).toContain("Nano Flow: 开");
    expect(message).toContain("active Plan: 无");
  });

  it("sets the default through the save action", async () => {
    const harness = setup(settingsWith({}));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir(), {
      mode: "print",
      select: async (_title, labels) => labels.find((label) => label === "开"),
      confirm: async () => true,
    });
    await harness.command("", ctx);
    expect(harness.alwaysCalls).toEqual([true]);
    expect(harness.current.nanoFlow.always).toBe(true);
    expect(harness.active()).toContain("nano_flow_write");
  });
});
