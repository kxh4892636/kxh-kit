import { describe, expect, it } from "vitest";
import { classifyContentType, fetchPage, validateUrl } from "./fetch.ts";

const limits = { maxResponseBytes: 1_000, maxBodyChars: 1_000, timeoutMs: 1_000 };

describe("validateUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(validateUrl("https://example.com/a").hostname).toBe("example.com");
    expect(validateUrl("http://example.com").protocol).toBe("http:");
  });

  it("rejects relative and non-http URLs", () => {
    expect(() => validateUrl("example.com")).toThrow(/absolute/u);
    expect(() => validateUrl("ftp://example.com")).toThrow(/only supports http/u);
  });
});

describe("classifyContentType", () => {
  it("maps supported types", () => {
    expect(classifyContentType("text/html; charset=utf-8")).toBe("html");
    expect(classifyContentType("application/xhtml+xml")).toBe("html");
    expect(classifyContentType("text/plain")).toBe("text");
    expect(classifyContentType("application/json")).toBe("text");
    expect(classifyContentType("application/ld+json")).toBe("text");
    expect(classifyContentType(null)).toBe("text");
    expect(classifyContentType("image/png")).toBeUndefined();
  });
});

describe("fetchPage", () => {
  const htmlResponse = () =>
    new Response(
      '<html><body><h1>Title</h1><p>Hello <a href="https://x.example">link</a></p><script>bad()</script></body></html>',
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  it("converts HTML to markdown and drops scripts", async () => {
    const page = await fetchPage({
      url: "https://example.com",
      config: limits,
      fetchImpl: (async () => htmlResponse()) as unknown as typeof fetch,
    });
    expect(page.kind).toBe("html");
    expect(page.statusCode).toBe(200);
    expect(page.truncated).toBe(false);
    expect(page.content).toContain("# Title");
    expect(page.content).toContain("[link](https://x.example)");
    expect(page.content).not.toContain("bad()");
  });

  it("passes plain text through", async () => {
    const page = await fetchPage({
      url: "https://example.com",
      config: limits,
      fetchImpl: (async () =>
        new Response("plain body", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })) as unknown as typeof fetch,
    });
    expect(page.content).toBe("plain body");
  });

  it("rejects unsupported content types", async () => {
    await expect(
      fetchPage({
        url: "https://example.com/a.png",
        config: limits,
        fetchImpl: (async () =>
          new Response("x", {
            status: 200,
            headers: { "content-type": "image/png" },
          })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/does not support content type/u);
  });

  it("rejects a declared body over the byte cap", async () => {
    await expect(
      fetchPage({
        url: "https://example.com",
        config: { ...limits, maxResponseBytes: 4 },
        fetchImpl: (async () =>
          new Response("0123456789", {
            status: 200,
            headers: { "content-type": "text/plain", "content-length": "10" },
          })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/exceeds the maximum/u);
  });

  it("truncates decoded bodies over the character cap", async () => {
    const page = await fetchPage({
      url: "https://example.com",
      config: { ...limits, maxBodyChars: 5 },
      fetchImpl: (async () =>
        new Response("0123456789", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })) as unknown as typeof fetch,
    });
    expect(page.content).toBe("01234");
    expect(page.truncated).toBe(true);
  });

  it("converts lists and code blocks", async () => {
    const html = "<ul><li>one</li><li>two</li></ul><pre><code>const a = 1;</code></pre>";
    const page = await fetchPage({
      url: "https://example.com",
      config: limits,
      fetchImpl: (async () =>
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
    });
    expect(page.content).toMatch(/- +one/u);
    expect(page.content).toContain("```");
  });

  it("passes application/json through unchanged", async () => {
    const page = await fetchPage({
      url: "https://example.com",
      config: limits,
      fetchImpl: (async () =>
        new Response('{"a":1}', {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    expect(page.content).toBe('{"a":1}');
  });

  it("truncates a streamed body past the byte cap", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("0123456789"));
        controller.close();
      },
    });
    const page = await fetchPage({
      url: "https://example.com",
      config: { ...limits, maxResponseBytes: 4 },
      fetchImpl: (async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/plain" },
        })) as unknown as typeof fetch,
    });
    expect(page.content).toBe("0123");
    expect(page.truncated).toBe(true);
  });

  it("reports a timeout or abort", async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
      throw new Error("unreachable");
    }) as unknown as typeof fetch;
    await expect(
      fetchPage({ url: "https://example.com", config: { ...limits, timeoutMs: 5 }, fetchImpl }),
    ).rejects.toThrow(/timed out/u);
  });

  it("reports a network failure with the URL", async () => {
    await expect(
      fetchPage({
        url: "https://example.com",
        config: limits,
        fetchImpl: (async () => {
          throw new Error("ENOTFOUND");
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/ENOTFOUND/u);
  });
});
