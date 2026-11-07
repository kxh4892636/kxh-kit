import { describe, expect, it, vi } from "vite-plus/test";
import {
  boundQuestion,
  boundSources,
  deepSeekSearch,
  mapSearchResponse,
  mergeSearchResults,
  parseSearchArgs,
  runSearchQueries,
} from "./search.ts";

const config = {
  baseURL: "https://api.example",
  searchCount: 10,
  searchMaxResults: 10,
  searchTimeoutMs: 1_000,
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Build a documented result entry; `date` is present as a string or null. */
const result = (url: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  url,
  title: `T ${url}`,
  snippet: `S ${url}`,
  date: null,
  ...extra,
});

const bodyOf = (call: unknown): Record<string, unknown> => {
  const init = (call as [string, RequestInit?])[1];
  return JSON.parse(typeof init?.body === "string" ? init.body : "{}");
};

describe("parseSearchArgs", () => {
  it("accepts non-empty queries and collapses exact duplicates", () => {
    expect(parseSearchArgs({ queries: ["a", "b", "a"] }, 4)).toEqual(["a", "b"]);
  });

  it("rejects empty, oversized, and blank query lists", () => {
    expect(() => parseSearchArgs({ queries: [] }, 4)).toThrow(/at least one/u);
    expect(() => parseSearchArgs({ queries: ["a", "b", "c"] }, 2)).toThrow(/at most 2/u);
    expect(() => parseSearchArgs({ queries: ["a", "  "] }, 4)).toThrow(/non-empty/u);
  });
});

describe("boundQuestion", () => {
  it("collapses whitespace and caps at 128 characters", () => {
    expect(boundQuestion("  what \n is\tpi?  ")).toBe("what is pi?");
    expect(boundQuestion(undefined)).toBeUndefined();
    expect(boundQuestion("   ")).toBeUndefined();
    expect(Array.from(boundQuestion("😀".repeat(200)) ?? "")).toHaveLength(128);
  });
});

describe("mapSearchResponse", () => {
  it("projects the portable source fields and drops ranking-only fields", () => {
    expect(
      mapSearchResponse({
        results: [
          result("https://a.example", {
            rerank_score: 2.4,
            summary: "long A",
            content: "body A",
            site_name: "Site A",
            site_icon: "https://a.example/icon.ico",
            authority: 3,
            date: "2026-01-01",
          }),
          result("https://b.example", { title: "", snippet: "", summary: undefined }),
        ],
      }),
    ).toEqual([
      {
        url: "https://a.example",
        title: "T https://a.example",
        snippet: "S https://a.example",
        summary: "long A",
        publishedAt: "2026-01-01",
      },
      { url: "https://b.example" },
    ]);
  });

  it("accepts an empty result list", () => {
    expect(mapSearchResponse({ results: [] })).toEqual([]);
  });

  it("rejects bodies and result items outside the documented shape", () => {
    for (const body of [null, {}, { results: null }]) {
      expect(() => mapSearchResponse(body)).toThrow(/unreadable results list/u);
    }
    // `title`, `snippet`, and `date` are required by the harness provider.
    expect(() => mapSearchResponse({ results: [{ url: "https://a.example" }] })).toThrow(
      /unreadable results list/u,
    );
    expect(() =>
      mapSearchResponse({ results: [result("https://a.example", { date: undefined })] }),
    ).toThrow(/unreadable results list/u);
    expect(() =>
      mapSearchResponse({ results: [result("https://a.example", { summary: 1 })] }),
    ).toThrow(/unreadable results list/u);
    expect(() => mapSearchResponse({ results: [result("")] })).toThrow(/unreadable results list/u);
  });
});

describe("deepSeekSearch", () => {
  it("sends the harness request body with deployment limits", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ results: [result("https://a.example")] }),
    );
    const search = await deepSeekSearch({
      query: "pi",
      oriQuestion: "what is pi",
      apiKey: "k",
      config: { ...config, searchCount: 3, searchMaxResults: 2 },
      fetchImpl,
    });

    expect(search.sources).toHaveLength(1);
    expect(search.truncated).toBe(false);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.example/v1/tools/search");
    expect(bodyOf(fetchImpl.mock.calls[0])).toEqual({
      query: "pi",
      count: 2,
      need_content: false,
      ori_question: "what is pi",
    });
  });

  it("omits ori_question when none is provided and caps sources", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        results: [result("https://a.example"), result("https://b.example")],
      }),
    );
    const search = await deepSeekSearch({
      query: "pi",
      apiKey: "k",
      config: { ...config, searchCount: 10, searchMaxResults: 1 },
      fetchImpl,
    });

    expect(bodyOf(fetchImpl.mock.calls[0])).toEqual({
      query: "pi",
      count: 1,
      need_content: false,
    });
    expect(search.sources).toHaveLength(1);
    expect(search.truncated).toBe(true);
  });

  it("surfaces the API error detail", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { message: "bad key" } }, 401),
    );
    await expect(deepSeekSearch({ query: "pi", apiKey: "k", config, fetchImpl })).rejects.toThrow(
      /HTTP 401.*bad key/u,
    );
  });

  it("does not duplicate /v1 for a versioned base URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [] }));
    await deepSeekSearch({
      query: "pi",
      apiKey: "k",
      config: { ...config, baseURL: "https://api.example/v1" },
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.example/v1/tools/search");
  });
});

describe("runSearchQueries", () => {
  it("returns the provider result unchanged for a single query", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ results: [result("https://a.example")] }),
    );
    const search = await runSearchQueries({
      queries: ["only"],
      maxResults: 10,
      apiKey: "k",
      config,
      fetchImpl,
    });
    expect(search.sources.map((source) => source.url)).toEqual(["https://a.example"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("runs queries concurrently and merges round-robin with URL dedupe and a cap", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        query: string;
      };
      if (body.query === "a") {
        return jsonResponse({
          results: [result("a1"), result("a2"), result("a3")],
        });
      }
      return jsonResponse({
        results: [result("b1"), result("a2"), result("b3")],
      });
    });

    const search = await runSearchQueries({
      queries: ["a", "b"],
      maxResults: 4,
      apiKey: "k",
      config: { ...config, searchMaxResults: 4 },
      fetchImpl,
    });

    expect(search.sources.map((source) => source.url)).toEqual(["a1", "b1", "a2", "a3"]);
    expect(search.truncated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("aborts siblings and rethrows the first failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        query: string;
      };
      if (body.query === "bad") throw new Error("boom");
      return jsonResponse({ results: [result("ok")] });
    });

    await expect(
      runSearchQueries({
        queries: ["bad", "good"],
        maxResults: 10,
        apiKey: "k",
        config,
        fetchImpl,
      }),
    ).rejects.toThrow(/boom/u);
  });
});

describe("mergeSearchResults", () => {
  it("prefixes provider content with its query", () => {
    const merged = mergeSearchResults(
      ["a", "b"],
      [
        { content: "answer A", sources: [], truncated: false },
        { content: "answer B", sources: [], truncated: false },
      ],
      10,
    );
    expect(merged.content).toBe("### a\n\nanswer A\n\n### b\n\nanswer B");
  });
});

describe("boundSources", () => {
  it("collapses whitespace and caps summaries with an ellipsis", () => {
    const [bounded] = boundSources(
      [{ url: "https://a.example", summary: `  one\n two ${"x".repeat(20)}  ` }],
      10,
    );
    expect(bounded?.summary).toBe(`one two x…`);
    expect(Array.from(bounded?.summary ?? "")).toHaveLength(10);
  });

  it("leaves sources without a summary untouched", () => {
    const source = { url: "https://a.example", snippet: "short" };
    expect(boundSources([source], 10)).toEqual([source]);
  });
});
