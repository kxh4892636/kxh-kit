import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommentThread, DiffChunk as DiffChunkData } from "../../types/diff";
import { WordHighlightProvider } from "../contexts/WordHighlightContext";

import { DiffChunk } from "./DiffChunk";
import { SideBySideDiffChunk } from "./SideBySideDiffChunk";

const VIEWPORT_HEIGHT = 600;
const ROW_HEIGHT = 21;
const GIANT_LINE_COUNT = 20_000;

const noop = (): void => {};
const asyncNoop = async (): Promise<void> => {};

const buildGiantChunk = (lineCount: number): DiffChunkData => ({
  header: `@@ -0,0 +1,${lineCount} @@`,
  oldStart: 0,
  oldLines: 0,
  newStart: 1,
  newLines: lineCount,
  lines: Array.from({ length: lineCount }, (_, i) => ({
    type: "add" as const,
    content: `const line${i} = ${i};`,
    newLineNumber: i + 1,
  })),
});

const buildThread = (line: number, body: string): CommentThread => ({
  id: `thread-${line}`,
  file: "src/big.ts",
  line,
  side: "new",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  messages: [
    {
      id: `message-${line}`,
      body,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
});

const baseProps = {
  chunkIndex: 0,
  onAddComment: asyncNoop,
  onGenerateThreadPrompt: () => "",
  onRemoveThread: noop,
  onReplyToThread: asyncNoop,
  onRemoveMessage: noop,
  onUpdateMessage: noop,
  filename: "src/big.ts",
};

// DiffChunk 默认 mode 是 split (DEFAULT_DIFF_VIEW_MODE), unified 路径需显式指定
const unifiedProps = { ...baseProps, mode: "unified" as const };

// happy-dom 无布局: mock 视口与行高, 让虚拟列表按 600px 视口 / 21px 行高计算窗口。
// getBoundingClientRect().top 必须保持视口相对性 (内容元素 top = 内容偏移 - scrollTop),
// 否则 scrollMargin 不变量 (滚动时恒定) 会被破坏, 测量结果把滚动量错误吸进列表起点。
// scrollHeight 模拟浏览器行为: 由 spacer 行的显式高度与已挂载行撑出总内容高度,
// 虚拟器的 scrollToIndex 依赖它计算最大滚动偏移
const installLayoutMock = (): void => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const isScroller = el.tagName === "MAIN";
    const scroller = isScroller ? null : el.closest("main");
    const height = isScroller ? VIEWPORT_HEIGHT : ROW_HEIGHT;
    const top = isScroller ? 0 : -(scroller?.scrollTop ?? 0);
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 800,
      bottom: top + height,
      width: 800,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === "MAIN" ? VIEWPORT_HEIGHT : ROW_HEIGHT;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === "MAIN" ? VIEWPORT_HEIGHT : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.tagName !== "MAIN") return 0;
      let total = 0;
      this.querySelectorAll("tr").forEach((tr) => {
        // 浏览器中行高取单元格高度; spacer 的高度写在 td 上
        const cell = tr.firstElementChild as HTMLElement | null;
        const explicit = Number.parseFloat(tr.style.height || cell?.style.height || "");
        total += Number.isFinite(explicit) ? explicit : ROW_HEIGHT;
      });
      return total;
    },
  });
  // happy-dom 的 ResizeObserver 回调尺寸恒为 0, 覆盖为 no-op, 只保留初始测量
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
};

const renderChunk = (ui: ReactNode): ReturnType<typeof render> =>
  render(
    <main className="overflow-y-auto">
      <WordHighlightProvider>{ui}</WordHighlightProvider>
    </main>,
  );

describe("行级虚拟列表", () => {
  beforeEach(installLayoutMock);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unified 大 chunk 只挂载视口附近的行", async () => {
    const { container } = renderChunk(
      <DiffChunk {...unifiedProps} chunk={buildGiantChunk(GIANT_LINE_COUNT)} threads={[]} />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-diff-line-row="true"]')).not.toBeNull();
    });

    const rows = container.querySelectorAll('[data-diff-line-row="true"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(200);
    expect(container.querySelector('[id="file-0-chunk-0-line-4999"]')).toBeNull();
  });

  it("split 大 chunk 只挂载视口附近的行", async () => {
    const { container } = renderChunk(
      <SideBySideDiffChunk {...baseProps} chunk={buildGiantChunk(GIANT_LINE_COUNT)} threads={[]} />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-diff-line-row="true"]')).not.toBeNull();
    });

    const rows = container.querySelectorAll('[data-diff-line-row="true"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(200);
  });

  it("cursor 跳转到 unified 未挂载行时该行被挂载", async () => {
    const chunk = buildGiantChunk(GIANT_LINE_COUNT);
    const { container, rerender } = renderChunk(
      <DiffChunk {...unifiedProps} chunk={chunk} threads={[]} cursor={null} />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-diff-line-row="true"]')).not.toBeNull();
    });
    expect(container.querySelector('[id="file-0-chunk-0-line-2500"]')).toBeNull();

    rerender(
      <main className="overflow-y-auto">
        <WordHighlightProvider>
          <DiffChunk
            {...unifiedProps}
            chunk={chunk}
            threads={[]}
            cursor={{ fileIndex: 0, chunkIndex: 0, lineIndex: 2500, side: "right" }}
          />
        </WordHighlightProvider>
      </main>,
    );
    // 浏览器中程序式滚动会异步派发 scroll 事件, happy-dom 需要手动补发
    fireEvent.scroll(container.querySelector("main")!);

    await waitFor(() => {
      expect(container.querySelector('[id="file-0-chunk-0-line-2500"]')).not.toBeNull();
    });
  });

  it("split cursor 跳转到未挂载行时该行被挂载", async () => {
    const chunk = buildGiantChunk(GIANT_LINE_COUNT);
    const { container, rerender } = renderChunk(
      <SideBySideDiffChunk {...baseProps} chunk={chunk} threads={[]} cursor={null} />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-diff-line-row="true"]')).not.toBeNull();
    });
    expect(container.querySelector('[id="file-0-chunk-0-line-2500-right"]')).toBeNull();

    rerender(
      <main className="overflow-y-auto">
        <WordHighlightProvider>
          <SideBySideDiffChunk
            {...baseProps}
            chunk={chunk}
            threads={[]}
            cursor={{ fileIndex: 0, chunkIndex: 0, lineIndex: 2500, side: "right" }}
          />
        </WordHighlightProvider>
      </main>,
    );
    fireEvent.scroll(container.querySelector("main")!);

    await waitFor(() => {
      expect(container.querySelector('[id="file-0-chunk-0-line-2500-right"]')).not.toBeNull();
    });
  });

  it("评论卡片跟随锚定行进入视口时挂载", async () => {
    const chunk = buildGiantChunk(GIANT_LINE_COUNT);
    const threads = [buildThread(2501, "far away comment body")];
    const { container, rerender } = renderChunk(
      <DiffChunk {...unifiedProps} chunk={chunk} threads={threads} cursor={null} />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-diff-line-row="true"]')).not.toBeNull();
    });
    expect(screen.queryByText("far away comment body")).toBeNull();

    rerender(
      <main className="overflow-y-auto">
        <WordHighlightProvider>
          <DiffChunk
            {...unifiedProps}
            chunk={chunk}
            threads={threads}
            cursor={{ fileIndex: 0, chunkIndex: 0, lineIndex: 2500, side: "right" }}
          />
        </WordHighlightProvider>
      </main>,
    );
    fireEvent.scroll(container.querySelector("main")!);

    await screen.findByText("far away comment body");
  });

  it("小 chunk 不启用虚拟化, 全部行直接渲染且无占位行", () => {
    const smallChunk: DiffChunkData = {
      header: "@@ -1,2 +1,3 @@",
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 3,
      lines: [
        { type: "normal", content: "a", oldLineNumber: 1, newLineNumber: 1 },
        { type: "delete", content: "b", oldLineNumber: 2 },
        { type: "add", content: "c", newLineNumber: 2 },
      ],
    };
    const { container } = renderChunk(
      <DiffChunk {...unifiedProps} chunk={smallChunk} threads={[]} />,
    );

    expect(container.querySelectorAll('[data-diff-line-row="true"]').length).toBe(3);
    expect(container.querySelectorAll("[data-virtual-spacer]").length).toBe(0);
  });
});
