import { compositeTuiLine, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vite-plus/test";
import {
  createDetailComponent,
  createLiveFeed,
  DETAIL_CLOSE_GLYPH,
  DETAIL_WIDTH,
  renderDetailCard,
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

describe("宿主合成语义（“外区透明”结论的依据）", () => {
  it("空行不等于透明：合成会按 overlayWidth 把矩形那一行写成空格", () => {
    const merged = compositeTuiLine("0123456789", "", 2, 4, 10);
    // 矩形外(`01` / `6789`)保留，矩形内被空格清掉 ⇒ 返回空行是“清空该行”。
    expect(stripTerminalSequences(merged)).toBe("01    6789");
    expect(visibleWidth(merged)).toBe(10);
  });

  it("overlay 只有卡片那么宽时，矩形外的行列原样保留", () => {
    const merged = compositeTuiLine("abcdefghij", "┌──┐", 3, 4, 10);
    expect(stripTerminalSequences(merged)).toBe("abc┌──┐hij");
  });
});

describe("renderDetailLines", () => {
  it("包含标题、摘要、实时流与关闭提示，并按宽度折行", () => {
    const lines = renderDetailLines(
      {
        heading: "note 07 · 执行中",
        body: ["一句话摘要", ""],
        live: ["正在写的很长的输出".repeat(3)],
        running: true,
      },
      30,
      fakeTheme as never,
    );
    const text = lines.join("\n");
    expect(text).toContain("note 07 · 执行中");
    expect(text).toContain("一句话摘要");
    expect(text).toContain("实时流");
    expect(text).toContain(`Esc 或点 ${DETAIL_CLOSE_GLYPH} 关闭`);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(30);
  });

  it("未在跑且没有流时不显示实时流区", () => {
    const lines = renderDetailLines(
      { heading: "note 12 · 已完成", body: ["完成"], live: [], running: false },
      40,
      fakeTheme as never,
    );
    expect(lines.join("\n")).not.toContain("实时流");
  });
});

describe("renderDetailCard", () => {
  it("只返回卡片本体：宽度正好等于声明宽度，没有卡片外的空白行", () => {
    const lines = renderDetailCard(["标题", "正文"], 48);
    // 行数 = 上框 + 内容 + 下框：不再铺满终端，矩阵外一个像素都不写。
    expect(lines).toHaveLength(2 + 2);
    expect(lines[0]?.startsWith("┌")).toBe(true);
    expect(lines.at(-1)?.startsWith("└")).toBe(true);
    const text = lines.join("\n");
    expect(text).toContain("标题");
    expect(text).toContain("└");
    for (const line of lines) expect(visibleWidth(line)).toBe(48);
    // 卡片外不存在“空行”：这正是透明的前提（COMPOSITE 白写）。
    expect(lines.some((line) => line === "")).toBe(false);
  });

  it("边框可上色：只有框线被包色，内容不受影响；右上角有 ×", () => {
    const lines = renderDetailCard(["内容"], 40, (text) => `<w>${text}</w>`);
    const text = lines.join("\n");
    expect(text).toContain("<w>┌");
    expect(text).toContain("<w>│");
    expect(text).toContain("<w>└");
    expect(text).toContain(`${DETAIL_CLOSE_GLYPH}┐</w>`);
    // 内容行不被上色包住（只被竖线包住）。
    expect(text).toContain("<w>│</w> 内容");
  });

  it("窄宽度时仍放得下", () => {
    const lines = renderDetailCard(["x"], 24);
    for (const line of lines) expect(visibleWidth(line)).toBe(24);
  });
});

describe("createDetailComponent", () => {
  const setup = () => {
    let closed = 0;
    const component = createDetailComponent(fakeTheme as never, {
      content: () => ({
        heading: "◇ note 01 · 执行中",
        body: ["一句话摘要"],
        live: [],
        running: false,
      }),
      onClose: () => {
        closed += 1;
      },
    });
    return { component, closed: () => closed };
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
      },
    );
    const text = component.render(DETAIL_WIDTH).join("\n");
    expect(text).toContain("<warning>┌");
    expect(text).toContain("<warning>│");
  });

  it("渲染出的每一行都等于声明宽度（宿主矩形内没有半透明列）", () => {
    const { component } = setup();
    const lines = component.render(DETAIL_WIDTH);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(visibleWidth(line)).toBe(DETAIL_WIDTH);
    expect(lines.join("\n")).toContain("◇ note 01 · 执行中");
  });

  it("点卡片右上角 × 关闭；点卡片其它位置不关", () => {
    const first = setup();
    first.component.render(DETAIL_WIDTH);
    first.component.handleMouse?.({ type: "press", x: DETAIL_WIDTH - 2, y: 0 } as never);
    expect(first.closed()).toBe(0);
    first.component.handleMouse?.({ type: "click", x: DETAIL_WIDTH - 2, y: 0 } as never);
    expect(first.closed()).toBe(1);

    const second = setup();
    second.component.render(DETAIL_WIDTH);
    second.component.handleMouse?.({ type: "click", x: 4, y: 1 } as never);
    expect(second.closed()).toBe(0);
  });

  it("Esc 不再由组件处理（浮层是 nonCapturing，键盘交给侧栏的输入监听）", () => {
    const { component, closed } = setup();
    expect("handleInput" in component).toBe(false);
    expect(closed()).toBe(0);
  });
});
