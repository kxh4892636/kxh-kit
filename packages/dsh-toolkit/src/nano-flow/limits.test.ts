import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { buildLimitsText } from "./limits.js";

describe("buildLimitsText", () => {
  it("renders rule, overview and concrete values from settings", () => {
    const text = buildLimitsText(DEFAULT_NANO_FLOW_SETTINGS);
    expect(text).toContain("## 篇幅限制");
    expect(text).toContain("规则：");
    expect(text).toContain("概述：");
    expect(text).toContain("具体值：");
    expect(text).toContain("spec.md ≤ 34 KB");
    expect(text).toContain("单条 note ≤ 13 KB");
    expect(text).toContain("description ≤ 233 字");
    expect(text).toContain("CONTEXT.md ≤ 89 KB");
    expect(text).toContain("question ≤ 13 KB");
    expect(text).toContain("ADR ≤ 13 KB");
    expect(text).toContain("workflow ≤ 34 KB");
    expect(text).toContain("ADR 数量与追踪 Note 行数不限制");
  });

  it("reflects changed settings", () => {
    const text = buildLimitsText({
      ...DEFAULT_NANO_FLOW_SETTINGS,
      specMaxBytes: 2048,
      noteDescriptionMaxChars: 100,
    });
    expect(text).toContain("spec.md ≤ 2 KB");
    expect(text).toContain("description ≤ 100 字");
  });
});
