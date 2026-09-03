import { describe, expect, it, vi } from "vitest";

import { fetchHttpPage } from "./fetch-transport.js";
import type { FetchConfig } from "../plugin-config.js";
import type { PinnedResponse, ResolvedAddress, FetchNetwork } from "./fetch-network.js";

const SENTINEL = "sentinel-search-credential";

const fetchConfig = (overrides: Partial<FetchConfig> = {}): FetchConfig => ({
  timeoutMs: 30_000,
  maxResponseBytes: 5_000_000,
  maxBodyChars: 100_000,
  maxOutputChars: 200_000,
  maxRedirects: 5,
  ...overrides,
});

const resolvedAddress = (address: string = "8.8.8.8"): ResolvedAddress => ({ address, family: 4 });

const pinnedResponse = (
  response: Response,
  close: () => Promise<void> = async (): Promise<void> => undefined,
): PinnedResponse => ({
  response,
  close,
});

describe("pinned anonymous fetch", (): void => {
  it("dials exactly the resolver-approved addresses with anonymous headers", async (): Promise<void> => {
    const approved = [resolvedAddress()];
    const request = vi.fn<FetchNetwork["request"]>(
      async (
        _url: URL,
        addresses: readonly ResolvedAddress[],
        headers: Readonly<Record<string, string>>,
      ): Promise<PinnedResponse> => {
        expect(addresses).toBe(approved);
        expect(JSON.stringify(headers)).not.toContain(SENTINEL);
        expect(headers).not.toHaveProperty("authorization");
        expect(headers).not.toHaveProperty("x-api-key");
        return pinnedResponse(new Response("hello", { headers: { "content-type": "text/plain" } }));
      },
    );
    const network: FetchNetwork = {
      resolve: async (): Promise<ResolvedAddress[]> => approved,
      request,
    };

    const result = await fetchHttpPage("https://example.com/", fetchConfig(), undefined, network);

    expect(result).toMatchObject({
      content: "hello",
      kind: "text",
      statusCode: 200,
      truncated: false,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("re-resolves and re-pins every same-origin redirect hop", async (): Promise<void> => {
    const addressSets = [[resolvedAddress("8.8.8.8")], [resolvedAddress("1.1.1.1")]];
    const dialed: ResolvedAddress[][] = [];
    let requestIndex = 0;
    const network: FetchNetwork = {
      resolve: async (): Promise<ResolvedAddress[]> => addressSets.shift() ?? [],
      request: async (
        _url: URL,
        addresses: readonly ResolvedAddress[],
      ): Promise<PinnedResponse> => {
        dialed.push([...addresses]);
        requestIndex += 1;
        return requestIndex === 1
          ? pinnedResponse(new Response(null, { status: 302, headers: { location: "/next" } }))
          : pinnedResponse(new Response("done", { headers: { "content-type": "text/plain" } }));
      },
    };

    const result = await fetchHttpPage(
      "https://example.com/start",
      fetchConfig(),
      undefined,
      network,
    );

    expect(result.url).toBe("https://example.com/next");
    expect(dialed).toEqual([[resolvedAddress("8.8.8.8")], [resolvedAddress("1.1.1.1")]]);
  });

  it("blocks a cross-origin redirect before resolving the target", async (): Promise<void> => {
    const resolve = vi.fn(async (): Promise<ResolvedAddress[]> => [resolvedAddress()]);
    const network: FetchNetwork = {
      resolve,
      request: async (): Promise<PinnedResponse> =>
        pinnedResponse(
          new Response(null, { status: 302, headers: { location: "https://other.example/" } }),
        ),
    };

    await expect(
      fetchHttpPage("https://example.com/", fetchConfig(), undefined, network),
    ).rejects.toThrow("redirect blocked");
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("enforces the redirect hop cap before resolving another target", async (): Promise<void> => {
    const resolve = vi.fn(async (): Promise<ResolvedAddress[]> => [resolvedAddress()]);
    const network: FetchNetwork = {
      resolve,
      request: async (): Promise<PinnedResponse> =>
        pinnedResponse(new Response(null, { status: 302, headers: { location: "/next" } })),
    };

    await expect(
      fetchHttpPage("https://example.com/", fetchConfig({ maxRedirects: 0 }), undefined, network),
    ).rejects.toThrow("redirect blocked");
    expect(resolve).toHaveBeenCalledOnce();
  });
});

describe("bounded response body", (): void => {
  const networkFor = (response: Response): FetchNetwork => ({
    resolve: async (): Promise<ResolvedAddress[]> => [resolvedAddress()],
    request: async (): Promise<PinnedResponse> => pinnedResponse(response),
  });

  it("truncates a streamed body at the byte cap", async (): Promise<void> => {
    const response = new Response("abcdef", { headers: { "content-type": "text/plain" } });
    const result = await fetchHttpPage(
      "https://example.com/",
      fetchConfig({ maxResponseBytes: 3 }),
      undefined,
      networkFor(response),
    );

    expect(result).toMatchObject({ content: "abc", truncated: true });
  });

  it("rejects a declared body larger than the byte cap", async (): Promise<void> => {
    const response = new Response("abcdef", {
      headers: { "content-length": "6", "content-type": "text/plain" },
    });

    await expect(
      fetchHttpPage(
        "https://example.com/",
        fetchConfig({ maxResponseBytes: 3 }),
        undefined,
        networkFor(response),
      ),
    ).rejects.toThrow("response body too large");
  });

  it("applies the decoded character cap", async (): Promise<void> => {
    const response = new Response("abcdef", { headers: { "content-type": "text/plain" } });
    const result = await fetchHttpPage(
      "https://example.com/",
      fetchConfig({ maxBodyChars: 3 }),
      undefined,
      networkFor(response),
    );

    expect(result).toMatchObject({ content: "abc", truncated: true });
  });

  it("returns a non-success HTTP response as bounded resource state", async (): Promise<void> => {
    const response = new Response("missing", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
    const result = await fetchHttpPage(
      "https://example.com/missing",
      fetchConfig(),
      undefined,
      networkFor(response),
    );

    expect(result).toMatchObject({ statusCode: 404, content: "missing", truncated: false });
  });

  it("rejects missing, binary, and unsupported charset content types", async (): Promise<void> => {
    for (const response of [
      new Response(new Uint8Array([1, 2, 3])),
      new Response("data", { headers: { "content-type": "application/octet-stream" } }),
      new Response("data", { headers: { "content-type": "text/plain; charset=not-a-charset" } }),
    ]) {
      await expect(
        fetchHttpPage("https://example.com/", fetchConfig(), undefined, networkFor(response)),
      ).rejects.toThrow();
    }
  });
});

describe("fetch cancellation", (): void => {
  const waitingNetwork = (): FetchNetwork => ({
    resolve: async (): Promise<ResolvedAddress[]> => [resolvedAddress()],
    request: async (
      _url: URL,
      _addresses: readonly ResolvedAddress[],
      _headers: Readonly<Record<string, string>>,
      signal: AbortSignal,
    ): Promise<PinnedResponse> =>
      new Promise<PinnedResponse>(
        (
          _resolve: (value: PinnedResponse | PromiseLike<PinnedResponse>) => void,
          reject: (reason?: unknown) => void,
        ): void => {
          signal.addEventListener(
            "abort",
            (): void => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        },
      ),
  });

  it("classifies the configured timeout", async (): Promise<void> => {
    await expect(
      fetchHttpPage(
        "https://example.com/",
        fetchConfig({ timeoutMs: 1 }),
        undefined,
        waitingNetwork(),
      ),
    ).rejects.toThrow("timed out");
  });

  it("classifies caller cancellation without exposing its reason", async (): Promise<void> => {
    const controller = new AbortController();
    const operation = fetchHttpPage(
      "https://example.com/",
      fetchConfig(),
      controller.signal,
      waitingNetwork(),
    );
    controller.abort(SENTINEL);

    await expect(operation).rejects.toThrow("aborted");
    await expect(operation).rejects.not.toThrow(SENTINEL);
  });
});
