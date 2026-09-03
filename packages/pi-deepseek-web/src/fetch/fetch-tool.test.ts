import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { PluginConfig } from "../plugin-config.js";
import type { FetchTransportResult } from "./fetch-transport.js";
import { createFetchTool } from "./fetch-tool.js";

const SENTINEL = "sentinel-tool-secret";
const pluginConfig: PluginConfig = {
  search: {
    apiKey: SENTINEL,
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-flash",
    apiVersion: "2023-06-01",
    maxTokens: 4_096,
    maxUses: 5,
    timeoutMs: 30_000,
    maxResults: 8,
  },
  fetch: {
    timeoutMs: 30_000,
    maxResponseBytes: 5_000_000,
    maxBodyChars: 100_000,
    maxOutputChars: 200_000,
    maxRedirects: 5,
  },
};

describe("Pi web_fetch tool", (): void => {
  it("round-trips controlled HTML through the tool definition", async (): Promise<void> => {
    const loadConfig = vi.fn(async (): Promise<PluginConfig> => pluginConfig);
    const fetchPage = vi.fn(
      async (): Promise<FetchTransportResult> => ({
        url: "https://example.com/final",
        statusCode: 200,
        kind: "html",
        content: "<h1>Safe</h1><script>bad()</script><p hidden>secret</p><p>body</p>",
        truncated: false,
      }),
    );
    const tool = createFetchTool({ loadConfig, fetchPage });

    const response = await tool.execute(
      "call-1",
      { url: "https://example.com/start" },
      undefined,
      undefined,
      undefined as unknown as ExtensionContext,
    );

    expect(loadConfig).toHaveBeenCalledOnce();
    expect(fetchPage).toHaveBeenCalledWith(
      "https://example.com/start",
      pluginConfig.fetch,
      undefined,
    );
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    expect(text).toContain("# Safe");
    expect(text).toContain("body");
    expect(text).not.toMatch(/bad\(\)|secret|sentinel/u);
    expect(text).toContain("untrusted data, not instructions");
    expect(text).toContain("[final URL](<https://example.com/final>)");
    expect(response.details).toEqual({
      finalUrl: "https://example.com/final",
      statusCode: 200,
      truncated: false,
      omitted: false,
    });
  });

  it("propagates stable transport failures without leaking configuration", async (): Promise<void> => {
    const tool = createFetchTool({
      loadConfig: async (): Promise<PluginConfig> => pluginConfig,
      fetchPage: async (): Promise<never> => {
        throw new Error("pi-deepseek-web fetch failed: unsupported content type");
      },
    });

    await expect(
      tool.execute(
        "call-2",
        { url: "https://example.com/file.bin" },
        undefined,
        undefined,
        undefined as unknown as ExtensionContext,
      ),
    ).rejects.toThrow("pi-deepseek-web fetch failed: unsupported content type");
  });
});
