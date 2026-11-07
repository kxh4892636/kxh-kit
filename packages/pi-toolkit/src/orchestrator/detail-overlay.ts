/**
 * note 详情浮层：快照 + 正在执行时的实时流。
 *
 * 浮层**只占卡片那块矩形**（`width: DETAIL_WIDTH`、`anchor: "center"`），卡片以外一个像素都不写，
 * 因此外部区域是**真透明**的（底层正文与侧栏照常可见）。这不是省事，是宿主语义逼出来的：
 * `compositeTuiLine` 对 overlay 矩形内的每一行都会写满 `overlayWidth` 列（`""` 被 `overlayPad`
 * 补成等宽空格），所以「返回空行」= **清空该行**，不是透明；只有把矩形本身缩到卡片才真透明。
 *
 * 代价与取舍：矩形外的点击落到底层组件（宿主 `dispatchMouseToOverlay` 纯几何命中），因此
 * **不能点外部关闭**，改由卡片右上角的 `×` 或 `Esc` 关闭。浮层同时是 `nonCapturing`：不抢焦点，
 * `Esc` 由侧栏的 `addInputListener` 消费（见 `sidebar.ts`），编辑器焦点不丢。打开它不往主会话插入
 * 任何内容 —— 纯覆盖层。
 *
 * 实时流来自 worker 会话的 `subscribe`：`message_update` 里 `text_delta` 追加文本，
 * `tool_execution_start` 记一行工具名。文本累积到一个有上限的尾巴里，重绘按
 * `STREAM_THROTTLE_MS`（200ms）节流，展示只取最近 `STREAM_MAX_LINES` 行 —— 不累积
 * token、不拖慢渲染。
 * @module @kxh4892636/pi-toolkit/orchestrator/detail-overlay
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";

/** 实时流重绘节流：200ms 一次，够快也不闪。 */
export const STREAM_THROTTLE_MS = 200;
/** 浮层里最多展示的流式行数。 */
export const STREAM_MAX_LINES = 3;
/** 文本尾巴最多留多少字符：只用来显示最近几行。 */
export const STREAM_TAIL_CHARS = 600;
/** 详情卡片宽度（终端更窄时宿主 `resolveOverlayLayout` 会把它 clamp 到可用宽度）。 */
export const DETAIL_WIDTH = 48;
/** 卡片高度上限：占终端高度的比例，超出由宿主按 `maxHeight` 裁。 */
export const DETAIL_MAX_HEIGHT = "80%";
/** 卡片右上角的关闭按钮。 */
export const DETAIL_CLOSE_GLYPH = "×";

/** 一段流式内容：助手文本增量，或一个工具调用标记。 */
export interface StreamChunk {
  readonly kind: "text" | "tool";
  readonly text: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
};

/**
 * 从会话事件里抽出可展示的流式片段；其余事件返回 undefined。
 * @param event - `AgentSession.subscribe` 收到的事件。
 * @returns 文本增量或工具标记。
 */
export const streamChunkOf = (event: unknown): StreamChunk | undefined => {
  const record = asRecord(event);
  const type = record?.["type"];
  if (type === "message_update") {
    const inner = asRecord(record?.["assistantMessageEvent"]);
    if (inner?.["type"] !== "text_delta") return undefined;
    const delta = inner["delta"];
    return typeof delta === "string" && delta !== "" ? { kind: "text", text: delta } : undefined;
  }
  if (type === "tool_execution_start") {
    const name = record?.["toolName"];
    return typeof name === "string" && name !== ""
      ? { kind: "tool", text: `⋯ ${name}` }
      : undefined;
  }
  return undefined;
};

/** 实时流的只读面。 */
export interface LiveFeed {
  /** 最近几行（工具标记在前，文本在后）。 */
  lines(max?: number): readonly string[];
  /** 还没有任何内容。 */
  isEmpty(): boolean;
  /** 取消订阅并清定时器。 */
  stop(): void;
}

/** 能订阅的会话面：`AgentSession.subscribe` 的子集。 */
export interface StreamSource {
  subscribe?(listener: (event: unknown) => void): () => void;
}

/**
 * 建一条实时流：订阅会话事件、累积文本尾巴、按节流回调请求重绘。
 * @param source - worker 会话；没有 `subscribe` 时退化成空流（测试替身常见）。
 * @param onUpdate - 节流后的重绘请求。
 * @param throttleMs - 节流窗口，默认 200ms。
 * @returns 实时流。
 */
export const createLiveFeed = (
  source: StreamSource | undefined,
  onUpdate: () => void,
  throttleMs: number = STREAM_THROTTLE_MS,
): LiveFeed => {
  let tail = "";
  let tools: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const flush = (): void => {
    timer = undefined;
    if (stopped) return;
    onUpdate();
  };

  const touch = (): void => {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(flush, throttleMs);
    timer.unref?.();
  };

  const listener = (event: unknown): void => {
    const chunk = streamChunkOf(event);
    if (chunk === undefined) return;
    if (chunk.kind === "text") {
      tail = `${tail}${chunk.text}`;
      if (tail.length > STREAM_TAIL_CHARS) tail = tail.slice(-STREAM_TAIL_CHARS);
    } else {
      tools = [...tools, chunk.text].slice(-1);
    }
    touch();
  };

  const unsubscribe = source?.subscribe?.(listener);

  return {
    lines(max: number = STREAM_MAX_LINES): readonly string[] {
      const text = tail
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      const budget = Math.max(1, max - tools.length);
      return [...tools, ...text.slice(-budget)].slice(-max);
    },
    isEmpty: () => tools.length === 0 && tail.trim() === "",
    stop(): void {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      unsubscribe?.();
    },
  };
};

/**
 * 从左边裁到给定宽度（保留尾部）：流式文本最有用的是最新几个字。
 * @param text - 单行文本。
 * @param width - 可用列数。
 * @returns 放得下的尾巴，裁过时前面加省略号。
 */
export const tailToWidth = (text: string, width: number): string => {
  if (width <= 0) return "";
  const total = visibleWidth(text);
  if (total <= width) return text;
  if (width === 1) return "…";
  return `…${sliceByColumn(text, total - (width - 1), width - 1, true)}`;
};

/** 详情浮层的内容来源：每次重绘重新取一遍，状态可能已经变了。 */
export interface DetailContent {
  /** 标题行（`note 07 · in_progress`）。 */
  readonly heading: string;
  /** 标题下面的正文行（未截断，渲染时按宽度折行）。 */
  readonly body: readonly string[];
  /** 实时流行（已按节流更新）。 */
  readonly live: readonly string[];
  /** 该 note 现在是否在执行。 */
  readonly running: boolean;
  /** 提示行（如读取失败）。 */
  readonly notice?: string;
}

/** 详情浮层的渲染：内容行 + 分隔线 + 底部键位提示。 */
export const renderDetailLines = (
  content: DetailContent,
  width: number,
  theme: Theme,
): readonly string[] => {
  const lines: string[] = [truncateToWidth(theme.bold(theme.fg("accent", content.heading)), width)];
  for (const raw of content.body) {
    if (raw === "") {
      lines.push("");
      continue;
    }
    for (const line of wrapTextWithAnsi(raw, Math.max(1, width))) {
      lines.push(truncateToWidth(line, width));
    }
  }
  if (content.notice !== undefined) lines.push(theme.fg("warning", content.notice));
  if (content.running || content.live.length > 0) {
    lines.push("");
    lines.push(theme.fg("accent", "实时流"));
    if (content.live.length === 0) {
      lines.push(theme.fg("dim", "（等待输出…）"));
    } else {
      for (const line of content.live) lines.push(theme.fg("dim", tailToWidth(line, width)));
    }
  }
  lines.push("");
  lines.push(theme.fg("dim", `Esc 或点 ${DETAIL_CLOSE_GLYPH} 关闭`));
  return lines;
};

/** 按可见宽度补空格到 `width` 列。 */
const padTo = (text: string, width: number): string => {
  const clipped = truncateToWidth(text, width, "");
  const gap = width - visibleWidth(clipped);
  return gap > 0 ? `${clipped}${" ".repeat(gap)}` : clipped;
};

/**
 * 渲染**只有卡片本体**的那几行（不铺满、不居中）：宿主把这几行贴在 `anchor: "center"` 的位置，
 * 上边框右上角带一个 `×` 关闭位。
 * @param body - 已按内容宽度渲染好的卡片内容行。
 * @param width - 卡片总宽（含边框）。
 * @param border - 边框上色回调（调用方传 `theme.fg("warning", …)`，与侧栏的 `accent` 分开）。
 * @returns 逐行文本，宽度正好是 `width`。
 */
export const renderDetailCard = (
  body: readonly string[],
  width: number,
  border: (text: string) => string = (text) => text,
): readonly string[] => {
  const cardWidth = Math.max(8, width);
  const innerWidth = cardWidth - 2;
  const contentWidth = Math.max(1, cardWidth - 4);
  // 上边框末列放 `×`：`┌` + 横线(innerWidth-1) + `×` + `┐` = cardWidth。
  const top = `${"┌"}${"─".repeat(Math.max(0, innerWidth - 1))}${DETAIL_CLOSE_GLYPH}┐`;
  return [
    border(top),
    ...body.map((line) => `${border("│")} ${padTo(line, contentWidth)} ${border("│")}`),
    border(`└${"─".repeat(innerWidth)}┘`),
  ];
};

/**
 * 详情浮层组件：只返回卡片本体那几行；`×` 关闭，`Esc` 由侧栏的输入监听消费。
 *
 * `handleMouse` 只在卡片矩形内收到事件（宿主按 overlay 矩形命中），所以这里**没有**“点外部关闭”
 * 分支：那正是透明浮层的代价，写进 README 与 note。
 * @param theme - 主题。
 * @param options - 内容来源与关闭回调。
 * @returns 组件。
 */
export const createDetailComponent = (
  theme: Theme,
  options: { content: () => DetailContent; onClose: () => void },
): Component => {
  let cardWidth = DETAIL_WIDTH;
  return {
    render(width: number): string[] {
      cardWidth = Math.max(8, width);
      const body = renderDetailLines(options.content(), Math.max(1, cardWidth - 4), theme);
      return [...renderDetailCard(body, cardWidth, (text) => theme.fg("warning", text))];
    },
    handleMouse(event): { handled: boolean } {
      // press / release 也接住：宿主靠它们记住 pressed target，click 才会派回来。
      if (event.type !== "click") return { handled: true };
      // `×` 吃右上角一小段（上边框最后三格），命中就关；卡片内其它位置不做事。
      if (event.y === 0 && event.x >= cardWidth - 3) options.onClose();
      return { handled: true };
    },
    invalidate(): void {
      // 没有缓存。
    },
  };
};
