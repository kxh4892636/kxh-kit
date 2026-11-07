import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  CONFIG_FILE_NAME,
  loadSettings,
  type ToolkitSettings,
  type ToolToggles,
} from "../settings.ts";
import { applyWebToolActivation, registerWebTools } from "./register.ts";

interface RegisteredTool {
  name: string;
  description: string;
  defaultActive?: boolean;
  parameters: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: FakeContext,
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
}

interface FakeContext {
  cwd: string;
  isProjectTrusted: () => boolean;
  sessionManager: { getBranch: () => unknown[] };
}

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-toolkit-web-"));
  created.push(dir);
  return dir;
};

/** Write a project config and register the tools against the parsed settings. */
const setup = (
  cwd: string,
  web: Record<string, unknown> = {},
  toggles: Partial<ToolToggles> = {},
): { tools: RegisteredTool[]; settings: ToolkitSettings } => {
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", CONFIG_FILE_NAME),
    JSON.stringify({
      tools: { webTools: true, ...toggles },
      web,
    }),
  );
  const { settings } = loadSettings({ cwd, agentDir: tempDir(), env: {} });
  const tools: RegisteredTool[] = [];
  const fake = {
    registerTool: (definition: unknown) => {
      tools.push(definition as RegisteredTool);
    },
  } as unknown as ExtensionAPI;
  registerWebTools(fake, { settings: () => settings, configPaths: () => ["config"] });
  return { tools, settings };
};

const toolNamed = (tools: RegisteredTool[], name: string): RegisteredTool => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`tool ${name} was not registered`);
  return tool;
};

const contextFor = (cwd: string, userText?: string): FakeContext => ({
  cwd,
  isProjectTrusted: () => true,
  sessionManager: {
    getBranch: () =>
      userText === undefined
        ? []
        : [
            {
              type: "message",
              message: { role: "user", content: [{ type: "text", text: userText }] },
            },
          ],
  },
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const result = (url: string): Record<string, unknown> => ({
  url,
  title: `T ${url}`,
  snippet: `S ${url}`,
  date: null,
});

const bodyOf = (call: unknown): Record<string, unknown> => {
  const init = (call as [string, RequestInit?])[1];
  return JSON.parse(typeof init?.body === "string" ? init.body : "{}");
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("registerWebTools", () => {
  it("registers the harness tool schemas inactive", () => {
    const { tools } = setup(tempDir(), { apiKey: "k" });
    expect(tools.map((tool) => tool.name).sort()).toEqual(["web_fetch", "web_search"]);
    for (const tool of tools) expect(tool.defaultActive).toBe(false);
    const search = toolNamed(tools, "web_search");
    expect(Object.keys(search.parameters.properties ?? {})).toEqual(["queries"]);
    expect(search.parameters.required).toEqual(["queries"]);
    const fetch = toolNamed(tools, "web_fetch");
    expect(Object.keys(fetch.parameters.properties ?? {})).toEqual(["url"]);
    expect(fetch.parameters.required).toEqual(["url"]);
  });

  it("rejects calls while the switch is off", async () => {
    const { tools } = setup(tempDir(), { apiKey: "k" }, { webTools: false });
    const ctx = contextFor(tempDir());
    await expect(
      toolNamed(tools, "web_search").execute("id", { queries: ["a"] }, undefined, undefined, ctx),
    ).rejects.toThrow(/web_search is disabled/u);
    await expect(
      toolNamed(tools, "web_fetch").execute(
        "id",
        { url: "https://a.example" },
        undefined,
        undefined,
        ctx,
      ),
    ).rejects.toThrow(/web_fetch is disabled/u);
  });

  it("merges multiple queries, caps sources, and injects the user question", async () => {
    const dir = tempDir();
    const { tools } = setup(dir, {
      apiKey: "k",
      searchCount: 10,
      searchMaxResults: 2,
      searchMaxQueries: 5,
    });
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        query: string;
      };
      if (body.query === "a") {
        return jsonResponse({
          results: [result("https://a1.example"), result("https://a2.example")],
        });
      }
      return jsonResponse({
        results: [result("https://b1.example"), result("https://a2.example")],
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const response = await toolNamed(tools, "web_search").execute(
      "id",
      { queries: ["a", "b"] },
      undefined,
      undefined,
      contextFor(dir, "what is pi?"),
    );

    expect(response.content[0]?.text).toContain("Sources:");
    expect(response.content[0]?.text).toContain("https://a1.example");
    expect(response.content[0]?.text).toContain("Showing the first 2 sources");
    expect(response.details).toEqual({
      sources: [
        {
          url: "https://a1.example",
          title: "T https://a1.example",
          snippet: "S https://a1.example",
        },
        {
          url: "https://b1.example",
          title: "T https://b1.example",
          snippet: "S https://b1.example",
        },
      ],
      truncated: true,
    });
    for (const call of fetchImpl.mock.calls) {
      expect(bodyOf(call)).toMatchObject({
        count: 2,
        need_content: false,
        ori_question: "what is pi?",
      });
    }
  });

  it("enforces searchMaxQueries from the JSON config", async () => {
    const dir = tempDir();
    const { tools } = setup(dir, { apiKey: "k", searchMaxQueries: 2 });
    await expect(
      toolNamed(tools, "web_search").execute(
        "id",
        { queries: ["a", "b", "c"] },
        undefined,
        undefined,
        contextFor(dir),
      ),
    ).rejects.toThrow(/at most 2/u);
  });

  it("executes web_fetch with the harness result shape", async () => {
    const dir = tempDir();
    const { tools } = setup(dir, { apiKey: "k", fetchMaxOutputChars: 1_000 });
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ title: "Hi", content: "# Hi" }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const response = await toolNamed(tools, "web_fetch").execute(
      "id",
      { url: "https://example.com" },
      undefined,
      undefined,
      contextFor(dir),
    );

    expect(response.content[0]?.text).toContain("Fetched https://example.com/ (HTTP 200)");
    expect(response.content[0]?.text).toContain("# Hi");
    expect(response.details).toEqual({
      url: "https://example.com/",
      statusCode: 200,
      body: { kind: "text", content: "# Hi" },
      truncated: false,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.deepseek.com/v1/tools/fetch");
  });

  it("fails both tools without an API key", async () => {
    const dir = tempDir();
    const { tools } = setup(dir);
    await expect(
      toolNamed(tools, "web_search").execute(
        "id",
        { queries: ["pi"] },
        undefined,
        undefined,
        contextFor(dir),
      ),
    ).rejects.toThrow(/no API key/u);
    await expect(
      toolNamed(tools, "web_fetch").execute(
        "id",
        { url: "https://example.com" },
        undefined,
        undefined,
        contextFor(dir),
      ),
    ).rejects.toThrow(/no API key/u);
  });

  it("ignores an untrusted project config", () => {
    const dir = tempDir();
    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(
      join(dir, ".pi", CONFIG_FILE_NAME),
      JSON.stringify({ tools: { webTools: true }, web: { apiKey: "attacker" } }),
    );
    const { settings } = loadSettings({
      cwd: dir,
      agentDir: tempDir(),
      env: {},
      projectTrusted: false,
    });
    expect(settings.web.apiKey).toBeUndefined();
    expect(settings.tools.webTools).toBe(false);
  });
});

describe("applyWebToolActivation", () => {
  const fake = (initial: readonly string[]): { pi: ExtensionAPI; active: () => string[] } => {
    let active = [...initial];
    return {
      pi: {
        getActiveTools: () => [...active],
        setActiveTools: (names: string[]) => {
          active = [...names];
        },
      } as unknown as ExtensionAPI,
      active: () => [...active],
    };
  };

  const settings = (webTools: boolean): ToolkitSettings => ({
    ...loadSettings({ cwd: tempDir(), agentDir: tempDir(), env: {} }).settings,
    tools: { webTools, nestedSkills: false, sessionName: false, orchestrator: false },
  });

  it("adds both web tools when the switch is on", () => {
    const { pi, active } = fake(["read"]);
    applyWebToolActivation(pi, settings(true));
    expect(active()).toEqual(["read", "web_search", "web_fetch"]);
  });

  it("removes disabled web tools and leaves other tools alone", () => {
    const { pi, active } = fake(["read", "web_search", "web_fetch", "bash"]);
    applyWebToolActivation(pi, settings(false));
    expect(active()).toEqual(["read", "bash"]);
  });

  it("does not call setActiveTools when nothing changes", () => {
    const calls: string[][] = [];
    const pi = {
      getActiveTools: () => ["read", "web_search", "web_fetch"],
      setActiveTools: (names: string[]) => calls.push(names),
    } as unknown as ExtensionAPI;
    applyWebToolActivation(pi, settings(true));
    expect(calls).toEqual([]);
  });
});
