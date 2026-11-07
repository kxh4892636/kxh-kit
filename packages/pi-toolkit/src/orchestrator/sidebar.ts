/**
 * Orchestrator 的 TUI 侧边栏：右上角图标 + 右侧常驻列表（按 Plan 分组）+ note 详情浮层。
 *
 * 形态是 **overlay**，不是真分栏（宿主布局纯竖直）。三个实测结论：
 *
 * 1. `nonCapturing: true` **不影响鼠标点击**：命中测试是几何的 —— `compositeOverlays` 把
 *    所有可见 overlay 放进 `renderedOverlayLayouts`，`dispatchMouseToOverlay` 只比行列，
 *    只有“是否抢焦点”看 `nonCapturing`。所以条目与图标都能点，不需要 capturing。
 *    但鼠标本身**只在 fullscreen（alt-screen）** 存在（`TuiMainScreen` 完全没有鼠标处理）。
 * 2. main screen（`regular`）里 overlay 合成在 transcript 的行上，那些行一旦滚进 scrollback
 *    就再也重绘不到 → 可能留残影。因此侧栏与图标**只在 `tui.mode === "fullscreen"`** 显示，
 *    不做“仅提示”的折中。
 * 3. 窄终端：侧栏固定 32 列，终端窄于 `SIDEBAR_MIN_COLUMNS`（100）时整块隐藏（会盖住正文）。
 *    图标保留（否则没有任何入口），点它会收到一条 notify 说明“为什么看不到侧栏”—— 不静默。
 *
 * `Esc` 分两层：详情浮层是 capturing 的，`Esc` 关掉它；紧接着的再一个 `Esc` 收起侧栏
 * （由 `addInputListener` 的“armed”状态消费，平时不抢编辑器的 `Esc`）。
 * @module @kxh4892636/pi-toolkit/orchestrator/sidebar
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  type Component,
  type OverlayHandle,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { DEFAULT_DOMAIN_ROOT, type OrchestratorSettings } from "./config.ts";
import type { NoteNeeds, NoteStatus } from "./dag.ts";
import {
  createLiveFeed,
  createDetailComponent,
  type DetailContent,
  type LiveFeed,
} from "./detail-overlay.ts";
import { findEntryByNote, runningNotesOf, type WorkerRegistry } from "./handles.ts";
import { activePlans, listPlans, planRefOf, type PlanRef } from "./plan.ts";
import { loadDocument } from "./store.ts";

/** 侧栏宽度（列）：固定 32，窄终端整块隐藏而不是缩窄。 */
export const SIDEBAR_WIDTH = 32;
/** 侧栏要求的最小终端宽度：再窄就盖住正文了。 */
export const SIDEBAR_MIN_COLUMNS = 100;
/**
 * 列表刷新间隔（毫秒）。
 *
 * 5s：列表只是状态快照，读盘 + 整帧重绘都不便宜；**实时流不走这个节奏**，
 * 它由 `STREAM_THROTTLE_MS`（200ms）单独节流。
 */
export const SIDEBAR_REFRESH_MS = 5_000;
/** 承载侧栏的 widget 键（唯一一个，`dispose` 时清掉）。 */
export const SIDEBAR_WIDGET_KEY = "orchestrator-sidebar";
/** 显示侧栏的图标。 */
export const ICON_OPEN = "▤";
/** 侧栏收起后的图标（同一位置，提示可以再点开）。 */
export const ICON_CLOSED = "▥";
/** 图标 overlay 宽度。 */
export const ICON_WIDTH = 3;
/** 列表顶部的固定行数：汇总 + 空行；鼠标 `y` 减去它才是行下标。 */
export const SIDEBAR_HEADER_ROWS = 2;
/** 折叠行文案里的“已完成”前缀。 */
export const COMPLETED_LABEL = "已完成";

/** 状态符号：单列，尽量不与终端宽字符冲突。 */
export const STATUS_MARKS: Readonly<Record<NoteStatus, string>> = {
  pending: "·",
  in_progress: "●",
  waiting: "◆",
  blocked: "⊘",
  completed: "✓",
};

/** 列表里的一条 note。 */
export interface SidebarNote {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: NoteStatus;
  readonly needs?: NoteNeeds;
  readonly blockedReason?: string;
  /** 有 worker 正领这条 note。 */
  readonly running: boolean;
}

/** 一个 Plan 分组。 */
export interface SidebarPlan {
  /** `<domain>/<lifecycle>/<name>`。 */
  readonly ref: string;
  /** 目录名（去掉日期前缀后展示）。 */
  readonly name: string;
  readonly notes: readonly SidebarNote[];
}

/** 列表的一行；点击行为由 `kind` 决定。 */
export interface SidebarRow {
  readonly kind: "plan" | "note" | "fold" | "spacer";
  readonly text: string;
  readonly plan?: string;
  readonly note?: string;
  readonly status?: NoteStatus;
  readonly running?: boolean;
}

/** 一帧列表：汇总行 + 行数组。 */
export interface SidebarView {
  readonly header: string;
  readonly rows: readonly SidebarRow[];
}

/** 汇总：执行中 / 待确认 / 阻塞 / 总数。 */
export interface SidebarTotals {
  readonly running: number;
  readonly waiting: number;
  readonly blocked: number;
  readonly notes: number;
}

/** note 的状态符号；`waiting` 按 `needs` 再分一档（等人回答 `?`）。 */
export const noteMark = (note: Pick<SidebarNote, "status" | "needs">): string =>
  note.status === "waiting" && note.needs === "answer" ? "?" : STATUS_MARKS[note.status];

/** note 状态的展示名：`waiting` 带上 `needs`。 */
export const noteStatusLabel = (note: Pick<SidebarNote, "status" | "needs">): string =>
  note.status === "waiting" ? `waiting/${note.needs ?? "review"}` : note.status;

/** Plan 目录名去掉 `YYYY-MM-DD-` 前缀，32 列里才放得下。 */
export const shortPlanName = (name: string): string => name.replace(/^\d{4}-\d{2}-\d{2}-/u, "");

/** 状态排序：正在跑的最靠上，已完成的沉底。 */
const STATUS_ORDER: Readonly<Record<NoteStatus, number>> = {
  in_progress: 0,
  waiting: 1,
  blocked: 2,
  pending: 3,
  completed: 4,
};

/** 汇总一行里要的数。 */
export const sidebarTotals = (plans: readonly SidebarPlan[]): SidebarTotals => {
  let running = 0;
  let waiting = 0;
  let blocked = 0;
  let notes = 0;
  for (const plan of plans) {
    for (const note of plan.notes) {
      notes += 1;
      if (note.running) running += 1;
      if (note.status === "waiting") waiting += 1;
      if (note.status === "blocked") blocked += 1;
    }
  }
  return { running, waiting, blocked, notes };
};

/** 汇总行文案。 */
export const headerText = (totals: SidebarTotals): string => {
  const blocked = totals.blocked === 0 ? "" : ` · ${totals.blocked} 阻塞`;
  return `${ICON_OPEN} ${totals.running} 执行 · ${totals.waiting} 待确认${blocked}`;
};

const noteRow = (plan: SidebarPlan, note: SidebarNote): SidebarRow => ({
  kind: "note",
  text: `${note.running ? "▶" : noteMark(note)} ${note.id} ${note.title}`,
  plan: plan.ref,
  note: note.id,
  status: note.status,
  running: note.running,
});

/**
 * 构建一帧列表：按 Plan 分组，未完成的按状态排，已完成的默认折叠成一行。
 * @param plans - 各 Plan 的 note（只含 active Plan）。
 * @param expanded - 已展开“已完成”的 Plan ref 集合。
 * @returns 汇总与行。
 */
export const buildSidebarView = (
  plans: readonly SidebarPlan[],
  expanded: Iterable<string> = [],
): SidebarView => {
  const open = new Set(expanded);
  const rows: SidebarRow[] = [];
  for (const plan of plans) {
    if (rows.length > 0) rows.push({ kind: "spacer", text: "" });
    rows.push({ kind: "plan", text: `▾ ${shortPlanName(plan.name)}`, plan: plan.ref });
    const undone = plan.notes
      .filter((note) => note.status !== "completed")
      .sort(
        (left, right) =>
          STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || left.id.localeCompare(right.id),
      );
    for (const note of undone) rows.push(noteRow(plan, note));
    const done = plan.notes
      .filter((note) => note.status === "completed")
      .sort((left, right) => left.id.localeCompare(right.id));
    if (done.length === 0) continue;
    const isOpen = open.has(plan.ref);
    rows.push({
      kind: "fold",
      text: `${COMPLETED_LABEL} ${done.length} 条 ${isOpen ? "▾" : "▸"}`,
      plan: plan.ref,
    });
    if (isOpen) for (const note of done) rows.push(noteRow(plan, note));
  }
  return { header: headerText(sidebarTotals(plans)), rows };
};

const renderRow = (row: SidebarRow, width: number, theme: Theme): string => {
  switch (row.kind) {
    case "plan":
      return truncateToWidth(theme.bold(row.text), width);
    case "note":
      return truncateToWidth(
        row.running === true
          ? theme.fg("accent", row.text)
          : row.status === "completed"
            ? theme.fg("dim", row.text)
            : row.text,
        width,
      );
    case "fold":
      return truncateToWidth(theme.fg("dim", row.text), width);
    case "spacer":
      return "";
  }
};

/**
 * 渲染一帧列表；行与 `view.rows` 一一对应（下标 = 鼠标 `y` - `SIDEBAR_HEADER_ROWS`）。
 * @param view - 一帧列表。
 * @param width - 可用列数。
 * @param theme - 主题。
 * @returns 逐行文本。
 */
export const renderSidebarLines = (
  view: SidebarView,
  width: number,
  theme: Theme,
): readonly string[] => {
  const lines = [truncateToWidth(theme.bold(theme.fg("accent", view.header)), width), ""];
  for (const row of view.rows) lines.push(renderRow(row, width, theme));
  return lines;
};

/** 鼠标事件里属于“点了一下”的那类；其余返回 false。 */
const isClick = (event: TuiMouseEvent): boolean => event.type === "click";

/** 侧栏组件：只负责渲染与把点击换算成行。 */
export const createSidebarComponent = (options: {
  view: () => SidebarView;
  theme: Theme;
  onRow: (row: SidebarRow) => void;
}): Component => ({
  render(width: number): string[] {
    return [...renderSidebarLines(options.view(), width, options.theme)];
  },
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    // press / release 也要接住：宿主靠它们记住 pressed target，click 才会派回这里。
    if (!isClick(event)) return { handled: true };
    const row = options.view().rows[event.y - SIDEBAR_HEADER_ROWS];
    if (row === undefined || row.kind === "spacer") return { handled: true };
    options.onRow(row);
    return { handled: true };
  },
  invalidate(): void {
    // 没有缓存。
  },
});

/** 右上角图标组件：一次点击切换侧栏显示。 */
export const createIconComponent = (options: {
  open: () => boolean;
  theme: Theme;
  onClick: () => void;
}): Component => ({
  render(): string[] {
    const icon = options.open() ? ICON_OPEN : ICON_CLOSED;
    return [options.theme.fg("accent", icon)];
  },
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!isClick(event)) return { handled: true };
    options.onClick();
    return { handled: true };
  },
  invalidate(): void {
    // 没有缓存。
  },
});

/** 侧栏控制器。 */
export interface Sidebar {
  /** 每次模式同步时调用：开（且是 tui）→ 挂 overlay + 5s 定时刷新；否则全清。 */
  sync(ctx: ExtensionContext, enabled: boolean): void;
  /** 清定时器、退订阅、隐藏全部 overlay。幂等。 */
  dispose(): void;
}

/** 控制器依赖。 */
export interface SidebarDeps {
  readonly registry: WorkerRegistry;
  /** 读 notes.json 用的上限（与工具同一份设置）。 */
  readonly limits: () => OrchestratorSettings;
  /** 领域根，默认 `.agents/domains`。 */
  readonly domainsPath?: string;
}

/**
 * 建一个侧栏控制器。同一时刻只挂一份 overlay；模式关、会话退出、reload 都走 `dispose`。
 * @param deps - 句柄表与设置来源。
 * @returns 控制器。
 */
export const createSidebar = (deps: SidebarDeps): Sidebar => {
  const expanded = new Set<string>();
  const plansByRef = new Map<string, PlanRef>();
  let plans: readonly SidebarPlan[] = [];
  let view: SidebarView = {
    header: headerText({ running: 0, waiting: 0, blocked: 0, notes: 0 }),
    rows: [],
  };
  let ctx: ExtensionContext | undefined;
  let tui: TUI | undefined;
  let theme: Theme | undefined;
  let listHandle: OverlayHandle | undefined;
  let iconHandle: OverlayHandle | undefined;
  let detailHandle: OverlayHandle | undefined;
  let feed: LiveFeed | undefined;
  let detailContent: (() => DetailContent) | undefined;
  let detailTarget: { readonly plan: string; readonly note: string } | undefined;
  let removeInputListener: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let mounted = false;
  let listVisible = true;
  let escArmed = false;
  let lastColumns = 0;

  const requestRender = (): void => {
    tui?.requestRender();
  };

  const closeDetail = (): void => {
    detailHandle?.hide();
    detailHandle = undefined;
    detailContent = undefined;
    detailTarget = undefined;
    feed?.stop();
    feed = undefined;
  };

  /** 详情浮层：快照 + 实时流；capturing 才有 `Esc`。 */
  const openDetail = (planRef: string, noteId: string): void => {
    const localTui = tui;
    const localTheme = theme;
    const plan = plansByRef.get(planRef);
    if (localTui === undefined || localTheme === undefined || plan === undefined) return;
    const snapshot = plans.find((item) => item.ref === planRef)?.notes.find((n) => n.id === noteId);
    if (snapshot === undefined) return;
    closeDetail();
    detailTarget = { plan: planRef, note: noteId };
    const entry = findEntryByNote(deps.registry, plan.directory, noteId);
    if (entry !== undefined) feed = createLiveFeed(entry.session, requestRender);
    const note = (): SidebarNote =>
      plans.find((item) => item.ref === planRef)?.notes.find((n) => n.id === noteId) ?? snapshot;
    detailContent = (): DetailContent => {
      const current = note();
      const body = [current.description];
      if (current.status === "blocked" && current.blockedReason !== undefined) {
        body.push("", `阻塞：${current.blockedReason}`);
      }
      body.push("", `Plan: ${planRef}`);
      return {
        heading: `note ${current.id} · ${noteStatusLabel(current)}`,
        body,
        live: feed?.lines() ?? [],
        running: current.running,
        ...(current.description === "" ? { notice: "这条 note 没有摘要" } : {}),
      };
    };
    detailHandle = localTui.showOverlay(
      createDetailComponent(localTheme, {
        content: () =>
          detailContent?.() ?? { heading: `note ${noteId}`, body: [], live: [], running: false },
        // 铺满可用区域才收得到“卡片外部”的点击：宿主 OverlayOptions 没有点击外部关闭的字段。
        area: () => ({ columns: localTui.terminal.columns, rows: localTui.terminal.rows }),
        onClose: () => {
          closeDetail();
          escArmed = true;
          requestRender();
        },
      }),
      { anchor: "top-left", width: "100%", maxHeight: "100%", margin: 0, row: 0, col: 0 },
    );
    requestRender();
  };

  const onRow = (row: SidebarRow): void => {
    if (row.plan === undefined) return;
    if (row.kind === "fold") {
      if (expanded.has(row.plan)) expanded.delete(row.plan);
      else expanded.add(row.plan);
      view = buildSidebarView(plans, expanded);
      requestRender();
      return;
    }
    if (row.kind === "note" && row.note !== undefined) openDetail(row.plan, row.note);
  };

  const toggleList = (): void => {
    if (listVisible && lastColumns > 0 && lastColumns < SIDEBAR_MIN_COLUMNS) {
      // 侧栏本来就因为太窄而隐藏：给一句原因，不做无声的空操作。
      ctx?.ui.notify(
        `侧栏需要 ${SIDEBAR_MIN_COLUMNS} 列以上（当前 ${lastColumns} 列），已隐藏以免盖住正文。`,
        "warning",
      );
      return;
    }
    listVisible = !listVisible;
    requestRender();
  };

  const mountOverlays = (): void => {
    const localTui = tui;
    const localTheme = theme;
    if (localTui === undefined || localTheme === undefined) return;
    iconHandle = localTui.showOverlay(
      createIconComponent({ open: () => listVisible, theme: localTheme, onClick: toggleList }),
      {
        anchor: "top-right",
        width: ICON_WIDTH,
        maxHeight: 1,
        margin: { top: 0, right: 0 },
        nonCapturing: true,
        visible: () => localTui.mode === "fullscreen",
      },
    );
    listHandle = localTui.showOverlay(
      createSidebarComponent({ view: () => view, theme: localTheme, onRow }),
      {
        anchor: "right-center",
        width: SIDEBAR_WIDTH,
        maxHeight: "100%",
        margin: 0,
        nonCapturing: true,
        visible: (width) => {
          lastColumns = width;
          return localTui.mode === "fullscreen" && width >= SIDEBAR_MIN_COLUMNS && listVisible;
        },
      },
    );
    removeInputListener = localTui.addInputListener((data) => {
      // 只在“刚从详情层退出”时消费一个 Esc：平时不抢编辑器的 Esc。
      if (!escArmed) return undefined;
      escArmed = false;
      if (!matchesKey(data, "escape") || !listVisible) return undefined;
      listVisible = false;
      requestRender();
      return { consume: true };
    });
  };

  const refresh = async (): Promise<void> => {
    const localCtx = ctx;
    if (!mounted || localCtx === undefined) return;
    try {
      const discovered = activePlans(
        await listPlans(localCtx.cwd, deps.domainsPath ?? DEFAULT_DOMAIN_ROOT),
      );
      plansByRef.clear();
      const next: SidebarPlan[] = [];
      for (const plan of discovered) {
        const ref = planRefOf(plan);
        plansByRef.set(ref, plan);
        let document;
        try {
          document = await loadDocument(plan.directory, deps.limits());
        } catch {
          continue;
        }
        const running = runningNotesOf(deps.registry, plan.directory);
        next.push({
          ref,
          name: plan.name,
          notes: document.notes.map((note) => ({
            id: note.id,
            title: note.title,
            description: note.description,
            status: note.status,
            ...(note.needs === undefined ? {} : { needs: note.needs }),
            ...(note.blocked_reason === undefined ? {} : { blockedReason: note.blocked_reason }),
            running: running.has(note.id),
          })),
        });
      }
      plans = next;
      const nextView = buildSidebarView(plans, expanded);
      if (JSON.stringify(nextView) !== JSON.stringify(view)) {
        view = nextView;
        requestRender();
      }
      if (feed !== undefined && detailTarget !== undefined) {
        // worker 结束就退订阅；浮层留着显示最终状态。
        const target = detailTarget;
        const stillRunning = next
          .find((plan) => plan.ref === target.plan)
          ?.notes.some((note) => note.id === target.note && note.running);
        if (stillRunning !== true) {
          feed.stop();
          feed = undefined;
          requestRender();
        }
      }
    } catch {
      // 读盘失败保留上一帧，下一次 tick 再试。
    }
  };

  const teardown = (): void => {
    mounted = false;
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    removeInputListener?.();
    removeInputListener = undefined;
    closeDetail();
    listHandle?.hide();
    listHandle = undefined;
    iconHandle?.hide();
    iconHandle = undefined;
    tui = undefined;
    theme = undefined;
    escArmed = false;
    listVisible = true;
    plans = [];
    plansByRef.clear();
    view = { header: headerText({ running: 0, waiting: 0, blocked: 0, notes: 0 }), rows: [] };
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
      if (mounted) return;
      mounted = true;
      next.ui.setWidget(
        SIDEBAR_WIDGET_KEY,
        (widgetTui, widgetTheme) => {
          // 工厂只在 setWidget 时调一次：这里就是拿 tui / theme 建 overlay 的时机。
          tui = widgetTui;
          theme = widgetTheme;
          if (mounted) mountOverlays();
          return {
            render: () => [],
            invalidate: () => undefined,
            dispose: () => {
              // 宿主替换或清空 widget（reload / 退出）时也要把 overlay 收干净。
              if (mounted) teardown();
            },
          };
        },
        { placement: "belowEditor" },
      );
      if (timer === undefined) {
        timer = setInterval(() => {
          void refresh();
        }, SIDEBAR_REFRESH_MS);
        timer.unref?.();
      }
      void refresh();
    },
    dispose(): void {
      const localCtx = ctx;
      if (mounted) {
        teardown();
        localCtx?.ui.setWidget(SIDEBAR_WIDGET_KEY, undefined);
      }
    },
  };
};
