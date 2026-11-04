// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { ensureToolkitStyles } from "./stylesheet.js";

describe("ensureToolkitStyles", () => {
  it("injects the toolbar stylesheet exactly once", () => {
    ensureToolkitStyles();
    ensureToolkitStyles();
    const tags = document.querySelectorAll(
      'style[data-plugin-css="@kxh4892636/dsh-toolkit/toolkit.css"]',
    );
    expect(tags).toHaveLength(1);
    expect(tags[0]?.textContent).toContain(".dshtk-undo");
    expect(tags[0]?.textContent).toContain("hover:not(:disabled)");
    expect(tags[0]?.getAttribute("data-plugin")).toBe("@kxh4892636/dsh-toolkit");
  });
});
