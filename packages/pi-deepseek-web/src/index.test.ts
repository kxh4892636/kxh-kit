import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import piDeepSeekWeb, { createGlobalConfigLoader, getConfigPath } from "./index.js";

describe("Pi extension entry", (): void => {
  it("binds the configuration loader to Pi's global agent directory", (): void => {
    expect(createGlobalConfigLoader().path).toBe(getConfigPath(getAgentDir()));
  });

  it("registers web_search when loaded as a Pi extension", (): void => {
    const registerTool = vi.fn();
    const pi = { registerTool } as unknown as ExtensionAPI;

    expect(piDeepSeekWeb(pi)).toBeUndefined();
    expect(registerTool).toHaveBeenCalledOnce();
    expect(registerTool.mock.calls[0]?.[0]).toMatchObject({ name: "web_search" });
  });
});
