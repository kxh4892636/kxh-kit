import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { locateAssetsRoot, readLimitTemplate } from "./assets.js";
import { buildLimitsText, buildLimitsValues } from "./limits.js";

const template = readLimitTemplate(locateAssetsRoot());

describe("buildLimitsText", () => {
  it("keeps the static rule in prompts/limit.md and appends concrete values", () => {
    expect(template).toContain("## 篇幅限制");
    expect(template).toContain("规则：");
    expect(template).not.toContain("具体值");

    const text = buildLimitsText(template, DEFAULT_NANO_FLOW_SETTINGS);
    expect(text).toContain("## 篇幅限制");
    expect(text).toContain("规则：");
    expect(text).not.toContain("具体值：");
    expect(text).toContain("spec.md ≤ 34 KB");
    expect(text).toContain("单条 note ≤ 13 KB");
    expect(text).toContain("description ≤ 233 字");
    expect(text).toContain("CONTEXT.md ≤ 89 KB");
    expect(text).toContain("question ≤ 13 KB");
    expect(text).toContain("ADR ≤ 13 KB");
    expect(text).toContain("workflow ≤ 34 KB");
  });

  it("reflects changed settings without changing the rule template", () => {
    const text = buildLimitsText(template, {
      ...DEFAULT_NANO_FLOW_SETTINGS,
      specMaxBytes: 2048,
      noteDescriptionMaxChars: 100,
    });
    expect(text).toContain("spec.md ≤ 2 KB");
    expect(text).toContain("description ≤ 100 字");
    expect(buildLimitsValues({ ...DEFAULT_NANO_FLOW_SETTINGS, noteMaxBytes: 1024 })).toContain(
      "单条 note ≤ 1 KB",
    );
  });
});
