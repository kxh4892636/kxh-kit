import { describe, expect, it, vi } from "vitest";

import { createConfigLoader, getConfigPath } from "./plugin-config.js";

const SENTINEL = "sentinel-secret-that-must-not-leak";

const configText = (search: Record<string, unknown> = {}): string => JSON.stringify({ search });

describe("configuration loading", (): void => {
  it("uses the Pi agent directory and reloads configuration for every call", async (): Promise<void> => {
    const readText = vi
      .fn<(path: string) => Promise<string>>()
      .mockResolvedValueOnce(configText({ model: "first" }))
      .mockResolvedValueOnce(configText({ model: "second" }));
    const loader = createConfigLoader({
      agentDir: "C:\\agent",
      readText,
      readEnvironment: (): string => SENTINEL,
    });

    expect(loader.path).toBe(getConfigPath("C:\\agent"));
    expect((await loader.load()).search.model).toBe("first");
    expect((await loader.load()).search.model).toBe("second");
    expect(readText).toHaveBeenCalledTimes(2);
    expect(readText).toHaveBeenNthCalledWith(1, loader.path);
  });

  it("applies documented defaults and returns a frozen per-call snapshot", async (): Promise<void> => {
    let source = configText();
    const loader = createConfigLoader({
      agentDir: "/agent",
      readText: async (): Promise<string> => source,
      readEnvironment: (): string => SENTINEL,
    });

    const snapshot = await loader.load();
    source = configText({ maxResults: 3 });

    expect(snapshot).toEqual({
      search: {
        apiKey: SENTINEL,
        apiKeyEnv: "DEEPSEEK_API_KEY",
        baseURL: "https://api.deepseek.com/anthropic",
        model: "deepseek-v4-flash",
        apiVersion: "2023-06-01",
        maxTokens: 4096,
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
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.search)).toBe(true);
    expect((await loader.load()).search.maxResults).toBe(3);
  });

  it("prefers a literal API key without reading its configured environment variable", async (): Promise<void> => {
    const readEnvironment = vi.fn((): string => "environment-secret");
    const loader = createConfigLoader({
      agentDir: "/agent",
      readText: async (): Promise<string> =>
        configText({ apiKey: SENTINEL, apiKeyEnv: "CUSTOM_KEY" }),
      readEnvironment,
    });

    expect((await loader.load()).search.apiKey).toBe(SENTINEL);
    expect(readEnvironment).not.toHaveBeenCalled();
  });
});

describe("configuration validation", (): void => {
  it.each([
    ["missing file", async (): Promise<string> => Promise.reject(new Error(SENTINEL)), "root"],
    ["invalid JSON", async (): Promise<string> => `{"search": "${SENTINEL}`, "root"],
    ["missing search", async (): Promise<string> => JSON.stringify({ fetch: {} }), "search"],
    [
      "unknown root field",
      async (): Promise<string> => JSON.stringify({ search: {}, [SENTINEL]: true }),
      `root.${SENTINEL}`,
    ],
    [
      "unknown search field",
      async (): Promise<string> => configText({ [SENTINEL]: true }),
      `search.${SENTINEL}`,
    ],
    [
      "unknown fetch field",
      async (): Promise<string> => JSON.stringify({ search: {}, fetch: { [SENTINEL]: 1 } }),
      `fetch.${SENTINEL}`,
    ],
    [
      "invalid integer",
      async (): Promise<string> => configText({ maxUses: 0, apiKey: SENTINEL }),
      "search.maxUses",
    ],
    [
      "invalid URL",
      async (): Promise<string> =>
        configText({ baseURL: `https://${SENTINEL}@example.com`, apiKey: SENTINEL }),
      "search.baseURL",
    ],
    [
      "versioned URL",
      async (): Promise<string> =>
        configText({ baseURL: "https://example.com/foo/v1/messages", apiKey: SENTINEL }),
      "search.baseURL",
    ],
  ])(
    "reports a stable field error for %s",
    async (
      _name: string,
      readText: () => Promise<string>,
      expectedField: string,
    ): Promise<void> => {
      const loader = createConfigLoader({
        agentDir: "/agent",
        readText,
        readEnvironment: (): string => SENTINEL,
      });

      await expect(loader.load()).rejects.toThrow(expectedField);
    },
  );
});

describe("configuration secret containment", (): void => {
  it.each([
    configText({ apiKey: ` ${SENTINEL}` }),
    configText({ apiKeyEnv: SENTINEL }),
    JSON.stringify({ search: {}, fetch: { timeoutMs: SENTINEL } }),
  ])(
    "does not expose credential values when validation fails",
    async (source: string): Promise<void> => {
      const loader = createConfigLoader({
        agentDir: "/agent",
        readText: async (): Promise<string> => source,
        readEnvironment: (): undefined => undefined,
      });

      let message = "";
      try {
        await loader.load();
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toContain(SENTINEL);
    },
  );
});
