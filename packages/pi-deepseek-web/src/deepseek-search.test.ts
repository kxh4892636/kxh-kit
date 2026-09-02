import { describe, expect, it, vi } from "vitest";

import {
  mapDeepSeekSearchResponse,
  searchDeepSeek,
  type FetchImplementation,
} from "./deepseek-search.js";
import type { SearchConfig } from "./plugin-config.js";

const SENTINEL = "sentinel-search-secret";

const searchConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  apiKey: SENTINEL,
  apiKeyEnv: "DEEPSEEK_API_KEY",
  baseURL: "https://api.deepseek.com/anthropic",
  model: "deepseek-v4-flash",
  apiVersion: "2023-06-01",
  maxTokens: 4096,
  maxUses: 5,
  timeoutMs: 30_000,
  maxResults: 8,
  ...overrides,
});

const nativePayload = (): JsonValue => ({
  content: [
    {
      type: "web_search_tool_result",
      content: [
        {
          type: "web_search_result",
          url: "https://example.com/a",
          title: "Alpha",
          page_age: "today",
        },
        { type: "web_search_result", url: "https://example.com/a", title: "Duplicate" },
      ],
    },
    {
      type: "text",
      text: "provider prose must be ignored",
      citations: [{ url: "https://example.com/a", cited_text: "Citation excerpt" }],
    },
  ],
});

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

describe("DeepSeek native response mapping", (): void => {
  it("maps native blocks, joins citations, deduplicates URLs, and ignores prose", (): void => {
    expect(mapDeepSeekSearchResponse(nativePayload())).toEqual([
      {
        url: "https://example.com/a",
        title: "Alpha",
        snippet: "Citation excerpt",
        publishedAt: "today",
      },
    ]);
  });

  it.each([
    [{ content: [{ type: "text", text: "prose only" }] }, "missing web_search_tool_result"],
    [{ content: [{ type: "web_search_tool_result" }] }, "malformed native result block"],
    [
      {
        content: [
          { type: "web_search_tool_result", content: [{ type: "web_search_result", url: 7 }] },
        ],
      },
      "malformed native result URL",
    ],
  ])(
    "fails closed for malformed structured response %#",
    (payload: unknown, message: string): void => {
      expect((): unknown => mapDeepSeekSearchResponse(payload)).toThrow(message);
    },
  );
});

describe("DeepSeek request boundary", (): void => {
  it("posts the Anthropic request with x-api-key and no bearer credential", async (): Promise<void> => {
    const fetchImplementation = vi.fn<FetchImplementation>(
      async (): Promise<Response> => new Response(JSON.stringify(nativePayload()), { status: 200 }),
    );

    await searchDeepSeek("current news", searchConfig(), undefined, fetchImplementation);

    const [endpoint, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(endpoint).toBe("https://api.deepseek.com/anthropic/v1/messages");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toMatchObject({
      "x-api-key": SENTINEL,
      "anthropic-version": "2023-06-01",
    });
    expect(JSON.stringify(init?.headers).toLowerCase()).not.toContain("authorization");
    if (typeof init?.body !== "string") {
      throw new Error("expected a string request body");
    }
    expect(JSON.parse(init.body) as unknown).toMatchObject({
      model: "deepseek-v4-flash",
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    });
  });

  it("does not read or expose a non-success response body", async (): Promise<void> => {
    const response = new Response(SENTINEL, { status: 429 });
    const text = vi.spyOn(response, "text");
    const fetchImplementation: FetchImplementation = async (): Promise<Response> => response;

    await expect(
      searchDeepSeek("query", searchConfig(), undefined, fetchImplementation),
    ).rejects.toThrow("HTTP 429");
    expect(text).not.toHaveBeenCalled();
  });

  it("redacts network failures", async (): Promise<void> => {
    const fetchImplementation: FetchImplementation = async (): Promise<Response> =>
      Promise.reject(new Error(SENTINEL));

    await expect(
      searchDeepSeek("query", searchConfig(), undefined, fetchImplementation),
    ).rejects.not.toThrow(SENTINEL);
  });

  it("removes a credential echoed by a successful provider response", async (): Promise<void> => {
    const payload = nativePayload();
    const text = JSON.stringify(payload).replace("Citation excerpt", `echo ${SENTINEL}`);
    const fetchImplementation: FetchImplementation = async (): Promise<Response> =>
      new Response(text, { status: 200 });

    const sources = await searchDeepSeek("query", searchConfig(), undefined, fetchImplementation);

    expect(JSON.stringify(sources)).not.toContain(SENTINEL);
    expect(sources[0]?.snippet).toContain("[redacted]");
  });

  it("cancels streaming response consumption at the byte limit", async (): Promise<void> => {
    const fetchImplementation: FetchImplementation = async (): Promise<Response> =>
      new Response(new Uint8Array(5_000_001), { status: 200 });

    await expect(
      searchDeepSeek("query", searchConfig(), undefined, fetchImplementation),
    ).rejects.toThrow("response body too large");
  });
});

describe("DeepSeek cancellation", (): void => {
  it("classifies caller abort without exposing its reason", async (): Promise<void> => {
    const controller = new AbortController();
    controller.abort(SENTINEL);
    const fetchImplementation: FetchImplementation = async (): Promise<Response> =>
      new Response("{}", { status: 200 });

    await expect(
      searchDeepSeek("query", searchConfig(), controller.signal, fetchImplementation),
    ).rejects.toThrow("aborted");
  });

  it("classifies configured timeout", async (): Promise<void> => {
    const fetchImplementation: FetchImplementation = async (
      _input: string | URL,
      init?: RequestInit,
    ): Promise<Response> =>
      new Promise<Response>(
        (
          _resolve: (value: Response | PromiseLike<Response>) => void,
          reject: (reason?: unknown) => void,
        ): void => {
          init?.signal?.addEventListener(
            "abort",
            (): void => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        },
      );

    await expect(
      searchDeepSeek("query", searchConfig({ timeoutMs: 1 }), undefined, fetchImplementation),
    ).rejects.toThrow("timed out");
  });
});
