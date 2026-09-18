import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const contextFor = (cwd: string) => ({ cwd, isProjectTrusted: () => true });

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("piDeepSeekWeb", () => {
  it("registers web_search and web_fetch with string single-argument schemas", () => {
    const tools = register();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["web_fetch", "web_search"]);
    expect(toolNamed(tools, "web_search").parameters.properties).toHaveProperty("query");
    expect(toolNamed(tools, "web_fetch").parameters.properties).toHaveProperty("url");
  });

  it("executes web_search and formats the sources", async () => {
    const dir = tempDir();
    useProjectConfig(dir, { apiKey: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              content: [
                {
                  type: "web_search_tool_result",
                  content: [{ url: "https://a.example", title: "A" }],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const result = await toolNamed(register(), "web_search").execute(
      "id",
      { query: "pi" },
      undefined,
      undefined,
      contextFor(dir),
    );
    expect(result.content[0]?.text).toContain("Sources:");
    expect(result.content[0]?.text).toContain("https://a.example");
  });

  it("executes web_fetch and converts HTML", async () => {
    const dir = tempDir();
    useProjectConfig(dir, {});
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<h1>Hi</h1>", { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );
    const result = await toolNamed(register(), "web_fetch").execute(
      "id",
      { url: "https://example.com" },
      undefined,
      undefined,
      contextFor(dir),
    );
    expect(result.content[0]?.text).toContain("# Hi");
    expect(result.details).toEqual({
      url: "https://example.com/",
      statusCode: 200,
      contentType: "text/html",
      truncated: false,
    });
  });

  it("fails web_search without an API key", async () => {
    const dir = tempDir();
    useProjectConfig(dir, {});
    await expect(
      toolNamed(register(), "web_search").execute(
        "id",
        { query: "pi" },
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
