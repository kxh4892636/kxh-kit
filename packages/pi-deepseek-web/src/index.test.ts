import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import piDeepSeekWeb, { createGlobalConfigLoader, getConfigPath } from "./index.js";

describe("Pi extension entry", (): void => {
  it("binds the configuration loader to Pi's global agent directory", (): void => {
    expect(createGlobalConfigLoader().path).toBe(getConfigPath(getAgentDir()));
  });

  it("registers both web tools when loaded as a Pi extension", (): void => {
    const registerTool = vi.fn();
    const pi = { registerTool } as unknown as ExtensionAPI;

    expect(piDeepSeekWeb(pi)).toBeUndefined();
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool.mock.calls.map((call: unknown[]): unknown => call[0])).toEqual([
      expect.objectContaining({ name: "web_search" }),
      expect.objectContaining({ name: "web_fetch" }),
    ]);
  });
});
