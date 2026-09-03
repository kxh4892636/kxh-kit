import { describe, expect, it, vi } from "vitest";

import {
  createConfigLoader,
  DEFAULT_MAX_CONCURRENCY,
  getConfigPath,
  MAX_CONCURRENCY,
} from "./config.js";

const missingFile = (): Error => Object.assign(new Error("missing"), { code: "ENOENT" });

describe("Subagent configuration", (): void => {
  it("uses the documented default when the global file is absent", async (): Promise<void> => {
    const readText = vi.fn<() => Promise<string>>().mockRejectedValue(missingFile());
    const loader = createConfigLoader({ agentDir: "/agent", readText });

    await expect(loader.load()).resolves.toEqual({ maxConcurrency: DEFAULT_MAX_CONCURRENCY });
    expect(loader.path).toBe(getConfigPath("/agent"));
  });

  it("loads one frozen configured snapshot", async (): Promise<void> => {
    const loader = createConfigLoader({
      agentDir: "/agent",
      readText: async (): Promise<string> => JSON.stringify({ maxConcurrency: 9 }),
    });

    const config = await loader.load();

    expect(config).toEqual({ maxConcurrency: 9 });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    ["invalid JSON", "{", "root"],
    ["array root", "[]", "root"],
    ["unknown field", JSON.stringify({ extra: true }), "root.extra"],
    ["null", JSON.stringify({ maxConcurrency: null }), "root.maxConcurrency"],
    ["zero", JSON.stringify({ maxConcurrency: 0 }), "root.maxConcurrency"],
    ["fraction", JSON.stringify({ maxConcurrency: 1.5 }), "root.maxConcurrency"],
    [
      "above maximum",
      JSON.stringify({ maxConcurrency: MAX_CONCURRENCY + 1 }),
      "root.maxConcurrency",
    ],
  ])("rejects %s", async (_name: string, text: string, field: string): Promise<void> => {
    const loader = createConfigLoader({
      agentDir: "/agent",
      readText: async (): Promise<string> => text,
    });

    await expect(loader.load()).rejects.toThrow(field);
  });

  it("does not disguise an unreadable file as a missing file", async (): Promise<void> => {
    const loader = createConfigLoader({
      agentDir: "/agent",
      readText: async (): Promise<string> => Promise.reject(new Error("permission denied")),
    });

    await expect(loader.load()).rejects.toThrow("cannot read pi-nano-subagent.json");
  });
});
