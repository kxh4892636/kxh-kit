import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vite-plus/test";
import {
  createDetailComponent,
  createLiveFeed,
  DETAIL_CARD_MARGIN,
  frameDetailCard,
  renderDetailLines,
  STREAM_MAX_LINES,
  streamChunkOf,
  tailToWidth,
  type StreamSource,
} from "./detail-overlay.ts";

const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 可控的会话替身：`emit` 直接推事件给订阅者。 */
const fakeSource = (): StreamSource & { emit: (event: unknown) => void; unsubscribed: boolean } => {
  const listeners = new Set<(event: unknown) => void>();
  const source = {
    unsubscribed: false,
    subscribe(listener: (event: unknown) => void): () => void {
      listeners.add(listener);
      return () => {
        source.unsubscribed = true;
        listeners.delete(listener);
      };
    },
    emit: (event: unknown): void => {
      for (const listener of listeners) listener(event);
    },
  };
  return source;
};

const textDelta = (delta: string): unknown => ({
  type: "message_update",
  assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta },
});

describe("streamChunkOf", () => {
  it("抽 text_delta 与工具调用，其余事件忽略", () => {
    expect(streamChunkOf(textDelta("你好"))).toEqual({ kind: "text", text: "你好" });
    expect(streamChunkOf({ type: "tool_execution_start", toolName: "bash" })).toEqual({
      kind: "tool",
      text: "⋯ bash",
    });
    expect(
      streamChunkOf({ type: "message_update", assistantMessageEvent: { type: "text_end" } }),
    ).toBeUndefined();
    expect(streamChunkOf({ type: "agent_settled", aborted: false })).toBeUndefined();
    expect(streamChunkOf(textDelta(""))).toBeUndefined();
    expect(streamChunkOf(undefined)).toBeUndefined();
  });
});

describe("tailToWidth", () => {
  it("放得下就原样，放不下留尾部并加省略号", () => {
    expect(tailToWidth("abcdef", 10)).toBe("abcdef");
    const clipped = tailToWidth("abcdefghij", 5);
    expect(clipped.startsWith("…")).toBe(true);
    expect(clipped).toContain("j");
    expect(clipped.length).toBe(5);
  });

  it("中文按宽度裁，不超列", () => {
    const clipped = tailToWidth("一二三四五六七八九十", 6);
    expect(visibleWidth(clipped)).toBeLessThanOrEqual(6);
    expect(clipped).toContain("十");
  });
});

describe("createLiveFeed", () => {
  it("按节流窗口合并重绘，只留最近几行", async () => {
    const source = fakeSource();
    let renders = 0;
    const feed = createLiveFeed(
      source,
      () => {
        renders += 1;
      },
      10,
    );
    source.emit(textDelta("第一段\n"));
    source.emit(textDelta("第二段\n"));
    source.emit(textDelta("第三段\n"));
    source.emit(textDelta("第四段"));
    // 节流：窗口内一次都不重绘。
    expect(renders).toBe(0);
    await wait(30);
    expect(renders).toBe(1);
    const lines = feed.lines();
    expect(lines).toHaveLength(STREAM_MAX_LINES);
    expect(lines.at(-1)).toBe("第四段");
    feed.stop();
  });

  it("工具标记与文本混排，stop 后不再回调也不再收事件", async () => {
    const source = fakeSource();
    let renders = 0;
    const feed = createLiveFeed(
      source,
      () => {
        renders += 1;
      },
      5,
    );
    source.emit({ type: "tool_execution_start", toolName: "orchestrator_read" });
    source.emit(textDelta("读完了"));
    await wait(20);
    expect(renders).toBe(1);
    expect(feed.lines(2)).toContain("⋯ orchestrator_read");
    feed.stop();
    expect(source.unsubscribed).toBe(true);
    source.emit(textDelta("停止之后"));
    await wait(20);
    expect(renders).toBe(1);
  });

  it("没有 subscribe 的会话退化成空流", () => {
    const feed = createLiveFeed(undefined, () => undefined);
    expect(feed.isEmpty()).toBe(true);
    expect(feed.lines()).toEqual([]);
    feed.stop();
  });

  it("文本尾巴有上限，长流不会无限增长", async () => {
    const source = fakeSource();
    const feed = createLiveFeed(source, () => undefined, 5);
    for (let index = 0; index < 200; index += 1) source.emit(textDelta("长"));
    await wait(20);
    const lines = feed.lines();
    expect(lines.length).toBeLessThanOrEqual(STREAM_MAX_LINES);
    feed.stop();
  });
});

describe("renderDetailLines", () => {
  it("包含标题、摘要、实时流与 Esc 提示，并按宽度折行", () => {
    const lines = renderDetailLines(
      {
        heading: "note 07 · in_progress",
        body: ["一句话摘要", ""],
        live: ["正在写的很长的输出".repeat(3)],
        running: true,
      },
      30,
      fakeTheme as never,
    );
    const text = lines.join("\n");
    expect(text).toContain("note 07 · in_progress");
    expect(text).toContain("一句话摘要");
    expect(text).toContain("实时流");
    expect(text).toContain("点击外部或 Esc 关闭");
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(30);
  });

  it("未在跑且没有流时不显示实时流区", () => {
    const lines = renderDetailLines(
      { heading: "note 12 · completed", body: ["完成"], live: [], running: false },
      40,
      fakeTheme as never,
    );
    expect(lines.join("\n")).not.toContain("实时流");
  });
});

describe("frameDetailCard", () => {
  it("铺满可用区域，卡片居中并带边框", () => {
    const frame = frameDetailCard(["标题", "正文"], { columns: 60, rows: 12 });
    // 行数等于终端行数：铺满才收得到卡片外的点击。
    expect(frame.lines).toHaveLength(12);
    const { card } = frame;
    expect(card.left).toBeGreaterThan(0);
    expect(card.right - card.left).toBeLessThanOrEqual(60);
    // 垂直居中。
    expect(card.top).toBe(Math.max(0, Math.floor((12 - (card.bottom - card.top)) / 2)));
    const text = frame.lines.join("\n");
    expect(text).toContain("┌");
    expect(text).toContain("标题");
    expect(text).toContain("└");
    // 卡片外是空白行。
    expect(frame.lines[0]).toBe("");
    for (const line of frame.lines) expect(visibleWidth(line)).toBeLessThanOrEqual(60);
  });

  it("边框可上色：只有框线被包色，内容不受影响", () => {
    const frame = frameDetailCard(["内容"], { columns: 40, rows: 8 }, (text) => `<w>${text}</w>`);
    const text = frame.lines.join("\n");
    expect(text).toContain("<w>┌");
    expect(text).toContain("<w>│");
    expect(text).toContain("<w>└");
    // 内容行不被上色包住（只被竖线包住）。
    expect(text).toContain("<w>│</w> 内容");
  });

  it("窄终端时卡片跟着收窄，仍然放得下", () => {
    const frame = frameDetailCard(["x"], { columns: 30, rows: 6 });
    expect(frame.card.right - frame.card.left).toBe(30 - DETAIL_CARD_MARGIN * 2);
    for (const line of frame.lines) expect(visibleWidth(line)).toBeLessThanOrEqual(30);
  });
});

describe("createDetailComponent", () => {
  const area = { columns: 60, rows: 16 };
  const setup = () => {
    let closed = 0;
    const component = createDetailComponent(fakeTheme as never, {
      content: () => ({ heading: "note 01", body: ["一句话摘要"], live: [], running: false }),
      onClose: () => {
        closed += 1;
      },
      area: () => area,
    });
    return { component, closed: () => closed, lines: component.render(area.columns) };
  };

  it("详情卡片外框用 warning 色（与侧栏 accent 不同）", () => {
    const component = createDetailComponent(
      {
        fg: (color: string, text: string) => `<${color}>${text}</>`,
        bold: (text: string) => text,
      } as never,
      {
        content: () => ({ heading: "◇ note 01", body: ["摘要"], live: [], running: false }),
        onClose: () => undefined,
        area: () => area,
      },
    );
    const text = component.render(area.columns).join("\n");
    expect(text).toContain("<warning>┌");
    expect(text).toContain("<warning>│");
  });

  it("Esc 关闭，其它键不关", () => {
    const { component, closed, lines } = setup();
    expect(lines.join("\n")).toContain("note 01");
    expect(lines.join("\n")).toContain("点击外部或 Esc 关闭");
    component.handleInput?.("a");
    expect(closed()).toBe(0);
    component.handleInput?.("\u001b");
    expect(closed()).toBe(1);
  });

  it("点击卡片内部不关闭，点击卡片外部关闭", () => {
    const first = setup();
    // 第一行在卡片外（卡片垂直居中），点它只关详情浮层。
    expect(first.lines[0]).toBe("");
    first.component.handleMouse?.({ type: "press", x: 1, y: 0 } as never);
    expect(first.closed()).toBe(0);
    first.component.handleMouse?.({ type: "click", x: 1, y: 0 } as never);
    expect(first.closed()).toBe(1);

    // 卡片正中：不关。
    const second = setup();
    second.component.handleMouse?.({
      type: "click",
      x: Math.floor(area.columns / 2),
      y: Math.floor(area.rows / 2),
    } as never);
    expect(second.closed()).toBe(0);

    // 卡片左侧的空白列：关。
    const third = setup();
    const frame = frameDetailCard(["（占位）"], area);
    expect(frame.card.left).toBeGreaterThan(0);
    third.component.handleMouse?.({
      type: "click",
      x: frame.card.left - 1,
      y: Math.floor(area.rows / 2),
    } as never);
    expect(third.closed()).toBe(1);
  });
});
