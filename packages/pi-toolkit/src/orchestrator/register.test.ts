import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import { assetsSkillsRoot } from "./assets.ts";
import { readInterrupted, stateDirectory, writeInterrupted } from "./errors.ts";
import { MODE_ENTRY, RESET_ENTRY, type BranchEntryLike } from "./mode.ts";
import { BASELINE_ENTRY, ORCHESTRATOR_TOOL_NAMES, registerOrchestrator } from "./register.ts";

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
  readonly sent: Array<{ customType?: string; content: string }>;
  current: ToolkitSettings;
  /** 直接改宿主活跃集，模拟 /toolkit 之类别的开关或 reload。 */
  setActive(names: string[]): void;
  /** 改宿主设置（`defaultTools`）。 */
  setPiSettings(next: { defaultTools?: string[] }): void;
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
  tools: { ...DEFAULT_TOOLS, orchestrator: patch.switchOn ?? true },
  orchestrator: { ...DEFAULT_SETTINGS.orchestrator, always: patch.always ?? false },
});

const setup = (settings: ToolkitSettings): Harness => {
  const handlers = new Map<string, Handler[]>();
  const notifications: Array<{ message: string; level: string | undefined }> = [];
  const alwaysCalls: boolean[] = [];
  const flags = new Map<string, boolean | string>();
  const branch: BranchEntryLike[] = [];
  const sent: Array<{ customType?: string; content: string }> = [];
  const tools: FakeTool[] = [];
  let active = ["read", "bash"];
  // 宿主设置：`defaultTools` 是配置层默认集的来源。测试里可改。
  let piSettings: { defaultTools?: string[] } = {};
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
    sendMessage: (message: { customType?: string; content: string }) => {
      sent.push({
        content: String(message.content),
        ...(message.customType === undefined ? {} : { customType: message.customType }),
      });
    },
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => {
      active = [...names];
    },
    getSettings: () => ({ ...piSettings }),
  } as unknown as ExtensionAPI;
  const harness: Harness = {
    pi,
    active: () => [...active],
    branch,
    notifications,
    alwaysCalls,
    flags,
    sent,
    current: settings,
    setActive(names) {
      active = [...names];
    },
    setPiSettings(next) {
      piSettings = next;
    },
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
      const handler = commands.get("orchestrator");
      if (handler === undefined) throw new Error("orchestrator command not registered");
      await handler(args, ctx);
    },
  };
  let handle: import("./register.ts").OrchestratorHandle | undefined;
  handle = registerOrchestrator(pi, {
    settings: () => harness.current,
    setAlways: (always) => {
      alwaysCalls.push(always);
      harness.current = {
        ...harness.current,
        orchestrator: { ...harness.current.orchestrator, always },
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

describe("registerOrchestrator", () => {
  it("stays inert while the toolkit switch is off", async () => {
    const harness = setup(settingsWith({ switchOn: false, always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.active()).toEqual(["read", "bash"]);
    const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
    await harness.fire("before_agent_start", ctx, event);
    expect(event.systemPromptOptions.sections["orchestrator"]).toBeUndefined();
    expect(await harness.fire("session_before_compact", ctx)).toEqual([undefined]);
    expect(await harness.fire("resources_discover", ctx)).toEqual([undefined]);
    // 开关关闭时连“收敛”这一步都不做：active 集合原样留着。
    expect(harness.active()).toEqual(["read", "bash"]);
  });

  it("converges the live tools to the whitelist and injects the fixed prompt when always-on", async () => {
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    // 严格白名单：宿主的 read / bash 也被收掉，不只是“补上 orchestrator_*”。
    expect(harness.active()).toEqual([...ORCHESTRATOR_TOOL_NAMES]);

    const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
    await harness.fire("before_agent_start", ctx, event);
    expect(event.systemPromptOptions.sections["orchestrator"]).toContain("Orchestrator");
    expect(await harness.fire("session_before_compact", ctx)).toEqual([{ cancel: true }]);

    const discovered = (await harness.fire("resources_discover", ctx)) as {
      skillPaths?: string[];
    }[];
    expect(discovered[0]?.skillPaths?.[0]).toBe(assetsSkillsRoot());
  });

  it("restores the configured default tools after the mode turns off, without re-snapshotting it", async () => {
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.active()).toEqual([...ORCHESTRATOR_TOOL_NAMES]);
    // 每轮 before_agent_start 都会再 sync 一次；这里不能把收敛后的集合当成新基线。
    await harness.fire("before_agent_start", ctx, {
      systemPromptOptions: { sections: {} as Record<string, string> },
    });
    expect(harness.active()).toEqual([...ORCHESTRATOR_TOOL_NAMES]);

    harness.current = settingsWith({ always: false });
    await harness.fire("session_tree", ctx);
    // 恢复的是配置层默认集（`defaultTools` 未设置时就是宿主那四个），不是收敛后的六个。
    expect(harness.active()).toEqual(["read", "bash", "edit", "write"]);
  });

  it("restores the config default set when the active tools were already converged", async () => {
    // 真机回归：pi 把工具装载记进 transcript，reload / 恢复会话会重现收敛后的六个。
    // 于是“基线”只能是配置层来源，否则关掉模式后 bash 永远回不来。
    const harness = setup(settingsWith({ always: false }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.setActive([...ORCHESTRATOR_TOOL_NAMES]);
    harness.start(ctx);
    expect(harness.active()).toEqual(["read", "bash", "edit", "write"]);
    expect(harness.active()).toContain("bash");
  });

  it("applies defaultTools modifiers when it restores", async () => {
    const harness = setup(settingsWith({ always: false }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.setPiSettings({ defaultTools: ["+codemode", "-write"] });
    harness.setActive([...ORCHESTRATOR_TOOL_NAMES]);
    harness.start(ctx);
    expect(harness.active()).toEqual(["read", "bash", "edit", "codemode"]);
  });

  it("replaces the default set when defaultTools is a plain list", async () => {
    const harness = setup(settingsWith({ always: false }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.setPiSettings({ defaultTools: ["read", "grep"] });
    harness.setActive([...ORCHESTRATOR_TOOL_NAMES]);
    harness.start(ctx);
    expect(harness.active()).toEqual(["read", "grep"]);
  });

  it("leaves a session that never converged alone", async () => {
    // `pi --tools grep` 这类启动方式下，宿主的选择不能被我们补成默认四个。
    const harness = setup(settingsWith({ always: false }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.setActive(["grep"]);
    harness.start(ctx);
    expect(harness.active()).toEqual(["grep"]);
  });

  it("records the pre-convergence tool set once, so a reload can read it back", async () => {
    const harness = setup(settingsWith({ always: true }));
    harness.setActive(["read", "bash", "web_search"]);
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.active()).toEqual([...ORCHESTRATOR_TOOL_NAMES]);
    expect(harness.branch.filter((entry) => entry.customType === BASELINE_ENTRY)).toHaveLength(1);
    harness.start(ctx);
    // 收敛之后再 start 不得重记：那会把收敛结果写成“基线”。
    expect(harness.branch.filter((entry) => entry.customType === BASELINE_ENTRY)).toHaveLength(1);
    harness.current = settingsWith({ always: false });
    await harness.fire("session_tree", ctx);
    expect(harness.active()).toEqual(["read", "bash", "edit", "write", "web_search"]);
  });

  it("keeps tools owned by another switch when it restores", async () => {
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    // 收敛期间由 /toolkit 重新激活的 web 工具不属于本插件的基线，恢复时不能抹掉。
    harness.setActive([...ORCHESTRATOR_TOOL_NAMES, "web_search"]);
    harness.current = settingsWith({ always: false });
    await harness.fire("session_tree", ctx);
    expect(harness.active()).toEqual(["read", "bash", "edit", "write", "web_search"]);
  });

  it("lets a session override turn always-on back off", async () => {
    const harness = setup(settingsWith({ always: true }));
    harness.branch.push({ type: "custom", customType: MODE_ENTRY, data: { enabled: false } });
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.active()).toEqual(["read", "bash"]);
  });

  it("starts in Orchestrator when the CLI flag is set", async () => {
    const harness = setup(settingsWith({}));
    harness.flags.set("orchestrator", true);
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir());
    harness.start(ctx);
    expect(harness.branch.at(-1)).toMatchObject({
      customType: MODE_ENTRY,
      data: { enabled: true },
    });
    expect(harness.active()).toContain("orchestrator_read");
    // 启动不再自动对账：不注入任何消息，不强制跑一轮模型。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.sent.filter((item) => item.customType === "orchestrator-reconcile")).toEqual([]);
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
    harness.start(ctx);
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
    // 关模式回到配置层默认集（不再是启动快照）。
    expect(harness.active()).toEqual(["read", "bash", "edit", "write"]);
    expect(harness.branch.at(-1)).toMatchObject({ data: { enabled: false } });
  });

  it("refuses /orchestrator while the switch is off", async () => {
    const harness = setup(settingsWith({ switchOn: false }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir(), { mode: "print" });
    await harness.command("", ctx);
    expect(harness.notifications.at(-1)).toEqual({
      message: "Orchestrator 未启用：先在 /toolkit 打开 Orchestrator 开关。",
      level: "warning",
    });
  });

  it("blocks direct notes.json access in Orchestrator mode", async () => {
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
        reason:
          "notes.json 只能经 orchestrator_* 工具读写；请改用 orchestrator_read / orchestrator_write。",
      },
    ]);
    expect(
      await harness.fire("tool_call", ctx, {
        toolName: "orchestrator_read",
        input: { op: "notes" },
      }),
    ).toEqual([undefined]);
    expect(
      await harness.fire("tool_call", ctx, { toolName: "read", input: { path: "spec.md" } }),
    ).toEqual([undefined]);
    expect(
      await harness.fire("tool_call", ctx, {
        toolName: "write",
        input: { path: "src/repair.ts", content: "notes.json" },
      }),
    ).toEqual([undefined]);
    expect(
      await harness.fire("tool_call", ctx, {
        toolName: "grep",
        input: { pattern: "notes.json" },
      }),
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

  it("reports status through /orchestrator status", async () => {
    const harness = setup(settingsWith({ always: true }));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir(), { mode: "print" });
    harness.start(ctx);
    await harness.command("status", ctx);
    const message = harness.notifications.at(-1)?.message ?? "";
    expect(message).toContain("Orchestrator: 开");
    expect(message).toContain("active Plan: 无");
  });

  it("shows crash credentials in /orchestrator status, then clears the whole record", async () => {
    const agentDir = await tempDir();
    const previous = process.env["PI_CODING_AGENT_DIR"];
    process.env["PI_CODING_AGENT_DIR"] = agentDir;
    try {
      const harness = setup(settingsWith({ always: true }));
      const ctx = makeCtx(harness.branch, harness.notifications, await tempDir(), {
        mode: "print",
      });
      const directory = stateDirectory(agentDir);
      writeInterrupted(directory, {
        at: "2026-11-07T00:00:00.000Z",
        reason: "uncaughtException: worker 炸了",
        plans: ["demo/active/x", "demo/active/y"],
      });
      harness.start(ctx);
      // 启动不读也不写凭据。
      expect(readInterrupted(directory)?.plans).toEqual(["demo/active/x", "demo/active/y"]);
      await harness.command("status", ctx);
      const message = harness.notifications.at(-1)?.message ?? "";
      expect(message).toContain(
        "上次崩溃: 2026-11-07T00:00:00.000Z · uncaughtException: worker 炸了",
      );
      expect(message).toContain("仍在跑: demo/active/x, demo/active/y");
      expect(readInterrupted(directory)).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env["PI_CODING_AGENT_DIR"];
      else process.env["PI_CODING_AGENT_DIR"] = previous;
    }
  });

  it("sets the default through the save action", async () => {
    const harness = setup(settingsWith({}));
    const ctx = makeCtx(harness.branch, harness.notifications, await tempDir(), {
      mode: "print",
      select: async (_title, labels) => labels.find((label) => label === "开"),
      confirm: async () => true,
    });
    harness.start(ctx);
    await harness.command("", ctx);
    expect(harness.alwaysCalls).toEqual([true]);
    expect(harness.current.orchestrator.always).toBe(true);
    expect(harness.active()).toContain("orchestrator_write");
  });
});
