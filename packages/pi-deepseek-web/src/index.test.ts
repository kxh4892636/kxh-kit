import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import piDeepSeekWeb, { createGlobalConfigLoader, getConfigPath } from "./index.js";

describe("Pi extension entry", (): void => {
  it("binds the configuration loader to Pi's global agent directory", (): void => {
    expect(createGlobalConfigLoader().path).toBe(getConfigPath(getAgentDir()));
  });

  it("loads as a Pi extension before tools are registered", (): void => {
    expect(piDeepSeekWeb({} as ExtensionAPI)).toBeUndefined();
  });
});
