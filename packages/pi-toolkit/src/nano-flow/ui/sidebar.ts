/**
 * Note 侧栏（fullscreen）：已绑定 Plan 时始终挂载，列出未完成 note，点击出详情卡。
 * 右上角图标在边框之外、与侧栏右缘对齐（单独一个 1 列 overlay，边框外不铺空格以免
 * 抹掉底行背景），点击整块收放（折叠只留图标）。
 * 只做三件事：overlay、鼠标命中与 Esc 关闭；没有分组、实时流与定时轮询。
 * 数据由 register 在 turn_end 时刷新一次。
 * @module @kxh4892636/pi-toolkit/nano-flow/ui/sidebar
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type OverlayHandle,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";

import { type NanoNote, type PanelStatus } from "../notes.ts";

/** 侧栏宽度（列）。 */
export const SIDEBAR_WIDTH = 40;
/** 文本可用宽度：减去左右竖线与内距。 */
const TEXT_WIDTH = SIDEBAR_WIDTH - 4;
/** 终端窄于该宽度时整块隐藏，避免盖住正文。 */
export const SIDEBAR_MIN_COLUMNS = 110;
/** 承载侧栏的 widget 键。 */
export const SIDEBAR_WIDGET_KEY = "nano-flow-notes";
/** 侧栏标题；书本图标已移到框外右上角，标题不再带前缀。 */
const SIDEBAR_TITLE = "Note";
/** 折叠图标：边框之上的右上角、与侧栏右缘对齐；折叠时整块只剩它。 */
const TOGGLE_GLYPH = "▤";
/** 空态文案：未完成 note 为 0 时占一行，不可点击。 */
const EMPTY_TEXT = "全部完成";

/** 侧栏一帧的数据。 */
export interface SidebarSnapshot {
  /** Plan 名（目录名）。 */
  readonly planName: string;
  readonly notes: readonly NanoNote[];
}

/** 状态中文名。 */
const STATUS_LABEL: Record<PanelStatus, string> = {
  pending: "待处理",
  in_progress: "进行中",
  blocked: "阻塞",
};

const statusStyle = (status: PanelStatus, theme: Theme, text: string): string =>
  status === "blocked"
    ? theme.fg("warning", text)
    : status === "in_progress"
      ? theme.fg("accent", text)
      : theme.fg("dim", text);

/** 详情卡片：标题行带 ×、正文为概述/原因/下一步，Esc 或点击 × 关闭。 */
interface DetailCardOptions {
  readonly note: () => NanoNote;
  readonly theme: Theme;
  readonly onClose: () => void;
}

const DETAIL_WIDTH = 48;
/** 详情卡与侧栏之间的列间距。 */
const DETAIL_GAP = 2;
/** 关闭图标：比 `×` 更宽更重的叉，1 列宽。 */
const CLOSE_GLYPH = "✕";
/** 关闭图标的主题色：与青色边框区分明显的黄。 */
const CLOSE_COLOR = "warning";
/** 关闭命中区间宽度（列，从标题行右端算起）：图标加左右各一列空白，点偏了也算。 */
const CLOSE_HIT_COLUMNS = 4;

const cardLines = (note: NanoNote, theme: Theme): string[] => {
  const inner = DETAIL_WIDTH - 2;
  const body: string[] = [];
  const add = (text: string): void => {
    for (const line of wrapTextWithAnsi(text, inner - 2)) body.push(line);
  };
  add(note.description.trim() === "" ? "（没有概述）" : note.description);
  if (note.reason !== undefined) add(`原因：${note.reason}`);
  if (note.nextStep !== undefined) add(`下一步：${note.nextStep}`);
  add("Esc 关闭");
  const heading = `◇ note ${note.name} · ${STATUS_LABEL[note.status]}`;
  const title = truncateToWidth(heading, inner - 4, "…");
  // 末两列留给「 ✕」；标题行与正文行同宽，保持 48 列。
  const pad = " ".repeat(Math.max(0, inner - 3 - visibleWidth(title)));
  // 关闭图标单独着色并加粗：整行都用边框色时它太不显眼。
  const titleRow = `${theme.fg("border", `│ ${title}${pad}`)}${theme.bold(
    theme.fg(CLOSE_COLOR, CLOSE_GLYPH),
  )}${theme.fg("border", " │")}`;
  const lines = [`┌${"─".repeat(inner)}┐`, titleRow, `│${" ".repeat(inner)}│`];
  for (const line of body) {
    const clipped = truncateToWidth(line, inner - 2, "…");
    lines.push(`│ ${clipped}${" ".repeat(Math.max(0, inner - visibleWidth(clipped) - 2))} │`);
  }
  lines.push(`└${"─".repeat(inner)}┘`);
  return lines.map((line, index) => (index === 1 ? line : theme.fg("border", line)));
};

const createDetailCard = (options: DetailCardOptions): Component => ({
  render(): string[] {
    return cardLines(options.note(), options.theme);
  },
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    // 标题行末几列（含图标两侧的空白）都算点击关闭：图标只有 1 列，命中区给宽一点。
    if (isClick(event) && event.y === 1 && event.x >= DETAIL_WIDTH - CLOSE_HIT_COLUMNS) {
      options.onClose();
    }
    return { handled: true };
  },
  invalidate(): void {
    // 无缓存。
  },
});

/** 侧栏控制器。 */
export interface NotesSidebar {
  sync(ctx: ExtensionContext, enabled: boolean): void;
  /** 重读数据并重绘；turn_end / 绑定后调用。 */
  refresh(): void;
  dispose(): void;
}

/** 侧栏依赖：数据快照由 register 注入（读绑定 + 读 note 文件）。 */
export interface NotesSidebarDeps {
  readonly snapshot: (ctx: ExtensionContext) => SidebarSnapshot | null;
}

/** 一行：标题、空态文案或一条 note。 */
interface Row {
  readonly kind: "title" | "empty" | "note";
  readonly text: string;
  readonly note?: NanoNote;
}

const isClick = (event: TuiMouseEvent): boolean => event.type === "click";

/** 由点击事件算出详情卡左上角：与所点 note 行同高，落在侧栏左侧。 */
const detailOrigin = (event: TuiMouseEvent): { row: number; col: number } => {
  const row = Number.isFinite(event.screenY) ? event.screenY : 0;
  const sidebarCol = Number.isFinite(event.screenX)
    ? event.screenX - event.x
    : DETAIL_WIDTH + DETAIL_GAP;
  return { row, col: sidebarCol - DETAIL_WIDTH - DETAIL_GAP };
};

/** 建一个 fullscreen Note 侧栏。 */
export const createNotesSidebar = (deps: NotesSidebarDeps): NotesSidebar => {
  let ctx: ExtensionContext | undefined;
  let tui: TUI | undefined;
  let theme: Theme | undefined;
  let listHandle: OverlayHandle | undefined;
  let iconHandle: OverlayHandle | undefined;
  let detailHandle: OverlayHandle | undefined;
  let detailNote: NanoNote | undefined;
  let removeInputListener: (() => void) | undefined;
  let mounted = false;
  let collapsed = false;
  let rows: Row[] = [];

  const requestRender = (): void => {
    tui?.requestRender();
  };

  const closeDetail = (): void => {
    detailHandle?.hide();
    detailHandle = undefined;
    detailNote = undefined;
  };

  const openDetail = (note: NanoNote, origin: { row: number; col: number }): void => {
    const localTui = tui;
    const localTheme = theme;
    if (localTui === undefined || localTheme === undefined) return;
    closeDetail();
    detailNote = note;
    detailHandle = localTui.showOverlay(
      createDetailCard({
        note: () => detailNote ?? note,
        theme: localTheme,
        onClose: () => {
          closeDetail();
          requestRender();
        },
      }),
      {
        // 悬浮在所点 note 行的左下侧：顶端对齐该行，右缘离侧栏留出 DETAIL_GAP。
        row: origin.row,
        col: origin.col,
        width: DETAIL_WIDTH,
        maxHeight: "80%",
        nonCapturing: true,
      },
    );
    requestRender();
  };

  /** 空数组＝不挂载内容（没绑定 Plan 或目录失效）；否则标题行常驻。 */
  const view = (): Row[] => {
    const snapshot = ctx === undefined ? null : deps.snapshot(ctx);
    if (snapshot === null) return [];
    const rows: Row[] = [
      {
        kind: "title",
        text: truncateToWidth(`${SIDEBAR_TITLE} · ${snapshot.planName}`, TEXT_WIDTH, "…"),
      },
    ];
    if (snapshot.notes.length === 0) {
      rows.push({ kind: "empty", text: EMPTY_TEXT });
      return rows;
    }
    for (const note of snapshot.notes) {
      rows.push({
        kind: "note",
        note,
        text: truncateToWidth(`${STATUS_LABEL[note.status]} · ${note.name}`, TEXT_WIDTH, "…"),
      });
    }
    return rows;
  };

  const rowText = (row: Row, localTheme: Theme): string => {
    if (row.kind === "title") return localTheme.bold(row.text);
    if (row.kind === "empty") return localTheme.fg("dim", row.text);
    return statusStyle((row.note as NanoNote).status, localTheme, row.text);
  };

  const renderLines = (localTheme: Theme): string[] => {
    const inner = SIDEBAR_WIDTH - 2;
    const border = (text: string): string => localTheme.fg("border", text);
    const lines = [border(`┌${"─".repeat(inner)}┐`)];
    for (const row of rows) {
      const text = rowText(row, localTheme);
      const clipped = truncateToWidth(text, inner - 2, "");
      lines.push(
        `${border("│")} ${clipped}${" ".repeat(Math.max(0, inner - visibleWidth(clipped) - 2))} ${border("│")}`,
      );
    }
    lines.push(border(`└${"─".repeat(inner)}┘`));
    return lines.map((line) => truncateToWidth(line, SIDEBAR_WIDTH, ""));
  };

  const toggleCollapsed = (): void => {
    collapsed = !collapsed;
    if (collapsed) closeDetail();
    requestRender();
  };

  const mountOverlays = (): void => {
    const localTui = tui;
    const localTheme = theme;
    if (localTui === undefined || localTheme === undefined) return;
    // overlay 是逐字符合成的，铺空格就会把底行背景抹成默认底色；
    // 所以图标单独用一个 1 列 overlay 画，边框外不再占任何空格。
    const visible = (width: number): boolean =>
      localTui.mode === "fullscreen" && width >= SIDEBAR_MIN_COLUMNS && rows.length > 0;
    listHandle = localTui.showOverlay(
      {
        render: () => (rows.length === 0 || collapsed ? [] : renderLines(localTheme)),
        handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
          if (!isClick(event)) return { handled: true };
          if (collapsed) return { handled: true };
          // 第 0 行是上边框，第 1 行是标题；note 从第 2 行开始。
          const row = rows[event.y - 1];
          if (row?.kind === "note" && row.note !== undefined)
            openDetail(row.note, detailOrigin(event));
          return { handled: true };
        },
        invalidate: () => undefined,
      },
      {
        anchor: "top-right",
        width: SIDEBAR_WIDTH,
        maxHeight: "100%",
        // 顶部留一行给图标，图标落在框体右缘正上方。
        margin: { top: 1, right: 1, bottom: 1, left: 1 },
        nonCapturing: true,
        visible,
      },
    );
    iconHandle = localTui.showOverlay(
      {
        render: () => [localTheme.fg("border", TOGGLE_GLYPH)],
        handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
          if (isClick(event)) toggleCollapsed();
          return { handled: true };
        },
        invalidate: () => undefined,
      },
      {
        anchor: "top-right",
        width: 1,
        maxHeight: 1,
        margin: { top: 1, right: 1 },
        nonCapturing: true,
        visible,
      },
    );
    removeInputListener = localTui.addInputListener((data) => {
      if (detailHandle === undefined) return undefined;
      if (!matchesKey(data, "escape")) return undefined;
      closeDetail();
      requestRender();
      return { consume: true };
    });
  };

  const teardown = (): void => {
    mounted = false;
    removeInputListener?.();
    removeInputListener = undefined;
    closeDetail();
    listHandle?.hide();
    listHandle = undefined;
    iconHandle?.hide();
    iconHandle = undefined;
    tui = undefined;
    theme = undefined;
    rows = [];
  };

  const refresh = (): void => {
    rows = view();
    // 侧栏常驻后 rows 不再为空，改按「卡片所指 note 是否还在列表里」关卡片。
    const openName = detailNote?.name;
    if (openName !== undefined && !rows.some((row) => row.note?.name === openName)) closeDetail();
    requestRender();
  };

  return {
    sync(next: ExtensionContext, enabled: boolean): void {
      ctx = next;
      if (!enabled || next.mode !== "tui") {
        if (mounted) {
          teardown();
          next.ui.setWidget(SIDEBAR_WIDGET_KEY, undefined);
        }
        return;
      }
      if (mounted) {
        refresh();
        return;
      }
      mounted = true;
      next.ui.setWidget(
        SIDEBAR_WIDGET_KEY,
        (widgetTui, widgetTheme) => {
          tui = widgetTui;
          theme = widgetTheme;
          mountOverlays();
          return {
            render: () => [],
            invalidate: () => undefined,
            dispose: () => {
              if (mounted) teardown();
            },
          };
        },
        { placement: "belowEditor" },
      );
      refresh();
    },
    refresh,
    dispose(): void {
      const localCtx = ctx;
      if (mounted) {
        teardown();
        localCtx?.ui.setWidget(SIDEBAR_WIDGET_KEY, undefined);
      }
    },
  };
};
