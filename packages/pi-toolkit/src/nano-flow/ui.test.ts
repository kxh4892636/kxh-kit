import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vite-plus/test";

import { pickNanoFlowMode, modeItems } from "./ui/selector.ts";
import { createNotesSidebar, type SidebarSnapshot } from "./ui/sidebar.ts";

/** 记下 fg 用到的主题 token，断言「关闭图标单独着色」用。 */
const fgTokens: string[] = [];

const theme = {
  fg: (token: string, text: string) => {
    fgTokens.push(token);
    return text;
  },
  bold: (text: string) => text,
};

const snapshot = (): SidebarSnapshot => ({
  planName: "2026-11-09-示例",
  notes: [
    { name: "001-待处理", status: "pending", description: "待处理描述", nextStep: "继续" },
    {
      name: "002-阻塞",
      status: "blocked",
      description: "阻塞描述",
      reason: "等验收",
    },
  ],
});

interface OverlayOptions {
  readonly row?: number;
  readonly col?: number;
  readonly anchor?: string;
  readonly width?: number;
  readonly visible?: (width: number, height: number) => boolean;
  readonly margin?: { top?: number; right?: number; bottom?: number; left?: number };
}

interface Overlay {
  readonly component: {
    render(width: number): string[];
    handleMouse?: (event: {
      type: string;
      x?: number;
      y: number;
      screenX?: number;
      screenY?: number;
    }) => unknown;
  };
  readonly options?: OverlayOptions | undefined;
  hidden: boolean;
}

const fakeTui = () => {
  const overlays: Overlay[] = [];
  const listeners: Array<(data: string) => unknown> = [];
  const tui = {
    mode: "fullscreen",
    requestRender: () => undefined,
    showOverlay: (component: Overlay["component"], options?: OverlayOptions) => {
      const overlay: Overlay = { component, options, hidden: false };
      overlays.push(overlay);
      return {
        hide: () => {
          overlay.hidden = true;
        },
      };
    },
    addInputListener: (listener: (data: string) => unknown) => {
      listeners.push(listener);
      return () => undefined;
    },
  };
  return { tui, overlays, listeners };
};

const fakeCtx = (tui: ReturnType<typeof fakeTui>["tui"]) => {
  const widgets = new Map<string, unknown>();
  const ctx = {
    mode: "tui",
    cwd: "/tmp",
    ui: {
      setWidget: (key: string, factory: unknown) => {
        if (factory === undefined) {
          widgets.delete(key);
          return;
        }
        const factoryFn = factory as (t: unknown, th: unknown) => unknown;
        widgets.set(key, factoryFn(tui, theme));
      },
    },
  } as unknown as ExtensionContext;
  return { ctx, widgets };
};

describe("nano-flow selector", () => {
  it("marks the current value and the default", () => {
    const items = modeItems({ enabled: true, always: false });
    expect(items[0]?.label).toContain("✓");
    expect(items[1]?.description).toContain("default");
  });

  it("falls back to select + confirm outside TUI", async () => {
    const ctx = {
      mode: "print",
      ui: {
        select: async () => "开",
        confirm: async () => true,
      },
    } as unknown as ExtensionContext;
    await expect(pickNanoFlowMode(ctx, { enabled: false, always: false })).resolves.toEqual({
      enabled: true,
      persist: true,
    });
  });
});

describe("notes sidebar", () => {
  it("renders unfinished notes and opens a detail card on click", () => {
    const { tui, overlays, listeners } = fakeTui();
    const { ctx, widgets } = fakeCtx(tui);
    const sidebar = createNotesSidebar({ snapshot });
    sidebar.sync(ctx, true);
    expect(widgets.has("nano-flow-notes")).toBe(true);
    // 两个 overlay：列表在 0，右上角图标在 1。
    expect(overlays).toHaveLength(2);

    const list = overlays[0]?.component;
    const icon = overlays[1]?.component;
    const lines = list?.render(80) ?? [];
    // 框体每行都是 40 列；图标不再占框体行，边框外不铺空格。
    expect(lines).toHaveLength(5);
    expect(lines.every((line) => visibleWidth(line) === 40)).toBe(true);
    expect(lines.join("\n")).toContain("Note · 2026-11-09-示例");
    expect(lines.join("\n")).toContain("待处理 · 001-待处理");
    expect(lines.join("\n")).toContain("阻塞 · 002-阻塞");
    // 图标是 1 列 overlay：整行只有字形本身，没有前导空格（否则会抹掉底行背景）。
    const iconLines = icon?.render(1) ?? [];
    expect(iconLines).toEqual(["▤"]);
    expect(overlays[1]?.options?.width).toBe(1);
    expect(overlays[1]?.options?.visible?.(200, 50)).toBe(true);
    // 图标与框体同在 top: 1，右缘对齐：`▤` 占的就是上边框右上角 `┐` 那一格，
    // 因此那格底色属于卡片本身，不会在边框外留下一块悬空的默认底色。
    expect(overlays[0]?.options?.margin).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(overlays[1]?.options?.margin).toEqual({ top: 1, right: 1 });

    // 第 0 行上边框、第 1 行标题；note 从第 2 行开始。
    list?.handleMouse?.({ type: "click", x: 10, y: 2, screenX: 160, screenY: 12 });
    expect(overlays).toHaveLength(3);
    const detailLines = overlays[2]?.component.render(80) ?? [];
    const detail = detailLines.join("\n");
    expect(detail).toContain("001-待处理");
    expect(detail).toContain("待处理描述");
    expect(detail).toContain("下一步：继续");
    // 标题行带加粗的大叉，且每行都是 48 列（标题行曾比边框窄 2 列）。
    expect(detailLines[1]).toContain("✕");
    expect(detailLines.every((line) => visibleWidth(line) === 48)).toBe(true);
    // ✕ 落在标题行右端（第 45 列），点击命中区间为末 4 列。
    const titleLine = detailLines[1] ?? "";
    expect(visibleWidth(titleLine.slice(0, titleLine.indexOf("✕")))).toBe(45);
    // 图标用 warning 单独着色，而不是跟着整行走 border。
    fgTokens.length = 0;
    overlays[2]?.component.render(80);
    expect(fgTokens).toContain("warning");
    // 悬浮在所点 note 行左下侧：顶端对齐该行，右缘在侧栏左缘左侧。
    expect(overlays[2]?.options?.row).toBe(12);
    expect(overlays[2]?.options?.col).toBe(160 - 10 - 48 - 2);

    list?.handleMouse?.({ type: "click", x: 10, y: 3, screenX: 160, screenY: 13 });
    expect(overlays[2]?.component.render(80).join("\n")).toContain("原因：等验收");

    // 点击标题行右端的 × 关闭卡片。
    overlays[2]?.component.handleMouse?.({ type: "click", x: 45, y: 1, screenX: 110, screenY: 13 });
    expect(overlays[2]?.hidden).toBe(true);

    listeners[0]?.("\u001b");
    expect(overlays.at(-1)?.hidden).toBe(true);

    sidebar.sync(ctx, false);
    expect(widgets.has("nano-flow-notes")).toBe(false);
  });

  it("keeps the frame when there are no unfinished notes", () => {
    const { tui, overlays } = fakeTui();
    const { ctx } = fakeCtx(tui);
    const sidebar = createNotesSidebar({
      snapshot: () => ({ planName: "2026-11-09-示例", notes: [] }),
    });
    sidebar.sync(ctx, true);
    const lines = overlays[0]?.component.render(80) ?? [];
    // 上边框 + 标题行 + 空态行 + 下边框。
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("Note · 2026-11-09-示例");
    expect(lines[2]).toContain("全部完成");
    expect(lines.every((line) => visibleWidth(line) === 40)).toBe(true);
    // 空态行不是 note 行，点了不出卡片。
    overlays[0]?.component.handleMouse?.({ type: "click", x: 10, y: 2, screenX: 160, screenY: 13 });
    expect(overlays).toHaveLength(2);
    sidebar.dispose();
  });

  it("collapses to the top-right icon and expands again", () => {
    const { tui, overlays } = fakeTui();
    const { ctx } = fakeCtx(tui);
    const sidebar = createNotesSidebar({ snapshot });
    sidebar.sync(ctx, true);
    const list = overlays[0]?.component;
    const icon = overlays[1]?.component;
    // 上边框 + 标题行 + 两条 note + 下边框。
    expect(list?.render(80)).toHaveLength(5);

    // 折叠：点图标后框体不再渲染任何行，只剩图标本身。
    icon?.handleMouse?.({ type: "click", x: 0, y: 0 });
    expect(list?.render(80)).toEqual([]);
    expect(icon?.render(1)).toEqual(["▤"]);

    // 折叠态点原 note 位置不出卡片。
    list?.handleMouse?.({ type: "click", x: 10, y: 2 });
    expect(overlays).toHaveLength(2);

    // 再点图标展开。
    icon?.handleMouse?.({ type: "click", x: 0, y: 0 });
    expect(list?.render(80)).toHaveLength(5);

    // 展开后点 note 行照常出卡片。
    list?.handleMouse?.({ type: "click", x: 10, y: 2 });
    expect(overlays).toHaveLength(3);
    sidebar.dispose();
  });

  it("renders nothing when there is no snapshot", () => {
    const { tui, overlays } = fakeTui();
    const { ctx } = fakeCtx(tui);
    const sidebar = createNotesSidebar({ snapshot: () => null });
    sidebar.sync(ctx, true);
    const lines = overlays[0]?.component.render(80) ?? [];
    expect(lines).toEqual([]);
    // 图标 overlay 的可见性由谓词控制：没有绑定 Plan 时整块都不出现。
    expect(overlays[1]?.options?.visible?.(200, 50)).toBe(false);
    sidebar.dispose();
  });
});
