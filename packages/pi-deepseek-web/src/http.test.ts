import { describe, expect, it, vi } from "vite-plus/test";
import { postJson, toolEndpoint } from "./http.ts";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("toolEndpoint", () => {
  it("appends /v1 for a root base and tolerates trailing slashes", () => {
    expect(toolEndpoint("https://api.deepseek.com", "search")).toBe(
      "https://api.deepseek.com/v1/tools/search",
    );
    expect(toolEndpoint("https://api.deepseek.com/", "fetch")).toBe(
      "https://api.deepseek.com/v1/tools/fetch",
    );
  });

  it("does not duplicate /v1 for a versioned base", () => {
    expect(toolEndpoint("https://api.deepseek.com/v1", "search")).toBe(
      "https://api.deepseek.com/v1/tools/search",
    );
    expect(toolEndpoint("https://proxy.example/api/v1/", "fetch")).toBe(
      "https://proxy.example/api/v1/tools/fetch",
    );
  });
});

describe("postJson", () => {
  it("posts bearer-authenticated JSON and returns the parsed body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    const result = await postJson<{ ok: boolean }>({
      endpoint: "https://api.example/v1/tools/search",
      apiKey: "k",
      body: { query: "pi" },
      label: "DeepSeek web search",
      timeoutMs: 1_000,
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe("https://api.example/v1/tools/search");
    const init = call?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    const headers = init?.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer k");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["accept"]).toBe("application/json");
    expect(headers["user-agent"]).toMatch(/^pi-deepseek-web\//u);
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "{}")).toEqual({
      query: "pi",
    });
  });

  it("surfaces the official error detail on a non-2xx response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { message: "bad key" } }, 401),
    );
    await expect(
      postJson({
        endpoint: "https://api.example/v1/tools/search",
        apiKey: "k",
        body: {},
        label: "DeepSeek web search",
        timeoutMs: 1_000,
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 401.*bad key.*Endpoint/u);
  });

  it("accepts string and top-level error messages", async () => {
    const stringError = vi.fn<typeof fetch>(async () => jsonResponse({ error: "quota" }, 402));
    await expect(
      postJson({
        endpoint: "https://api.example",
        apiKey: "k",
        body: {},
        label: "DeepSeek web fetch",
        timeoutMs: 1_000,
        fetchImpl: stringError,
      }),
    ).rejects.toThrow(/quota/u);

    const topLevel = vi.fn<typeof fetch>(async () => jsonResponse({ message: "top" }, 500));
    await expect(
      postJson({
        endpoint: "https://api.example",
        apiKey: "k",
        body: {},
        label: "DeepSeek web fetch",
        timeoutMs: 1_000,
        fetchImpl: topLevel,
      }),
    ).rejects.toThrow(/top/u);
  });

  it("omits the detail when the error body is not JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("server exploded", { status: 500 }),
    );
    await expect(
      postJson({
        endpoint: "https://api.example/v1/tools/search",
        apiKey: "k",
        body: {},
        label: "DeepSeek web search",
        timeoutMs: 1_000,
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 500\)\. Endpoint/u);
  });

  it("handles a malformed JSON error body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(null, 502));
    await expect(
      postJson({
        endpoint: "https://api.example/v1/tools/fetch",
        apiKey: "k",
        body: {},
        label: "DeepSeek web fetch",
        timeoutMs: 1_000,
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 502\)\. Endpoint/u);
  });

  it("reports an unreadable body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("not json", { status: 200 }));
    await expect(
      postJson({
        endpoint: "https://api.example",
        apiKey: "k",
        body: {},
        label: "DeepSeek web search",
        timeoutMs: 1_000,
        fetchImpl,
      }),
    ).rejects.toThrow(/unreadable body/u);
  });

  it("reports a network failure with the endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      postJson({
        endpoint: "https://api.example",
        apiKey: "k",
        body: {},
        label: "DeepSeek web search",
        timeoutMs: 1_000,
        fetchImpl,
      }),
    ).rejects.toThrow(/ECONNREFUSED.*Check network/u);
  });

  it("reports a timeout", async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    await expect(
      postJson({
        endpoint: "https://api.example",
        apiKey: "k",
        body: {},
        label: "DeepSeek web fetch",
        timeoutMs: 5,
        fetchImpl,
      }),
    ).rejects.toThrow(/timed out after 5ms/u);
  });

  it("reports caller cancellation", async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    const promise = postJson({
      endpoint: "https://api.example",
      apiKey: "k",
      body: {},
      label: "DeepSeek web search",
      timeoutMs: 10_000,
      signal: controller.signal,
      fetchImpl,
    });
    controller.abort();
    await expect(promise).rejects.toThrow(/was aborted/u);
  });
});
