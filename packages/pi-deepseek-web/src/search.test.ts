import { describe, expect, it, vi } from "vitest";
import {
  type AnthropicResponse,
  citationSnippets,
  deepSeekSearch,
  mapAnthropicResponse,
} from "./search.ts";

const response: AnthropicResponse = {
  content: [
    {
      type: "text",
      text: "Here is a summary.",
      citations: [
        { url: "https://a.example", cited_text: "alpha snippet" },
        { url: "https://b.example", cited_text: "beta snippet" },
      ],
    },
    {
      type: "web_search_tool_result",
      content: [
        { url: "https://a.example", title: "A", page_age: "2026-01-01" },
        { url: "https://b.example", title: "B" },
        { url: "https://a.example", title: "A duplicate" },
      ],
    },
  ],
};

describe("citationSnippets", () => {
  it("keys cited text by URL and keeps the first occurrence", () => {
    const snippets = citationSnippets([
      { type: "text", citations: [{ url: "https://x", cited_text: "first" }] },
      { type: "text", citations: [{ url: "https://x", cited_text: "second" }] },
      { type: "text", citations: [{ url: null, cited_text: "ignored" }] },
    ]);
    expect(snippets.get("https://x")).toBe("first");
    expect(snippets.size).toBe(1);
  });
});

describe("mapAnthropicResponse", () => {
  it("dedupes by URL, joins snippets, and keeps the answer", () => {
    const result = mapAnthropicResponse(response);
    expect(result.truncated).toBe(false);
    expect(result.answer).toBe("Here is a summary.");
    expect(result.sources).toEqual([
      {
        url: "https://a.example",
        title: "A",
        snippet: "alpha snippet",
        publishedAt: "2026-01-01",
      },
      { url: "https://b.example", title: "B", snippet: "beta snippet" },
    ]);
  });

  it("throws when no native search result block is present", () => {
    expect(() => mapAnthropicResponse({ content: [{ type: "text", text: "no results" }] })).toThrow(
      /web_search_tool_result/u,
    );
  });
});

describe("deepSeekSearch", () => {
  const config = {
    baseURL: "https://api.example/anthropic/v1/",
    model: "deepseek-v4-flash",
    apiVersion: "2023-06-01",
    maxTokens: 1024,
    maxUses: 3,
  };

  it("posts the native web_search tool and maps the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const result = await deepSeekSearch({ query: "pi", apiKey: "k", config, fetchImpl });

    expect(result.sources).toHaveLength(2);
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe("https://api.example/anthropic/v1/messages");
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const rawBody = call?.[1]?.body;
    const body = JSON.parse(typeof rawBody === "string" ? rawBody : "{}");
    expect(body.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]);
    expect(body.messages[0].content[0].text).toContain("pi");
  });

  it("surfaces the API error detail on a non-2xx response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { message: "bad key" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(deepSeekSearch({ query: "pi", apiKey: "k", config, fetchImpl })).rejects.toThrow(
      /HTTP 401\): bad key/u,
    );
  });

  it("reports a network failure with the endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(deepSeekSearch({ query: "pi", apiKey: "k", config, fetchImpl })).rejects.toThrow(
      /ECONNREFUSED/u,
    );
  });
});
