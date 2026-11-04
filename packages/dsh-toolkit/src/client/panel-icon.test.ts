// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";
import { ToolkitPanelIcon } from "./panel-icon.js";

describe("ToolkitPanelIcon", () => {
  it("draws a toolbox glyph sized by the host", () => {
    const html = renderToStaticMarkup(createElement(ToolkitPanelIcon, { size: 18, active: true }));
    expect(html).toContain("<svg");
    expect(html).toContain('width="18"');
    expect(html).toContain('stroke="currentColor"');
    // 宿主图标统一 1px 描边，避免在侧边栏里显得过粗。
    expect(html).toContain('stroke-width="1"');
  });

  it("falls back to the 16px default", () => {
    const html = renderToStaticMarkup(createElement(ToolkitPanelIcon, {}));
    expect(html).toContain('width="16"');
  });
});
