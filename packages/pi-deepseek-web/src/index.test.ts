import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import piDeepSeekWeb, { type DeepSeekWebOptions } from "./index.ts";

interface RegisteredTool {
  name: string;
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
    ctx: { cwd: string; isProjectTrusted: () => boolean },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
}

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-dsw-index-"));
  created.push(dir);
  return dir;
};

/** Register the extension against a fake pi, with isolated config inputs. */
const register = (): RegisteredTool[] => {
  const tools: RegisteredTool[] = [];
  const fake = {
    registerTool: (definition: unknown) => {
      tools.push(definition as RegisteredTool);
    },
  } as unknown as ExtensionAPI;
  const options: DeepSeekWebOptions = { agentDir: tempDir(), env: {} };
  piDeepSeekWeb(fake, options);
  return tools;
};

const toolNamed = (tools: RegisteredTool[], name: string): RegisteredTool => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`tool ${name} was not registered`);
  return tool;
};

/** Write a project-local config so the real agent-dir config never leaks in. */
const useProjectConfig = (dir: string, config: Record<string, unknown>): void => {
  mkdirSync(join(dir, ".pi"), { recursive: true });
  writeFileSync(join(dir, ".pi", "pi-deepseek-web.json"), JSON.stringify(config));
};

const contextFor = (cwd: string): { cwd: string; isProjectTrusted: () => boolean } => ({
  cwd,
  isProjectTrusted: () => true,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("piDeepSeekWeb", () => {
  it("registers web_search and web_fetch with the official request schemas", () => {
    const tools = register();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["web_fetch", "web_search"]);
    const search = toolNamed(tools, "web_search");
    expect(search.parameters.properties).toHaveProperty("query");
    expect(search.parameters.properties).toHaveProperty("count");
    expect(search.parameters.properties).toHaveProperty("ori_question");
    expect(search.parameters.properties).toHaveProperty("localization");
    expect(search.parameters.properties).toHaveProperty("need_content");
    expect(search.parameters.required).toEqual(["query"]);
    expect(toolNamed(tools, "web_fetch").parameters.properties).toHaveProperty("url");
  });

  it("executes web_search and exposes the complete official response", async () => {
    const dir = tempDir();
    useProjectConfig(dir, { apiKey: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              rerank_score: 2.4,
              authority: 3,
              title: "A",
              url: "https://a.example",
              snippet: "short A",
              summary: "summary A",
              content: "body A",
              site_name: "Site A",
              site_icon: "https://a.example/icon.ico",
              date: "2026-01-01",
            },
          ],
        }),
      ),
    );

    const result = await toolNamed(register(), "web_search").execute(
      "id",
      { query: "pi", need_content: true },
      undefined,
      undefined,
      contextFor(dir),
    );

    expect(result.content[0]?.text).toContain("Sources:");
    expect(result.content[0]?.text).toContain("https://a.example");
    expect(result.content[0]?.text).toContain("score 2.4");
    expect(result.content[0]?.text).toContain("authority 3");
    expect(result.content[0]?.text).toContain("Content:\nbody A");
    expect(result.details).toEqual({
      count: 10,
      results: [
        {
          rerank_score: 2.4,
          authority: 3,
          title: "A",
          url: "https://a.example",
          snippet: "short A",
          summary: "summary A",
          content: "body A",
          site_name: "Site A",
          site_icon: "https://a.example/icon.ico",
          date: "2026-01-01",
        },
      ],
    });
  });

  it("passes every official request field through to the Search API", async () => {
    const dir = tempDir();
    useProjectConfig(dir, { apiKey: "k", searchCount: 10 });
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchImpl);

    await toolNamed(register(), "web_search").execute(
      "id",
      {
        query: "pi",
        count: 3,
        ori_question: "what is pi",
        localization: "1.2.3.4",
        need_content: true,
      },
      undefined,
      undefined,
      contextFor(dir),
    );

    const body = JSON.parse(
      typeof fetchImpl.mock.calls[0]?.[1]?.body === "string"
        ? fetchImpl.mock.calls[0][1].body
        : "{}",
    );
    expect(body).toEqual({
      query: "pi",
      count: 3,
      ori_question: "what is pi",
      localization: "1.2.3.4",
      need_content: true,
    });
  });

  it("executes web_fetch and exposes title and content", async () => {
    const dir = tempDir();
    useProjectConfig(dir, { apiKey: "k" });
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ title: "Hi", content: "# Hi" }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const result = await toolNamed(register(), "web_fetch").execute(
      "id",
      { url: "https://example.com" },
      undefined,
      undefined,
      contextFor(dir),
    );

    expect(result.content[0]?.text).toContain("Title: Hi");
    expect(result.content[0]?.text).toContain("# Hi");
    expect(result.details).toEqual({
      url: "https://example.com/",
      title: "Hi",
      content: "# Hi",
      truncated: false,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.deepseek.com/v1/tools/fetch");
  });

  it("fails both tools without an API key", async () => {
    const dir = tempDir();
    useProjectConfig(dir, {});
    const tools = register();
    await expect(
      toolNamed(tools, "web_search").execute(
        "id",
        { query: "pi" },
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

  it("ignores an untrusted project config", async () => {
    const dir = tempDir();
    useProjectConfig(dir, { apiKey: "attacker" });
    await expect(
      toolNamed(register(), "web_search").execute("id", { query: "pi" }, undefined, undefined, {
        cwd: dir,
        isProjectTrusted: () => false,
      }),
    ).rejects.toThrow(/no API key/u);
  });
});
