import { describe, expect, it, vi } from "vite-plus/test";
import { fetchPage, validateUrl } from "./fetch.ts";

const config = {
  baseURL: "https://api.example",
  fetchMaxContentChars: 1_000,
  timeoutMs: 1_000,
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("validateUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(validateUrl("https://example.com/a").hostname).toBe("example.com");
    expect(validateUrl("http://example.com").protocol).toBe("http:");
  });

  it("rejects empty, relative, non-http, credentialed, and over-long URLs", () => {
    expect(() => validateUrl("")).toThrow(/between 1 and 8192/u);
    expect(() => validateUrl("example.com")).toThrow(/absolute/u);
    expect(() => validateUrl("ftp://example.com")).toThrow(/only supports http/u);
    expect(() => validateUrl("https://user:pass@example.com")).toThrow(/username or password/u);
    expect(() => validateUrl(`https://example.com/${"a".repeat(8193)}`)).toThrow(
      /between 1 and 8192/u,
    );
  });
});

describe("fetchPage", () => {
  it("posts the URL and maps the title and Markdown content", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ title: "  Example  ", content: "# Hello" }),
    );
    const page = await fetchPage({
      url: "https://example.com",
      apiKey: "k",
      config,
      fetchImpl,
    });

    expect(page).toEqual({
      url: "https://example.com/",
      title: "Example",
      content: "# Hello",
      truncated: false,
    });
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe("https://api.example/v1/tools/fetch");
    const body = JSON.parse(typeof call?.[1]?.body === "string" ? call[1].body : "{}");
    expect(body).toEqual({ url: "https://example.com/" });
  });

  it("truncates content at the configured character cap", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ title: "T", content: "0123456789" }),
    );
    const page = await fetchPage({
      url: "https://example.com",
      apiKey: "k",
      config: { ...config, fetchMaxContentChars: 5 },
      fetchImpl,
    });
    expect(page.content).toBe("01234");
    expect(page.truncated).toBe(true);
  });

  it("omits a blank title and allows an empty body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ title: "   ", content: "" }));
    const page = await fetchPage({
      url: "https://example.com",
      apiKey: "k",
      config,
      fetchImpl,
    });
    expect(page).toEqual({ url: "https://example.com/", content: "", truncated: false });
  });

  it("rejects a response without string content", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ title: "T" }));
    await expect(
      fetchPage({ url: "https://example.com", apiKey: "k", config, fetchImpl }),
    ).rejects.toThrow(/no readable content/u);

    const nullResponse = vi.fn<typeof fetch>(async () => jsonResponse(null));
    await expect(
      fetchPage({ url: "https://example.com", apiKey: "k", config, fetchImpl: nullResponse }),
    ).rejects.toThrow(/no readable content/u);
  });

  it("surfaces the API error detail", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { message: "failed to fetch URL" } }, 404),
    );
    await expect(
      fetchPage({ url: "https://example.com", apiKey: "k", config, fetchImpl }),
    ).rejects.toThrow(/HTTP 404.*failed to fetch URL/u);
  });
});
