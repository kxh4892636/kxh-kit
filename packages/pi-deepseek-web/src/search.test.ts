import { describe, expect, it, vi } from "vite-plus/test";
import { deepSeekSearch, mapSearchResponse, type SearchApiResponse } from "./search.ts";

const response: SearchApiResponse = {
  results: [
    {
      rerank_score: 2.4,
      title: "A",
      url: "https://a.example",
      snippet: "short A",
      summary: "long A",
      content: "body A",
      site_name: "Site A",
      site_icon: "https://a.example/icon.ico",
      date: "2026-01-01",
      authority: 3,
    },
    { title: "B", url: "https://b.example", snippet: "short B", site_name: null, date: null },
    { title: "A duplicate", url: "https://a.example", summary: "duplicate" },
    { title: "Empty URL", url: "   " },
  ],
};

const config = {
  baseURL: "https://api.example",
  searchCount: 10,
  timeoutMs: 1_000,
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("mapSearchResponse", () => {
  it("dedupes by URL and preserves every documented field", () => {
    expect(mapSearchResponse(response)).toEqual([
      {
        rerank_score: 2.4,
        title: "A",
        url: "https://a.example",
        snippet: "short A",
        summary: "long A",
        content: "body A",
        site_name: "Site A",
        site_icon: "https://a.example/icon.ico",
        date: "2026-01-01",
        authority: 3,
      },
      { title: "B", url: "https://b.example", snippet: "short B", site_name: null, date: null },
    ]);
  });

  it("accepts an empty result list", () => {
    expect(mapSearchResponse({ results: [] })).toEqual([]);
  });

  it("throws when the results list is missing", () => {
    expect(() => mapSearchResponse({})).toThrow(/unreadable results list/u);
    expect(() => mapSearchResponse({ results: null } as unknown as SearchApiResponse)).toThrow(
      /unreadable results list/u,
    );
    expect(() => mapSearchResponse(null)).toThrow(/unreadable results list/u);
  });

  it("preserves the unknown authority sentinel and rejects out-of-range authority", () => {
    expect(
      mapSearchResponse({
        results: [
          { url: "https://d.example", authority: -1, rerank_score: 0 },
          { url: "https://e.example", authority: 5, rerank_score: 3.1 },
        ],
      }),
    ).toEqual([
      { url: "https://d.example", authority: -1, rerank_score: 0 },
      { url: "https://e.example", rerank_score: 3.1 },
    ]);
  });

  it("skips malformed items and trims strings", () => {
    const malformed = {
      results: [
        null,
        {
          url: "  https://c.example  ",
          title: "  C  ",
          summary: "   ",
          date: null,
          site_name: null,
          authority: Number.NaN,
          rerank_score: Number.POSITIVE_INFINITY,
        },
      ],
    } as unknown as SearchApiResponse;
    expect(mapSearchResponse(malformed)).toEqual([
      { url: "https://c.example", title: "C", site_name: null, date: null },
    ]);
  });
});

describe("deepSeekSearch", () => {
  it("sends the complete official request body and maps the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(response));
    const result = await deepSeekSearch({
      query: " pi ",
      count: 3,
      ori_question: " what is pi ",
      localization: " 1.2.3.4 ",
      need_content: true,
      apiKey: "k",
      config,
      fetchImpl,
    });

    expect(result.count).toBe(3);
    expect(result.results).toHaveLength(2);
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe("https://api.example/v1/tools/search");
    const body = JSON.parse(typeof call?.[1]?.body === "string" ? call[1].body : "{}");
    expect(body).toEqual({
      query: "pi",
      count: 3,
      ori_question: "what is pi",
      localization: "1.2.3.4",
      need_content: true,
    });
  });

  it("omits optional fields and uses the configured count by default", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [] }));
    const result = await deepSeekSearch({ query: "pi", apiKey: "k", config, fetchImpl });

    expect(result).toEqual({ count: 10, results: [] });
    const body = JSON.parse(
      typeof fetchImpl.mock.calls[0]?.[1]?.body === "string"
        ? fetchImpl.mock.calls[0][1].body
        : "{}",
    );
    expect(body).toEqual({ query: "pi", count: 10 });
  });

  it("rejects invalid query, ori_question, count, and need_content before dispatching", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [] }));
    const base = { apiKey: "k", config, fetchImpl };

    await expect(deepSeekSearch({ ...base, query: "   " })).rejects.toThrow(/query/u);
    await expect(deepSeekSearch({ ...base, query: "a".repeat(129) })).rejects.toThrow(/query/u);
    await expect(deepSeekSearch({ ...base, query: "pi", ori_question: " " })).rejects.toThrow(
      /ori_question/u,
    );
    await expect(
      deepSeekSearch({ ...base, query: "pi", ori_question: "a".repeat(129) }),
    ).rejects.toThrow(/ori_question/u);
    for (const count of [0, 51, 1.5]) {
      await expect(deepSeekSearch({ ...base, query: "pi", count })).rejects.toThrow(
        /between 1 and 50/u,
      );
    }
    await expect(
      deepSeekSearch({
        ...base,
        query: "pi",
        need_content: "yes" as unknown as boolean,
      }),
    ).rejects.toThrow(/need_content must be a boolean/u);
    expect(fetchImpl).not.toHaveBeenCalled();
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
