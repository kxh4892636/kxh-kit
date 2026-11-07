/**
 * Orchestrator 的 TUI 侧边栏：右上角图标 + 右侧常驻列表（Plan → worker 组 → note）+ note 详情浮层。
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
 * `Esc` 只有一层：详情开着时关掉详情，**不动侧栏**（侧栏只由右上角 `▤` 图标切换）。
 * 详情浮层是 `nonCapturing` 且只占卡片矩形（外部真透明，见 `detail-overlay.ts`），
 * 所以 `Esc` 由本文件的 `addInputListener` 统一消费，编辑器焦点不丢。
 * @module @kxh4892636/pi-toolkit/orchestrator/sidebar
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type OverlayHandle,
  type OverlayMargin,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { DEFAULT_DOMAIN_ROOT, type OrchestratorSettings } from "./config.ts";
import type { NoteNeeds, NoteStatus } from "./dag.ts";
import {
  createLiveFeed,
  createDetailComponent,
  DETAIL_MAX_HEIGHT,
  DETAIL_WIDTH,
  type DetailContent,
  type LiveFeed,
} from "./detail-overlay.ts";
import {
  findEntryByNote,
  planDirectoryOf,
  runningNotesOf,
  type WorkerRegistry,
} from "./handles.ts";
import { activePlans, listPlans, planRefOf, type PlanRef } from "./plan.ts";
import { loadDocument } from "./store.ts";

/** 侧栏宽度（列）：固定 40（内容宽，屏幕实际占 42 = 40 + 左右各 1 margin），窄终端整块隐藏而不是缩窄。 */
export const SIDEBAR_WIDTH = 40;
/**
 * 侧栏文本可用宽度：`SIDEBAR_WIDTH` 减左右竖线（2）与两侧内距（2）。
 * 行构建时按它截标题，保证状态与序号不被截掉。
 */
export const SIDEBAR_TEXT_WIDTH = SIDEBAR_WIDTH - 4;
/**
 * 侧栏要求的最小终端宽度：再窄就盖住正文了。
 *
 * 数字依据：40 列的侧栏加上左右 margin 占 42 屏幕列。旧的 32 列侧栏在 100 列终端上留给正文
 * `100 - 34 = 66` 列；若阈值仍为 100，40 列下正文只剩 `100 - 42 = 58` 列（不足一半）。
 * 取 **110** 使得正文至少 `110 - 42 = 68` 列，与旧的 100/34 体感一致。
 */
export const SIDEBAR_MIN_COLUMNS = 110;
/**
 * 列表刷新间隔（毫秒）。
 *
 * 3s：列表只是状态快照，读盘 + 整帧重绘都不便宜，但 5s 的感知延迟偏高；
 * **实时流不走这个节奏**，它由 `STREAM_THROTTLE_MS`（200ms）单独节流，两者独立。
 */
export const SIDEBAR_REFRESH_MS = 3_000;
/** 承载侧栏的 widget 键（唯一一个，`dispose` 时清掉）。 */
export const SIDEBAR_WIDGET_KEY = "orchestrator-sidebar";
/** 显示侧栏的图标。 */
export const ICON_OPEN = "▤";
/** 侧栏收起后的图标（同一位置，提示可以再点开）。 */
export const ICON_CLOSED = "▥";
/** 图标 overlay 宽度；与侧栏右边缘对齐，正好“挂”在侧栏顶部。 */
export const ICON_WIDTH = 3;
/** 图标 overlay 占的行数（一行）。 */
export const ICON_ROWS = 1;
/**
 * 列表顶部的固定行数：只有上边框（含标题）那一行，没有汇总行。
 * 鼠标 `y` 减去它才是行下标。
 */
export const SIDEBAR_HEADER_ROWS = 1;
/** 侧栏外框标题：与详情卡片的 `◇ note …` 一眼区分开。 */
export const SIDEBAR_TITLE = "▤ Note 状态";
/** 侧栏/图标与终端右边缘的留白（列），也是两者右对齐的基准。 */
export const SIDEBAR_MARGIN = 1;

/**
 * 侧栏在终端里的列区间 `[left, right)`：右上角对齐，右边缘距终端右侧 `SIDEBAR_MARGIN`。
 *
 * 与宿主 `resolveOverlayLayout` 的算法一致（`anchor: "top-right"` + 右 margin 1 ⇒
 * `col = termWidth - 1 - width`），所以图标可以用同一个 `right` 反推自己的左列。
 * @param termWidth - 终端列数。
 * @returns 宽、左边界（含）、右边界（不含）。
 */
export const sidebarColumns = (
  termWidth: number,
): { readonly width: number; readonly left: number; readonly right: number } => {
  const right = termWidth - SIDEBAR_MARGIN;
  return { width: SIDEBAR_WIDTH, left: right - SIDEBAR_WIDTH, right };
};

/**
 * 图标在终端里的列区间 `[left, right)`：右边缘与侧栏相同，宽度 `ICON_WIDTH`。
 * @param termWidth - 终端列数。
 * @returns 宽、左边界（含）、右边界（不含）。
 */
export const iconColumns = (
  termWidth: number,
): { readonly width: number; readonly left: number; readonly right: number } => {
  const box = sidebarColumns(termWidth);
  return { width: ICON_WIDTH, left: box.right - ICON_WIDTH, right: box.right };
};

/** 侧栏 overlay 的 margin：右边留 gap，上边让出图标那一行。 */
export const sidebarMargin = (): OverlayMargin => ({
  top: SIDEBAR_MARGIN + ICON_ROWS,
  right: SIDEBAR_MARGIN,
  bottom: SIDEBAR_MARGIN,
  left: SIDEBAR_MARGIN,
});

/** 图标 overlay 的 margin：与侧栏同一个右 margin ⇒ 右边缘自动对齐。 */
export const iconMargin = (): OverlayMargin => ({
  top: SIDEBAR_MARGIN,
  right: SIDEBAR_MARGIN,
  bottom: 0,
  left: 0,
});
/** 折叠行文案里的“已完成”前缀。 */
export const COMPLETED_LABEL = "已完成";
/** 没有 worker 组归属的历史 note 放在这个组下。 */
export const UNGROUPED_LABEL = "未分组";
/** 领了具体 note 的 worker 组前缀（后面接 id 列表）。 */
export const WORKER_NOTES_LABEL = "worker: notes ";
/** Plan 级 worker（`entry.notes` 为空）的组名。 */
export const WORKER_PLAN_LABEL = "worker: plan";
/** 状态中文名：note 行左侧就用它（例：`执行中 · 38 侧栏改版…`）。 */
export const STATUS_LABELS: Readonly<Record<NoteStatus, string>> = {
  pending: "待开工",
  in_progress: "执行中",
  waiting: "待验收",
  blocked: "阻塞",
  completed: "已完成",
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

/**
 * 一个 worker 组：`registry` 里一条 worker 条目所领的 note（`entry.notes`）。
 *
 * `key` 是组的稳定标识：组内 note id 排序后 `,` 连接（`未分组` 用 `UNGROUPED_LABEL`）。
 */
export interface SidebarGroup {
  readonly key: string;
  readonly label: string;
  /** 该组有 live worker（界面上高亮）。 */
  readonly running: boolean;
  readonly notes: readonly SidebarNote[];
}

/** 一个 Plan：由若干 worker 组构成。 */
export interface SidebarPlan {
  /** `<domain>/<lifecycle>/<name>`。 */
  readonly ref: string;
  /** 目录名（去掉日期前缀后展示）。 */
  readonly name: string;
  readonly groups: readonly SidebarGroup[];
}

/** 列表的一行；点击行为由 `kind` 决定。 */
export interface SidebarRow {
  readonly kind: "plan" | "group" | "note" | "fold" | "spacer";
  readonly text: string;
  readonly plan?: string;
  readonly note?: string;
  readonly status?: NoteStatus;
  readonly running?: boolean;
}

/** 一帧列表：只有行（顶部没有汇总行，标题在上边框里）。 */
export interface SidebarView {
  readonly rows: readonly SidebarRow[];
}

/**
 * note 状态的展示名（中文）：`waiting` 再按 `needs` 分「待回答 / 待验收」。
 * @param note - 带 `status` / `needs` 的 note。
 * @returns `执行中` / `待回答` / `待验收` / `阻塞` / `待开工` / `已完成`。
 */
export const noteStatusText = (note: Pick<SidebarNote, "status" | "needs">): string =>
  note.status === "waiting" && note.needs === "answer" ? "待回答" : STATUS_LABELS[note.status];

/**
 * note 行的文本：`{状态中文名} · {序号} {名称}`，不含概述（概述只在详情卡片里）。
 *
 * 超出 `maxWidth` 时**只截名称**并补省略号，状态与序号保持完整（用户要求：序号和状态不能截）。
 * @param note - note 的 id / title / status / needs。
 * @param maxWidth - 可用列数；省略时按标题原样。
 * @returns 行文本，可见宽度不超过 `maxWidth`。
 */
export const noteRowText = (
  note: Pick<SidebarNote, "id" | "title" | "status" | "needs">,
  maxWidth: number = Number.POSITIVE_INFINITY,
): string => {
  const head = `${noteStatusText(note)} · ${note.id} `;
  const room = maxWidth - visibleWidth(head);
  if (room >= visibleWidth(note.title)) return `${head}${note.title}`;
  return `${head}${truncateToWidth(note.title, Math.max(1, room), "…")}`;
};

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

/** 一个组内未完成的 note：按状态再按 id 排序。 */
const undoneOf = (notes: readonly SidebarNote[]): readonly SidebarNote[] =>
  notes
    .filter((note) => note.status !== "completed")
    .sort(
      (left, right) =>
        STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || left.id.localeCompare(right.id),
    );

/** 同层后面还有兄弟的接续符。 */
export const TREE_BRANCH = "├─ ";
/** 同层最后一支。 */
export const TREE_LAST = "└─ ";
/** 父支还有后续时，子层的竖向接续。 */
export const TREE_PIPE = "│  ";
/** 父支已到底时，子层的空白接续（仍是 3 列，栅格不歪）。 */
export const TREE_BLANK = "   ";

/** 第 `index` 支（共 `total` 支）的接续符。 */
const branchOf = (index: number, total: number): string =>
  index === total - 1 ? TREE_LAST : TREE_BRANCH;
/** 第 `index` 支的子层前缀：父支后面还有兄弟就画竖线，否则留空。 */
const contOf = (index: number, total: number): string =>
  index === total - 1 ? TREE_BLANK : TREE_PIPE;

const noteRow = (plan: SidebarPlan, note: SidebarNote, text: string): SidebarRow => ({
  kind: "note",
  text,
  plan: plan.ref,
  note: note.id,
  status: note.status,
  running: note.running,
});

/** Plan 下的一支：一个 worker 组（带要展示的 note）或已完成折叠行。 */
type PlanChild =
  | { readonly kind: "group"; readonly group: SidebarGroup; readonly notes: readonly SidebarNote[] }
  | { readonly kind: "fold"; readonly done: number };

/**
 * 构建一帧列表：**Plan → worker 组 → note** 三级，用 `├─` / `└─` 树形接续符表现层级。
 *
 * 行距靠连接符而不是空行：组与组、note 与 note 之间**不插空行**，只有 Plan 与 Plan 之间留一行。
 * 已完成默认在每个 Plan 下折成一支（`└─ 已完成 N 条 ▸`），展开后归入各自组内（组还在时）或
 * `未分组`，不再平铺到 Plan 下。
 * @param plans - 各 Plan 的组（只含 active、且已过滤编排期域）。
 * @param expanded - 已展开“已完成”的 Plan ref 集合。
 * @param textWidth - 行文本可用列数（默认 `SIDEBAR_TEXT_WIDTH`），用于只截名称。
 * @returns 行数组（下标 = 鼠标 `y` - `SIDEBAR_HEADER_ROWS`）。
 */
export const buildSidebarView = (
  plans: readonly SidebarPlan[],
  expanded: Iterable<string> = [],
  textWidth: number = SIDEBAR_TEXT_WIDTH,
): SidebarView => {
  const open = new Set(expanded);
  const rows: SidebarRow[] = [];
  plans.forEach((plan, planIndex) => {
    if (planIndex > 0) rows.push({ kind: "spacer", text: "" });
    rows.push({ kind: "plan", text: shortPlanName(plan.name), plan: plan.ref });
    const isOpen = open.has(plan.ref);
    const children: PlanChild[] = [];
    let done = 0;
    for (const group of plan.groups) {
      const completed = group.notes
        .filter((note) => note.status === "completed")
        .sort((left, right) => left.id.localeCompare(right.id));
      done += completed.length;
      const shown = isOpen ? [...undoneOf(group.notes), ...completed] : undoneOf(group.notes);
      if (shown.length > 0) children.push({ kind: "group", group, notes: shown });
    }
    if (done > 0) children.push({ kind: "fold", done });
    children.forEach((child, index) => {
      const branch = branchOf(index, children.length);
      const cont = contOf(index, children.length);
      if (child.kind === "fold") {
        rows.push({
          kind: "fold",
          text: `${branch}${COMPLETED_LABEL} ${child.done} 条 ${isOpen ? "▾" : "▸"}`,
          plan: plan.ref,
        });
        return;
      }
      rows.push({
        kind: "group",
        text: `${branch}${child.group.label}`,
        plan: plan.ref,
        ...(child.group.running ? { running: true } : {}),
      });
      child.notes.forEach((note, noteIndex) => {
        const noteBranch = branchOf(noteIndex, child.notes.length);
        // 接续符占的列从文本宽度里扣掉，剩下的只截名称、状态与序号不动。
        const prefix = `${cont}${noteBranch}`;
        rows.push(
          noteRow(plan, note, `${prefix}${noteRowText(note, textWidth - visibleWidth(prefix))}`),
        );
      });
    });
  });
  return { rows };
};

/**
 * 行样式：只靠颜色区分「在跑」（accent）与其余，**不用 `dim` 弱化**去假装字号变小。
 * 层级已经由树形接续符表达。
 */
const renderRow = (row: SidebarRow, width: number, theme: Theme): string => {
  switch (row.kind) {
    case "plan":
      return truncateToWidth(theme.bold(row.text), width, "…");
    case "group":
      return truncateToWidth(
        row.running === true ? theme.fg("accent", row.text) : theme.bold(row.text),
        width,
        "…",
      );
    case "note":
      return truncateToWidth(row.running === true ? theme.fg("accent", row.text) : row.text, width);
    case "fold":
      return truncateToWidth(row.text, width, "…");
    case "spacer":
      return "";
  }
};

/**
 * 渲染一帧列表；行与 `view.rows` 一一对应（下标 = 鼠标 `y` - `SIDEBAR_HEADER_ROWS`）。
 * 顶部没有汇总行：第一行就是上边框，标题写在其中。
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
  const boxWidth = Math.max(8, width);
  const innerWidth = boxWidth - 2;
  const textWidth = Math.max(1, innerWidth - 2);
  const border = (text: string): string => theme.fg("accent", text);
  const title = ` ${SIDEBAR_TITLE} `;
  const fill = "─".repeat(Math.max(0, innerWidth - visibleWidth(title)));
  const inner = (text: string): string => border("│") + ` ${padTo(text, textWidth)} ` + border("│");
  const lines: string[] = [border(`┌${title}${fill}┐`)];
  for (const row of view.rows) lines.push(inner(renderRow(row, textWidth, theme)));
  lines.push(border(`└${"─".repeat(innerWidth)}┘`));
  return lines;
};

/** 按可见宽度补空格到 `width` 列（中英混排也对齐右竖线）。 */
const padTo = (text: string, width: number): string => {
  const clipped = truncateToWidth(text, width, "");
  const gap = width - visibleWidth(clipped);
  return gap > 0 ? `${clipped}${" ".repeat(gap)}` : clipped;
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
  /** 每次模式同步时调用：开（且是 tui）→ 挂 overlay + 3s 定时刷新；否则全清。 */
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
 * 三级结构下没有扁平的 note 列表：从 Plan 的各个组里找一条 note。
 * @param plans - 当前帧的 Plan（含组）。
 * @param planRef - Plan 标识。
 * @param noteId - note id。
 * @returns 找到的 note（带最新状态）；不存在时 undefined。
 */
export const findSidebarNote = (
  plans: readonly SidebarPlan[],
  planRef: string,
  noteId: string,
): SidebarNote | undefined => {
  for (const group of plans.find((plan) => plan.ref === planRef)?.groups ?? []) {
    const found = group.notes.find((note) => note.id === noteId);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * 一条 note 所属组的展示名（详情卡片里用）。
 * @param plans - 当前帧的 Plan（含组）。
 * @param planRef - Plan 标识。
 * @param noteId - note id。
 * @returns 组名；没找到时 undefined。
 */
export const groupLabelOfNote = (
  plans: readonly SidebarPlan[],
  planRef: string,
  noteId: string,
): string | undefined => {
  for (const group of plans.find((plan) => plan.ref === planRef)?.groups ?? []) {
    if (group.notes.some((note) => note.id === noteId)) return group.label;
  }
  return undefined;
};

/** 侧栏不展示的域。 */
export const SIDEBAR_EXCLUDED_DOMAINS: readonly string[] = ["orchestration"];

/**
 * 该 Plan 是否进侧栏。
 *
 * 判据选**按 domain 过滤**（不选“只显示存在 live worker 的 Plan”）：编排期 Plan 是编排方自己的
 * 进度板，不产生 worker 交付物；而“有没有 live worker”会随着派工/收尾不断变化，列表会闪烁，
 * 且 worker 空闲时整个 Plan 会凭空消失。
 * @param plan - 只要带 `domain`。
 * @returns 进侧栏则 true。
 */
export const planVisibleInSidebar = (plan: Pick<PlanRef, "domain">): boolean =>
  !SIDEBAR_EXCLUDED_DOMAINS.includes(plan.domain);

/** 一组 worker 领的 note id（来自 `registry` 条目）+ 是否有 live worker。 */
export interface WorkerGroupSpec {
  readonly notes: readonly string[];
  readonly running: boolean;
}

/**
 * 把 note 按 worker 组分桶：每个 `registry` 条目一个组（同一个 Plan 下多组分别列出），
 * 不属于任何组的（历史遗留、已完成）落到 `未分组`。
 * @param notes - 该 Plan 的全部 note。
 * @param groups - 该 Plan 的 worker 组（按句柄表顺序）。
 * @returns 组列表：有 live worker 的组在前，`未分组` 总在最后；空组不列出。
 */
/**
 * 把 note 按 worker 组分桶：每个 `registry` 条目一个组（同一个 Plan 下多组分别列出），
 * 不属于任何组的（历史遗留、已完成）落到 `未分组`。
 *
 * 组名按 worker 的形态：领了具体 note 的叫 `worker: notes 38,42`；`notes` 为空数组表示
 * **Plan 级派工**（见 `handles.ts`），这个 worker 领的就是剩下没被其他组占的 note，叫 `worker: plan`。
 * @param notes - 该 Plan 的全部 note。
 * @param groups - 该 Plan 的 worker 组（按句柄表顺序）。
 * @returns 组列表：有 live worker 的组在前，`worker: plan` / `未分组` 总在最后；空组不列出。
 */
export const groupSidebarNotes = (
  notes: readonly SidebarNote[],
  groups: readonly WorkerGroupSpec[],
): readonly SidebarGroup[] => {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const assigned = new Set<string>();
  const result: SidebarGroup[] = [];
  for (const group of groups) {
    // Plan 级 worker 留到最后统一认领剩下的 note。
    if (group.notes.length === 0) continue;
    const members = group.notes
      .map((id) => byId.get(id))
      .filter((note): note is SidebarNote => note !== undefined)
      // 组内按 id 排序：组的 key/label 本来就按 id 排，成员顺序也跟着定下来。
      .sort((left, right) => left.id.localeCompare(right.id));
    if (members.length === 0) continue;
    for (const note of members) assigned.add(note.id);
    const ids = members.map((note) => note.id);
    result.push({
      key: ids.join(","),
      label: `${WORKER_NOTES_LABEL}${ids.join(",")}`,
      running: group.running,
      notes: members,
    });
  }
  const rest = notes.filter((note) => !assigned.has(note.id));
  const planLevel = groups.find((group) => group.notes.length === 0);
  if (planLevel !== undefined && rest.length > 0) {
    result.push({
      key: WORKER_PLAN_LABEL,
      label: WORKER_PLAN_LABEL,
      running: planLevel.running,
      notes: rest,
    });
    return result;
  }
  if (rest.length > 0) {
    result.push({ key: UNGROUPED_LABEL, label: UNGROUPED_LABEL, running: false, notes: rest });
  }
  return result;
};

/**
 * 建一个侧栏控制器。同一时刻只挂一份 overlay；模式关、会话退出、reload 都走 `dispose`。
 * @param deps - 句柄表与设置来源。
 * @returns 控制器。
 */
export const createSidebar = (deps: SidebarDeps): Sidebar => {
  const expanded = new Set<string>();
  const plansByRef = new Map<string, PlanRef>();
  let plans: readonly SidebarPlan[] = [];
  let view: SidebarView = { rows: [] };
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

  /** 详情浮层：只占卡片矩形（外部真透明），快照 + 实时流；`×` 或 `Esc` 关。 */
  const openDetail = (planRef: string, noteId: string): void => {
    const localTui = tui;
    const localTheme = theme;
    if (localTui === undefined || localTheme === undefined) return;
    if (!plansByRef.has(planRef)) return;
    const snapshot = findSidebarNote(plans, planRef, noteId);
    if (snapshot === undefined) return;
    closeDetail();
    detailTarget = { plan: planRef, note: noteId };
    const entry = findEntryByNote(deps.registry, plansByRef.get(planRef)?.directory ?? "", noteId);
    if (entry !== undefined) feed = createLiveFeed(entry.session, requestRender);
    const note = (): SidebarNote => findSidebarNote(plans, planRef, noteId) ?? snapshot;
    detailContent = (): DetailContent => {
      const current = note();
      const body = [current.description];
      if (current.status === "blocked" && current.blockedReason !== undefined) {
        body.push("", `阻塞：${current.blockedReason}`);
      }
      const group = groupLabelOfNote(plans, planRef, noteId);
      if (group !== undefined) body.push("", `组：${group}`);
      body.push("", `Plan: ${planRef}`);
      return {
        heading: `◇ note ${current.id} · ${noteStatusText(current)}`,
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
        onClose: () => {
          closeDetail();
          requestRender();
        },
      }),
      // 宽度 = 卡片宽（窄终端由宿主 clamp）；矩形外的行列一个像素都不写 ⇒ 真透明。
      {
        anchor: "center",
        width: DETAIL_WIDTH,
        maxHeight: DETAIL_MAX_HEIGHT,
        margin: 1,
        nonCapturing: true,
      },
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
        // 与侧栏同一个右 margin：两者右边缘对齐，图标正好落在侧栏顶部那一行。
        anchor: "top-right",
        width: ICON_WIDTH,
        maxHeight: ICON_ROWS,
        margin: iconMargin(),
        nonCapturing: true,
        visible: () => localTui.mode === "fullscreen",
      },
    );
    listHandle = localTui.showOverlay(
      createSidebarComponent({ view: () => view, theme: localTheme, onRow }),
      {
        // 固定右上角（不居中）：图标占上面一行，侧栏从它下面开始。
        anchor: "top-right",
        width: SIDEBAR_WIDTH,
        maxHeight: "100%",
        margin: sidebarMargin(),
        nonCapturing: true,
        visible: (width) => {
          lastColumns = width;
          return localTui.mode === "fullscreen" && width >= SIDEBAR_MIN_COLUMNS && listVisible;
        },
      },
    );
    removeInputListener = localTui.addInputListener((data) => {
      // 详情没开：一个键都不碰（不抢编辑器的 Esc）。
      if (detailHandle === undefined) return undefined;
      if (!matchesKey(data, "escape")) return undefined;
      // 只关详情卡片：侧栏的显示状态不在这里动（侧栏只由 `▤` 图标切换）。
      closeDetail();
      requestRender();
      return { consume: true };
    });
  };

  /** 一个 Plan 的 worker 组（句柄表顺序 = 起始时刻升序）。 */
  const groupsOfPlan = (directory: string): readonly WorkerGroupSpec[] =>
    deps.registry
      .list()
      .filter((entry) => planDirectoryOf(entry.planDirectory) === directory)
      .map((entry) => ({ notes: entry.notes ?? [], running: true }));

  const refresh = async (): Promise<void> => {
    const localCtx = ctx;
    if (!mounted || localCtx === undefined) return;
    try {
      const discovered = activePlans(
        await listPlans(localCtx.cwd, deps.domainsPath ?? DEFAULT_DOMAIN_ROOT),
      ).filter(planVisibleInSidebar);
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
        const notes: SidebarNote[] = document.notes.map((note) => ({
          id: note.id,
          title: note.title,
          description: note.description,
          status: note.status,
          ...(note.needs === undefined ? {} : { needs: note.needs }),
          ...(note.blocked_reason === undefined ? {} : { blockedReason: note.blocked_reason }),
          running: running.has(note.id),
        }));
        next.push({
          ref,
          name: plan.name,
          groups: groupSidebarNotes(notes, groupsOfPlan(plan.directory)),
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
        const stillRunning = findSidebarNote(next, target.plan, target.note)?.running;
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
    listVisible = true;
    plans = [];
    plansByRef.clear();
    view = { rows: [] };
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
