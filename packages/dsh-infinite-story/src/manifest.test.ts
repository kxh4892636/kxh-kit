import { describe, expect, it } from "vitest";
import * as manifest from "./main.js";

/**
 * Cordis turns every KEY of the `inject` export into a service name.
 *
 * A regression here is silent at build time and fatal at runtime: the row waits
 * for services that never exist, the preset audit reports `waiting for …`, and
 * `agent-preset-registry` marks the 故事模式 preset broken, so the selector shows
 * 加载失败 and no session can start on it. Pin the shape.
 */
describe("plugin manifest", () => {
  it("declares inject as a flat list of service names", () => {
    expect(Array.isArray(manifest.inject)).toBe(true);
  });

  it("waits only for services the preset composition always supplies", () => {
    expect([...manifest.inject].sort()).toEqual(["systemPrompt", "tools"]);
  });

  it("keeps host-optional services out of inject", () => {
    for (const name of ["required", "optional", "llm", "agentDefaultModel", "jobs"]) {
      expect(manifest.inject as readonly string[]).not.toContain(name);
    }
  });
});
