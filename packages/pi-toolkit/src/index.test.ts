import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import piToolkit, { type ToolkitOptions } from "./index.ts";
import { CONFIG_FILE_NAME } from "./settings.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RegisteredTool {
  name: string;
  defaultActive?: boolean;
  parameters: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: SessionContext,
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
}

interface SessionContext {
  cwd: string;
  isProjectTrusted: () => boolean;
  mode: string;
  hasUI: boolean;
  ui: {
    notify: (message: string, level?: string) => void;
    addAutocompleteProvider: (factory: unknown) => void;
    custom: unknown;
  };
  model: undefined;
  sessionManager: { getBranch: () => unknown[]; getSessionId: () => string };
}

interface Harness {
  readonly tools: RegisteredTool[];
  readonly active: () => string[];
  readonly commands: Map<string, { description?: string; handler: Handler }>;
  fire(event: string, ctx: SessionContext, payload?: unknown): unknown[];
  execute(name: string, params: Record<string, unknown>, ctx: SessionContext): Promise<unknown>;
}

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-toolkit-index-"));
  created.push(dir);
  return dir;
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const writeAgentConfig = (agentDir: string, config: Record<string, unknown>): void => {
  writeFileSync(join(agentDir, CONFIG_FILE_NAME), JSON.stringify(config));
};

const sessionContext = (cwd: string, overrides: Partial<SessionContext> = {}): SessionContext => {
  return {
    cwd,
    isProjectTrusted: () => true,
    mode: "tui",
    hasUI: true,
    ui: {
      notify: () => undefined,
      addAutocompleteProvider: () => undefined,
      custom: undefined,
    },
    model: undefined,
    sessionManager: {
      getBranch: () => [],
      getSessionId: () => "session",
    },
    ...overrides,
  };
};

/** Wire the extension against a fake pi with an isolated agent dir. */
const setup = (
  options: ToolkitOptions = {},
  initialActive: readonly string[] = ["read", "bash"],
  commands: SlashCommandInfo[] = [],
): Harness => {
  const tools: RegisteredTool[] = [];
  const handlers = new Map<string, Handler[]>();
  const registeredCommands = new Map<string, { description?: string; handler: Handler }>();
  let active = [...initialActive];
  const fake = {
    registerTool: (definition: RegisteredTool) => {
      tools.push(definition);
    },
    registerCommand: (name: string, command: { description?: string; handler: Handler }) => {
      registeredCommands.set(name, command);
    },
    on: (event: string, handler: Handler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    getCommands: () => commands,
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => {
      active = [...names];
    },
    getSessionName: () => undefined,
    setSessionName: () => undefined,
    registerFlag: () => undefined,
    getFlag: () => undefined,
    appendEntry: () => undefined,
  } as unknown as ExtensionAPI;
  piToolkit(fake, options);
  return {
    tools,
    active: () => [...active],
    commands: registeredCommands,
    fire: (event, ctx, payload) => {
      const results: unknown[] = [];
      for (const handler of handlers.get(event) ?? []) {
        results.push(handler(payload ?? {}, ctx as unknown as ExtensionContext));
      }
      return results;
    },
    execute: (name, params, ctx) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (tool === undefined) throw new Error(`tool ${name} was not registered`);
      return tool.execute("id", params, undefined, undefined, ctx);
    },
  };
};

beforeAll(() => {
  // `/toolkit` reuses pi's own SettingsList theme helpers.
  initTheme("dark", false);
});

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("piToolkit", () => {
  it("registers every tool inactive and the toolkit commands", () => {
    const harness = setup();
    const names = harness.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["web_search", "web_fetch", "nano_flow_read", "ask_questions"]),
    );
    for (const tool of harness.tools) expect(tool.defaultActive).toBe(false);
    expect(harness.commands.get("toolkit")?.description).toMatch(/enable or disable/iu);
    expect(harness.commands.get("nano-flow")?.description).toMatch(/nano flow/iu);
    const search = harness.tools.find((tool) => tool.name === "web_search");
    expect(Object.keys(search?.parameters.properties ?? {})).toEqual(["queries"]);
  });

  it("leaves everything off without a config file", async () => {
    const agentDir = tempDir();
    const harness = setup({ agentDir, homeDir: tempDir(), env: {} });
    const ctx = sessionContext(tempDir());
    harness.fire("session_start", ctx);
    expect(harness.active()).toEqual(["read", "bash"]);
    await expect(harness.execute("web_search", { queries: ["pi"] }, ctx)).rejects.toThrow(
      /disabled/u,
    );
  });

  it("activates the web tools when the switch is on and runs them", async () => {
    const agentDir = tempDir();
    const cwd = tempDir();
    writeAgentConfig(agentDir, {
      tools: { webTools: true },
      web: { apiKey: "k", searchMaxResults: 2 },
    });
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const target = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (target.includes("/tools/fetch")) return jsonResponse({ content: "# Hi" });
      return jsonResponse({
        results: [{ url: "https://a.example", title: "A", snippet: "S", date: null }],
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const harness = setup({ agentDir, homeDir: tempDir(), env: {} });
    const ctx = sessionContext(cwd);
    harness.fire("session_start", ctx);

    expect(harness.active()).toEqual(["read", "bash", "web_search", "web_fetch"]);
    const response = (await harness.execute("web_search", { queries: ["pi"] }, ctx)) as {
      content: Array<{ text: string }>;
    };
    expect(response.content[0]?.text).toContain("https://a.example");
    const fetchResponse = (await harness.execute(
      "web_fetch",
      { url: "https://a.example" },
      ctx,
    )) as { details: { statusCode: number } };
    expect(fetchResponse.details.statusCode).toBe(200);
  });

  it("turns previously active web tools back off", () => {
    const harness = setup({ agentDir: tempDir(), homeDir: tempDir(), env: {} }, [
      "read",
      "web_search",
      "web_fetch",
    ]);
    harness.fire("session_start", sessionContext(tempDir()));
    expect(harness.active()).toEqual(["read"]);
  });

  it("reports a malformed config instead of disabling the extension", () => {
    const agentDir = tempDir();
    writeFileSync(join(agentDir, CONFIG_FILE_NAME), "{ nope");
    const harness = setup({ agentDir, homeDir: tempDir(), env: {} });
    const messages: Array<{ message: string; level: string | undefined }> = [];
    const ctx = sessionContext(tempDir(), {
      ui: {
        notify: (message, level) => messages.push({ message, level }),
        addAutocompleteProvider: () => undefined,
        custom: undefined,
      },
    });
    expect(() => harness.fire("session_start", ctx)).not.toThrow();
    expect(messages[0]?.level).toBe("error");
    expect(messages[0]?.message).toMatch(/not valid JSON/u);
    expect(harness.active()).toEqual(["read", "bash"]);
  });

  it("refuses /toolkit outside TUI mode", async () => {
    const harness = setup({ agentDir: tempDir(), homeDir: tempDir(), env: {} });
    const messages: Array<{ message: string; level: string | undefined }> = [];
    const ctx = sessionContext(tempDir(), {
      mode: "print",
      ui: {
        notify: (message, level) => messages.push({ message, level }),
        addAutocompleteProvider: () => undefined,
        custom: undefined,
      },
    });
    const command = harness.commands.get("toolkit");
    await command?.handler("", ctx as unknown as ExtensionContext);
    expect(messages).toEqual([{ message: "/toolkit requires interactive mode", level: "error" }]);
  });

  it("contributes nested skill paths only when the switch is on", () => {
    const agentDir = tempDir();
    const homeDir = tempDir();
    const project = tempDir();
    mkdirSync(join(project, ".git"), { recursive: true });
    const writeSkill = (dir: string): void => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), "---\nname: beta\n---\n\nbody\n");
    };
    writeSkill(join(project, ".agents/skills/alpha"));
    writeSkill(join(project, ".agents/skills/alpha/references/skills/beta"));

    const off = setup({ agentDir, homeDir, env: {} });
    const offCtx = sessionContext(project);
    off.fire("session_start", offCtx);
    const offResults = off.fire("resources_discover", offCtx);
    expect(offResults.length).toBeGreaterThan(0);
    for (const result of offResults) expect(result).toBeUndefined();

    writeAgentConfig(agentDir, { tools: { nestedSkills: true } });
    const on = setup({ agentDir, homeDir, env: {} });
    const onCtx = sessionContext(project);
    on.fire("session_start", onCtx);
    const contributions = on.fire("resources_discover", onCtx) as Array<
      { skillPaths?: string[] } | undefined
    >;
    const paths = contributions.flatMap((contribution) => contribution?.skillPaths ?? []);
    expect(
      paths.some((path) => path.replaceAll("\\", "/").endsWith("references/skills/beta")),
    ).toBe(true);
  });

  it("does not name sessions while the switch is off", () => {
    const harness = setup({ agentDir: tempDir(), homeDir: tempDir(), env: {} });
    const ctx = sessionContext(tempDir());
    harness.fire("session_start", ctx);
    const results = harness.fire("input", ctx, { text: "帮我看看", source: "interactive" });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results.filter((item) => item !== undefined)) {
      expect(result).toEqual({ action: "continue" });
    }
  });

  it("persists a switch flip from /toolkit and applies it immediately", async () => {
    const agentDir = tempDir();
    const harness = setup({ agentDir, homeDir: tempDir(), env: {} });
    let component: { handleInput?: (data: string) => void } | undefined;
    const ctx = sessionContext(tempDir(), {
      ui: {
        notify: () => undefined,
        addAutocompleteProvider: () => undefined,
        custom: (
          factory: (
            tui: unknown,
            theme: unknown,
            keybindings: unknown,
            done: () => void,
          ) => { handleInput?: (data: string) => void },
        ) =>
          new Promise<void>((resolve) => {
            component = factory(
              { requestRender: () => undefined },
              { fg: (_token: string, text: string) => text, bold: (text: string) => text },
              {},
              resolve,
            );
          }),
      },
    });
    harness.fire("session_start", ctx);
    const command = harness.commands.get("toolkit");
    const opened = command?.handler("", ctx as unknown as ExtensionContext);
    component?.handleInput?.("\r");
    expect(harness.active()).toEqual(["read", "bash", "web_search", "web_fetch"]);
    component?.handleInput?.("\u001b");
    await opened;

    const written = JSON.parse(readFileSync(join(agentDir, CONFIG_FILE_NAME), "utf-8")) as {
      tools: Record<string, boolean>;
    };
    expect(written.tools["webTools"]).toBe(true);
  });
});
