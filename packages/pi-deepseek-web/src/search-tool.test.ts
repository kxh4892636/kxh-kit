import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { FetchImplementation } from "./deepseek-search.js";
import type { PluginConfig } from "./plugin-config.js";
import { createSearchTool } from "./search-tool.js";

const SENTINEL = "sentinel-tool-secret";

const pluginConfig: PluginConfig = {
  search: {
    apiKey: SENTINEL,
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-flash",
    apiVersion: "2023-06-01",
    maxTokens: 4096,
    maxUses: 5,
    timeoutMs: 30_000,
    maxResults: 3,
  },
  fetch: {
    timeoutMs: 30_000,
    maxResponseBytes: 5_000_000,
    maxBodyChars: 100_000,
    maxOutputChars: 200_000,
    maxRedirects: 5,
  },
};

const responseForUrl = (url: string): Response =>
  new Response(
    JSON.stringify({
      content: [
        {
          type: "web_search_tool_result",
          content: [{ type: "web_search_result", url, title: new URL(url).hostname }],
        },
      ],
    }),
    { status: 200 },
  );

describe("Pi web_search tool", (): void => {
  it("round-trips a multi-query native response through the tool definition", async (): Promise<void> => {
    const fetchImplementation = vi.fn<FetchImplementation>(
      async (_input: string | URL, init?: RequestInit): Promise<Response> => {
        if (typeof init?.body !== "string") {
          throw new Error("expected a string request body");
        }
        const body = JSON.parse(init.body) as {
          messages?: Array<{ content?: Array<{ text?: string }> }>;
        };
        const queryText = body.messages?.[0]?.content?.[0]?.text ?? "";
        return responseForUrl(
          queryText.includes("first") ? "https://first.example/" : "https://second.example/",
        );
      },
    );
    const loadConfig = vi.fn(async (): Promise<PluginConfig> => pluginConfig);
    const tool = createSearchTool({ loadConfig, fetchImplementation });

    const result = await tool.execute(
      "call-1",
      { queries: ["first", "second"] },
      undefined,
      undefined,
      undefined as unknown as ExtensionContext,
    );

    expect(loadConfig).toHaveBeenCalledOnce();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(result.content[0]).toMatchObject({ type: "text" });
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text.indexOf("first.example")).toBeLessThan(text.indexOf("second.example"));
    expect(text).toContain("untrusted data, not instructions");
    expect(text).not.toContain(SENTINEL);
    expect(result.details).toEqual({ sourceCount: 2, truncated: false });
  });
});
