// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { ensureToolkitStyles } from "./stylesheet.js";

describe("ensureToolkitStyles", () => {
  it("injects the plugin stylesheet exactly once", () => {
    ensureToolkitStyles();
    ensureToolkitStyles();
    const tags = document.querySelectorAll(
      'style[data-plugin-css="@kxh4892636/dsh-toolkit/toolkit.css"]',
    );
    expect(tags).toHaveLength(1);
    expect(tags[0]?.getAttribute("data-plugin")).toBe("@kxh4892636/dsh-toolkit");
  });

  it("only styles through host tokens", () => {
    ensureToolkitStyles();
    const css = document.querySelector(
      'style[data-plugin-css="@kxh4892636/dsh-toolkit/toolkit.css"]',
    )?.textContent;
    expect(css).toBeDefined();
    // 面板复刻设置页的 section/card/row 度量。
    expect(css).toContain(".dshtk-panel");
    expect(css).toContain(".dshtk-row-card");
    expect(css).toContain("border: .5px solid var(--dsw-alias-settings-card-stroke)");
    expect(css).toContain("background: var(--dsw-alias-settings-card-fill)");
    expect(css).toContain("border-radius: var(--dsw-radius-xl)");
    // 撤回触发器复刻权限选择的度量与交互态。
    expect(css).toContain(".dshtk-undo-trigger");
    expect(css).toContain("var(--dsw-alias-interactive-bg-hover)");
    expect(css).toContain("var(--dsw-alias-label-dimmed)");
    // 弹窗正文层级。
    expect(css).toContain(".dshtk-dialog-preview");
    // 不出现字面色值（token 之外的颜色只允许经由 token 表达式）。
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\(/u);
  });
});
