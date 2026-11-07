import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vite-plus/test";
import {
  createLiveFeed,
  createDetailComponent,
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
    expect(text).toContain("Esc 关闭详情");
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

describe("createDetailComponent", () => {
  it("Esc 关闭，其它键不关", () => {
    let closed = 0;
    const component = createDetailComponent(fakeTheme as never, {
      content: () => ({ heading: "note 01", body: [], live: [], running: false }),
      onClose: () => {
        closed += 1;
      },
    });
    component.handleInput?.("a");
    expect(closed).toBe(0);
    component.handleInput?.("\u001b");
    expect(closed).toBe(1);
    expect(component.render(40).join("\n")).toContain("note 01");
  });
});
