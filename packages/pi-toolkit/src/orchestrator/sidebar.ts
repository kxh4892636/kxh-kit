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
 * 3. 窄终端：侧栏固定 `SIDEBAR_WIDTH`（40）列，终端窄于 `SIDEBAR_MIN_COLUMNS`（110）时整块隐藏
 *    （会盖住正文）。阈值随宽度上调：40 列 + 左右 margin 占 42 屏幕列，仍用 100 就只剩 58 列给正文，
 *    110 列保住 68 列，与旧 32/100 的比例一致。图标保留（否则没有任何入口），点它会收到一条 notify
 *    说明“为什么看不到侧栏”—— 不静默。
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
import { dependencyClosure, type ClosureNote, type NoteNeeds, type NoteStatus } from "./dag.ts";
import {
  createLiveFeed,
  createDetailComponent,
  DETAIL_MAX_HEIGHT,
  DETAIL_WIDTH,
  type DetailContent,
  type LiveFeed,
} from "./detail-overlay.ts";
import {
  entryKeyOf,
  findEntryByNote,
  planDirectoryOf,
  runningNotesOf,
  type WorkerEntry,
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

/** 一条 note 同时落在多个组的闭包里时，行尾加的标记。 */
export const SHARED_MARK = "↔";

/** 列表里的一条 note。 */
export interface SidebarNote {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: NoteStatus;
  readonly needs?: NoteNeeds;
  readonly blockedReason?: string;
  /** 直接依赖（分组算依赖闭包用；渲染不读它）。 */
  readonly blockedBy?: readonly string[];
  /** 闭包被多个组重叠、这一行被借去代表别组也有的 note：行尾加 `↔`。 */
  readonly shared?: boolean;
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
  readonly kind: "plan" | "group" | "note" | "fold" | "spacer" | "temp-group" | "temp";
  readonly text: string;
  readonly plan?: string;
  readonly note?: string;
  /** 临时 worker 的路由键 `temp:<id>`。 */
  readonly temp?: string;
  readonly status?: NoteStatus;
  readonly running?: boolean;
}

/**
 * 一个 **临时 worker**（`temp:<id>`）的展示数据。
 *
 * 它不属于任何 Plan、也不在 `notes.json` 里，所以整块从 `registry` 来，不和 note 混在一起。
 */
export interface SidebarTemp {
  /** 路由键 `temp:<id>`。 */
  readonly id: string;
  readonly status: NoteStatus;
  /** 最近一次输入或上报的摘要（一行）；没有就 `TEMP_NO_REPORT`。 */
  readonly summary: string;
}

/** 临时 worker 分组标题：放在列表最下方，与 Plan 并列但一眼看得出不是 Plan。 */
export const TEMP_SECTION_LABEL = "temp workers";
/** 临时 worker 还没有任何输入/上报时的摘要占位。 */
export const TEMP_NO_REPORT = "尚无上报";

/**
 * 临时 worker 的状态：job 在跑 → `in_progress`；空闲但有上报 → `completed`；否则 → `pending`。
 * 复用 note 的中文状态名（执行中 / 已完成 / 待开工），列表里不用再记一套词。
 * @param source - 是否有在途 job、是否已有上报。
 * @returns 映射到 note 状态上的取值。
 */
export const tempStatusOf = (source: {
  readonly running: boolean;
  readonly hasReport: boolean;
}): NoteStatus => (source.running ? "in_progress" : source.hasReport ? "completed" : "pending");

/**
 * 临时 worker 的行文本：`{状态中文名} · {temp id} · {摘要}`。
 *
 * 侧栏不放 `待消费 N`：那是排查卡死用的诊断信息，只留在 `orchestrator_workers` 的输出里，
 * 不占版面。宽度不够时**只截摘要**（`…`），状态与 `temp:<id>` 保持完整。
 * @param temp - 临时条目。
 * @param maxWidth - 可用列数；省略时不截。
 * @returns 行文本，可见宽度不超过 `maxWidth`。
 */
export const tempRowText = (
  temp: SidebarTemp,
  maxWidth: number = Number.POSITIVE_INFINITY,
): string => {
  const head = `${noteStatusText(temp)} · ${temp.id} · `;
  const room = maxWidth - visibleWidth(head);
  if (room >= visibleWidth(temp.summary)) return `${head}${temp.summary}`;
  // 一列都挤不出时连分隔符一起收掉，别留个孤零零的省略号。
  if (room < 2) return head.slice(0, -3);
  return `${head}${truncateToWidth(temp.summary, room, "…")}`;
};

/** 临时 worker 摘要的来源：最近一次输入或上报（含时刻，用来挑更新的那条）。 */
export interface TempSummarySource {
  readonly reportSummary?: string;
  readonly reportAt?: string;
  readonly inputText?: string;
  readonly inputAt?: number;
}

/**
 * 取临时 worker 的「最近一次输入或上报」摘要：按时刻选较新的一条，折叠成一行；都没有则
 * `TEMP_NO_REPORT`。
 * @param source - 上报/输入的文本与时刻。
 * @returns 一行摘要。
 */
export const tempSummaryOf = (source: TempSummarySource): string => {
  const report = source.reportSummary?.trim() ?? "";
  const input = source.inputText?.trim() ?? "";
  const reportAt =
    source.reportAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(source.reportAt);
  const inputAt = source.inputAt ?? Number.NEGATIVE_INFINITY;
  const preferReport = report !== "" && (input === "" || inputAt <= reportAt);
  const picked = preferReport ? report : input !== "" ? input : report;
  const line =
    picked
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item !== "") ?? "";
  return line === "" ? TEMP_NO_REPORT : line;
};

/** 一帧列表：只有行（顶部没有汇总行，标题在上边框里）。 */
export interface SidebarView {
  readonly rows: readonly SidebarRow[];
}

/**
 * note 状态的展示名（中文）：`waiting` 再按 `needs` 分「待回答 / 待验收」。
 *
 * **「待开工」也要看运行态**：只要账本投影说这条 note 有 live worker（`worker.spawned`
 * 覆盖它），`pending` 一律显示「执行中」。worker 顺手改 `in_progress` 这一步经常被忘，只看
 * `notes.json` 会把“正在跑”说成“待开工”（note 45 开工时就是这么被误读的）。
 * `waiting` / `blocked` / `completed` 仍按业务状态显示 —— 那是 worker 报上来的结论，
 * 不是“还没开始”。
 * @param note - 带 `status` / `needs`，可带 `running` 的 note。
 * @returns `执行中` / `待回答` / `待验收` / `阻塞` / `待开工` / `已完成`。
 */
export const noteStatusText = (note: {
  readonly status: NoteStatus;
  readonly needs?: NoteNeeds;
  readonly running?: boolean;
}): string => {
  if (note.running === true && note.status === "pending") return STATUS_LABELS.in_progress;
  return note.status === "waiting" && note.needs === "answer"
    ? "待回答"
    : STATUS_LABELS[note.status];
};

/**
 * note 行的文本：`{状态中文名} · {序号} {名称}`，不含概述（概述只在详情卡片里）。
 *
 * 超出 `maxWidth` 时**只截名称**并补省略号，状态与序号保持完整（用户要求：序号和状态不能截）。
 * `shared` 的 `↔` 也算进宽度：它是行尾标记，不能被截掉也不许挤掉状态与序号。
 * @param note - note 的 id / title / status / needs / shared。
 * @param maxWidth - 可用列数；省略时按标题原样。
 * @returns 行文本，可见宽度不超过 `maxWidth`。
 */
export const noteRowText = (
  note: Pick<SidebarNote, "id" | "title" | "status" | "needs" | "running" | "shared">,
  maxWidth: number = Number.POSITIVE_INFINITY,
): string => {
  const head = `${noteStatusText(note)} · ${note.id} `;
  const mark = note.shared === true ? ` ${SHARED_MARK}` : "";
  const room = maxWidth - visibleWidth(head) - visibleWidth(mark);
  // 一列都挤不出时连分隔符一起收掉，让位给状态、id 与标记（不留孤零零的省略号）。
  if (room < 2) return `${head.trimEnd()}${mark}`;
  if (room >= visibleWidth(note.title)) return `${head}${note.title}${mark}`;
  return `${head}${truncateToWidth(note.title, room, "…")}${mark}`;
};

/** Plan 目录名去掉 `YYYY-MM-DD-` 前缀，32 列里才放得下。 */
export const shortPlanName = (name: string): string => name.replace(/^\d{4}-\d{2}-\d{2}-/u, "");

/**
 * 组内顺序：**执行中置顶**（按现有 `noteStatusText` 的口径：`in_progress`，或者有 live worker
 * 的 `pending`），多个执行中之间按 id；其余一律按 id 升序。
 *
 * 不再按状态档位排：档位会随时序抖动，且未开工/待验收/阻塞之间并没有“谁更靠上”的用户口径，
 * 只有“正在干的先看见”是刚需。
 */
const undoneOf = (notes: readonly SidebarNote[]): readonly SidebarNote[] =>
  notes
    .filter((note) => note.status !== "completed")
    .sort(
      (left, right) =>
        executingRank(left) - executingRank(right) || left.id.localeCompare(right.id),
    );

/** 执行中排 0，其余排 1（`noteStatusText` 的中文名就是唯一口径）。 */
const executingRank = (note: SidebarNote): number =>
  noteStatusText(note) === STATUS_LABELS.in_progress ? 0 : 1;

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
 * 最下方还有一块 **`temp workers`**（仅当有 live 临时 worker）：它不属于任何 Plan，也不在
 * `notes.json` 里，所以单独成组，作为最后一个顶层分支用 `└─`。
 * @param expanded - 已展开“已完成”的 Plan ref 集合。
 * @param textWidth - 行文本可用列数（默认 `SIDEBAR_TEXT_WIDTH`），用于只截名称/摘要。
 * @param temps - live 临时 worker（来自 `registry` 的 `temp:` 条目）；空数组则整块不显示。
 * @returns 行数组（下标 = 鼠标 `y` - `SIDEBAR_HEADER_ROWS`）。
 */
export const buildSidebarView = (
  plans: readonly SidebarPlan[],
  expanded: Iterable<string> = [],
  textWidth: number = SIDEBAR_TEXT_WIDTH,
  temps: readonly SidebarTemp[] = [],
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

  if (temps.length > 0) {
    if (rows.length > 0) rows.push({ kind: "spacer", text: "" });
    // 最后一个顶层分支：`└─ temp workers`，与 Plan 并列但自称一块，一眼看得出不是 Plan。
    rows.push({ kind: "temp-group", text: `${TREE_LAST}${TEMP_SECTION_LABEL}` });
    const prefix = TREE_BLANK;
    temps.forEach((temp, index) => {
      const branch = branchOf(index, temps.length);
      rows.push({
        kind: "temp",
        text: `${prefix}${branch}${tempRowText(temp, textWidth - visibleWidth(prefix) - visibleWidth(branch))}`,
        temp: temp.id,
        status: temp.status,
        running: temp.status === "in_progress",
      });
    });
  }
  return { rows };
};

/**
 * 行样式：**只用颜色区分「在跑」**（`accent`），其余一律默认色；**刻意不用 `dim`**。
 *
 * 为什么不用 `dim` / 缩进等手法表达“完成 / 待开工”：终端没有字号，弱化色会被读成“小一号字体”，
 * 而这正是用户明确不要的（见 note 43 追加口径 5）。已完成 / 待开工 / 阻塞之间的区别由**行首的状态
 * 中文名**（`已完成` / `待开工` / `阻塞`）自己承担，不再叠一层颜色语义；层级则完全由树形接续符表达。
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
      return truncateToWidth(
        row.running === true ? theme.fg("accent", row.text) : row.text,
        width,
        "…",
      );
    case "fold":
      return truncateToWidth(row.text, width, "…");
    case "temp-group":
      return truncateToWidth(theme.bold(row.text), width, "…");
    case "temp":
      return truncateToWidth(
        row.running === true ? theme.fg("accent", row.text) : row.text,
        width,
        "…",
      );
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
  /**
   * 变化源（账本投影的订阅）：一变就立刻刷新，这是**主路径**（同进程 append 后毫秒级）。
   * 省略时退回定时器轮询（跨进程兜底 / 测试）。
   */
  readonly events?: { subscribe(listener: () => void): () => void };
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
 * 把 note 按 worker 组的**依赖闭包**分桶：每个 `registry` 条目一个组（同一 Plan 下多组分别列出）。
 *
 * 组的种子是派工显式给的 `notes`，成员是种子在 `blocked_by` 图上的双向传递闭包（见
 * `dag.ts` 的 `dependencyClosure`）—— 所以“派 46”会把它的前置 45 与它的下游一起带进组里。
 *
 * - **去重**：闭包会重叠，同一条 note 只归**组键排序最前**的组（组键 = 闭包 id 升序 `,` 连接），
 *   该行标 `shared: true`，渲染时行尾加 `↔`。
 * - **已完成**：照旧留在组里（`已完成 N 条 ▸` 的计数靠它），可见性由 `buildSidebarView` 折叠。
 * - **未分组**：没被任何闭包覆盖的 note；有 Plan 级派工（`notes` 为空）时由它全部认领。
 * - **顺序**：组按 `registry` 顺序（句柄表 = 起始时刻），`worker: plan` / `未分组` 总在最后。
 * @param notes - 该 Plan 的全部 note。
 * @param groups - 该 Plan 的 worker 组（按句柄表顺序）。
 * @returns 组列表；空组不列出。
 */
export const groupSidebarNotes = (
  notes: readonly SidebarNote[],
  groups: readonly WorkerGroupSpec[],
): readonly SidebarGroup[] => {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const closureNotes: readonly ClosureNote[] = notes.map((note) => ({
    id: note.id,
    status: note.status,
    blocked_by: note.blockedBy ?? [],
  }));
  // Plan 级 worker 没有种子，留到最后统一认领剩下的 note。
  const closures = groups
    .filter((group) => group.notes.length > 0)
    .map((group) => ({ group, ids: dependencyClosure(closureNotes, group.notes) }))
    .filter((item) => item.ids.length > 0);

  // 去重按**组实例**判，不按键串：两个组的闭包可能完全相同（同一条依赖链被拆成两组派），
  // 键相等时若按“键串相等”判归属，两组会同时认领同一批 note、重复出现。
  const order = closures.map((item, index) => ({ index, key: item.ids.join(",") }));
  order.sort((left, right) => left.key.localeCompare(right.key) || left.index - right.index);
  const owner = new Map<string, number>();
  const shared = new Set<string>();
  for (const { index } of order) {
    const item = closures[index];
    if (item === undefined) continue;
    for (const id of item.ids) {
      const claimed = owner.get(id);
      if (claimed === undefined) owner.set(id, index);
      else if (claimed !== index) shared.add(id);
    }
  }

  const result: SidebarGroup[] = [];
  for (const [index, item] of closures.entries()) {
    const key = item.ids.join(",");
    const members = item.ids
      .filter((id) => owner.get(id) === index)
      .map((id) => byId.get(id))
      .filter((note): note is SidebarNote => note !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((note) => (shared.has(note.id) ? { ...note, shared: true } : note));
    if (members.length === 0) continue;
    result.push({
      key,
      label: `${WORKER_NOTES_LABEL}${key}`,
      running: item.group.running,
      notes: members,
    });
  }

  const rest = notes.filter((note) => !owner.has(note.id));
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
 * 组构建的输入签名：组 specs + 每条 note 的展示字段。
 *
 * 闭包本身只看 `id` / `status` / `blocked_by`，但缓存的产物是带标题、摘要与运行态的
 * `SidebarNote`（会原样交给下一帧），所以这些字段也一起进签名 —— 否则改了标题或者 worker
 * 一跑起来，界面上还是上一帧的旧值。
 * @param notes - 该 Plan 的全部 note。
 * @param groups - 该 Plan 的 worker 组。
 * @returns 字符串签名（相等即等价输入）。
 */
export const sidebarGroupSignature = (
  notes: readonly SidebarNote[],
  groups: readonly WorkerGroupSpec[],
): string => {
  const specs = groups.map((group) => `${group.running ? "1" : "0"}:${group.notes.join(",")}`);
  const rows = notes.map((note) =>
    [
      note.id,
      note.status,
      note.needs ?? "",
      note.running ? "1" : "0",
      (note.blockedBy ?? []).join(","),
      note.blockedReason ?? "",
      note.title,
      note.description,
    ].join("|"),
  );
  return `${specs.join(";")}#${rows.join(";")}`;
};

/** 组构建的一帧缓存（按 Plan 目录）。 */
export interface SidebarGroupCache {
  /**
   * 取该 Plan 的组：签名不变就返回上一帧的同一个数组（不重走闭包），变了才重建。
   * @param directory - Plan 的绝对目录（缓存键）。
   * @param notes - 该 Plan 的全部 note。
   * @param groups - 该 Plan 的 worker 组。
   * @returns 该 Plan 的组。
   */
  groupsOf(
    directory: string,
    notes: readonly SidebarNote[],
    groups: readonly WorkerGroupSpec[],
  ): readonly SidebarGroup[];
}

/**
 * 建一个组构建缓存：读盘每 3s 一次、而分组（闭包 + 去重）是帧里唯一“算”的步骤，
 * 盘没变就没必要重算。渲染路径（`buildSidebarView`）不读 note，本缓存只挡在组构建这一层。
 * @returns 按目录记忆最近一帧的缓存。
 */
export const createSidebarGroupCache = (): SidebarGroupCache => {
  const frames = new Map<string, { signature: string; groups: readonly SidebarGroup[] }>();
  return {
    groupsOf(directory, notes, groups) {
      const signature = sidebarGroupSignature(notes, groups);
      const cached = frames.get(directory);
      if (cached !== undefined && cached.signature === signature) return cached.groups;
      const built = groupSidebarNotes(notes, groups);
      frames.set(directory, { signature, groups: built });
      return built;
    },
  };
};

/**
 * 建一个侧栏控制器。同一时刻只挂一份 overlay；模式关、会话退出、reload 都走 `dispose`。
 * @param deps - 句柄表与设置来源。
 * @returns 控制器。
 */
export const createSidebar = (deps: SidebarDeps): Sidebar => {
  const expanded = new Set<string>();
  const plansByRef = new Map<string, PlanRef>();
  /** 组构建按 Plan 目录缓存一帧：读盘 3s 一次，盘没变就不重走闭包。 */
  const groupCache = createSidebarGroupCache();
  let plans: readonly SidebarPlan[] = [];
  let view: SidebarView = { rows: [] };
  let ctx: ExtensionContext | undefined;
  let tui: TUI | undefined;
  let theme: Theme | undefined;
  let listHandle: OverlayHandle | undefined;
  let iconHandle: OverlayHandle | undefined;
  let detailHandle: OverlayHandle | undefined;
  let feed: LiveFeed | undefined;
  /** 当前 feed 绑定的 session 引用：换了引用就必须解绑重绑，绝不两条流混进一张卡片。 */
  let feedSession: unknown;
  /** 卡片上标明的流目标（哪个 worker / 哪一个组）。 */
  let feedLabel: string | undefined;
  let detailContent: (() => DetailContent) | undefined;
  let detailTarget:
    | { readonly kind: "note"; readonly plan: string; readonly note: string }
    | { readonly kind: "temp"; readonly id: string }
    | undefined;
  let removeInputListener: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
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
    feedSession = undefined;
    feedLabel = undefined;
  };

  /**
   * 一张卡片该绑哪个 worker 的流（**每次刷新重新解析**，不缓存一次判定）。
   *
   * - note 卡片：领这条 note 的组 worker → 没有就 Plan 级 worker（键 `<目录>::`）→ 再没有就取该
   *   Plan 里最近启动、仍在跑的那个，并在卡片上标明是哪个 worker（Plan 级派工没有 `notes`，
   *   按 note 定位不到它）；
   * - 临时卡片：按 `temp:` 键取。
   *
   * 这是 `temp:15` 那个 bug 的修法：原先只在打开卡片时绑一次，`refresh` 一旦判定 not running
   * 就永久丢弃；现在 live 是**当前事实**，abort 后重派 / resume / 同键新代都会重新绑上。
   * @param target - 详情卡片的定位。
   * @returns 该绑的条目；没有可用 worker 时 undefined。
   */
  const streamEntryOf = (
    target:
      | { readonly kind: "note"; readonly plan: string; readonly note: string }
      | { readonly kind: "temp"; readonly id: string },
  ): WorkerEntry | undefined => {
    if (target.kind === "temp") return deps.registry.get(target.id);
    const directory = plansByRef.get(target.plan)?.directory;
    if (directory === undefined) return undefined;
    const byNote = findEntryByNote(deps.registry, directory, target.note);
    if (byNote !== undefined) return byNote;
    const planLevel = deps.registry.get(entryKeyOf(directory));
    if (planLevel !== undefined) return planLevel;
    // Plan 级派工（没有 notes）也可能正带着这条 note：绑最近启动、仍在跑的那个。
    const running = deps.registry
      .list()
      .filter(
        (entry) => planDirectoryOf(entry.planDirectory) === directory && entry.job !== undefined,
      );
    return running[running.length - 1];
  };

  /** 卡片上标明的流目标：`<planRef> · 组 [...]` / `<planRef> · Plan 级` / `temp:<id>`。 */
  const streamLabelOf = (entry: WorkerEntry): string => {
    const notes = entry.notes ?? [];
    if (entry.kind === "temp" || entry.planDirectory.startsWith("temp:"))
      return entry.planDirectory;
    return `${entry.planRef}${notes.length === 0 ? " · Plan 级" : ` · 组 [${notes.join(", ")}]`}`;
  };

  /**
   * 按当前 live 事实对齐 feed：同一条 session 就不动，换了一代（或当时没绑上）就解旧绑新。
   *
   * 解旧再绑新是**混流的唯一防线**：`createLiveFeed` 自带新尾巴，旧代的输出不会跟到新卡片里。
   * 没有可用 worker 时只解绑、不做任何“永久丢弃”的标记 —— 下一次刷新照样会尝试重新绑。
   */
  const ensureFeed = (): void => {
    const target = detailTarget;
    if (target === undefined) return;
    const entry = streamEntryOf(target);
    const session: unknown = entry?.session;
    if (session !== undefined && session === feedSession) {
      feedLabel = entry === undefined ? feedLabel : streamLabelOf(entry);
      return;
    }
    feed?.stop();
    feed = undefined;
    feedSession = undefined;
    feedLabel = entry === undefined ? undefined : streamLabelOf(entry);
    if (session === undefined) return;
    feed = createLiveFeed(entry?.session, requestRender);
    feedSession = session;
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
    detailTarget = { kind: "note", plan: planRef, note: noteId };
    ensureFeed();
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
      if (feedLabel !== undefined) body.push(`流目标：${feedLabel}`);
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

  /** live 临时 worker（`temp:` 键）的行数据；**不读 notes.json**，整块来自句柄表。 */
  const tempsOf = (): readonly SidebarTemp[] =>
    deps.registry
      .list()
      .filter((entry) => entry.kind === "temp" || entry.planDirectory.startsWith("temp:"))
      .map((entry) => ({
        id: entry.planDirectory,
        status: tempStatusOf({
          running: entry.job !== undefined,
          hasReport: entry.lastReport !== undefined,
        }),
        summary: tempSummaryOf({
          ...(entry.lastReport?.summary === undefined
            ? {}
            : { reportSummary: entry.lastReport.summary }),
          ...(entry.lastReport?.at === undefined ? {} : { reportAt: entry.lastReport.at }),
          ...(entry.lastInput === undefined
            ? {}
            : { inputText: entry.lastInput.text, inputAt: entry.lastInput.at }),
        }),
      }));

  /** 临时 worker 的详情卡片：快照 + 正在执行的实时流；`×` / `Esc` 关。 */
  const openTempDetail = (id: string): void => {
    const localTui = tui;
    const localTheme = theme;
    const snapshot = deps.registry.get(id);
    if (localTui === undefined || localTheme === undefined || snapshot === undefined) return;
    closeDetail();
    detailTarget = { kind: "temp", id };
    ensureFeed();
    detailContent = (): DetailContent => {
      const current = deps.registry.get(id) ?? snapshot;
      const running = current.job !== undefined;
      const status = tempStatusOf({
        running,
        hasReport: current.lastReport !== undefined,
      });
      const summary = tempSummaryOf({
        ...(current.lastReport?.summary === undefined
          ? {}
          : { reportSummary: current.lastReport.summary }),
        ...(current.lastReport?.at === undefined ? {} : { reportAt: current.lastReport.at }),
        ...(current.lastInput === undefined
          ? {}
          : { inputText: current.lastInput.text, inputAt: current.lastInput.at }),
      });
      const body = [summary];
      if (current.lastInput !== undefined) {
        body.push(
          "",
          `最近输入：${current.lastInput.kind} · ${current.lastInput.delivery} · ${current.lastInput.text}`,
        );
      }
      if (current.model !== undefined) body.push(`模型：${current.model}`);
      if (current.worktree !== undefined) body.push(`worktree：${current.worktree.name}`);
      if (feedLabel !== undefined) body.push(`流目标：${feedLabel}`);
      return {
        heading: `◇ ${id} · ${noteStatusText({ status })}`,
        body,
        live: feed?.lines() ?? [],
        running,
        ...(current.lastReport === undefined ? { notice: "这个临时 worker 还没有上报" } : {}),
      };
    };
    detailHandle = localTui.showOverlay(
      createDetailComponent(localTheme, {
        content: () => detailContent?.() ?? { heading: id, body: [], live: [], running: false },
        onClose: () => {
          closeDetail();
          requestRender();
        },
      }),
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
    if (row.kind === "temp") {
      if (row.temp !== undefined) openTempDetail(row.temp);
      return;
    }
    if (row.plan === undefined) return;
    if (row.kind === "fold") {
      if (expanded.has(row.plan)) expanded.delete(row.plan);
      else expanded.add(row.plan);
      view = buildSidebarView(plans, expanded, SIDEBAR_TEXT_WIDTH, tempsOf());
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

  /**
   * 账本一变就排一次刷新。
   *
   * 合并同一轮的多次事件（`setTimeout(0)` 把同一 tick 的事件并成一帧），但仍远快于
   * `SIDEBAR_REFRESH_MS`（3s）—— 定时器只剩跨进程兜底的作用。
   */
  let refreshQueued = false;
  const scheduleRefresh = (): void => {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(() => {
      refreshQueued = false;
      void refresh();
    }, 0).unref?.();
  };

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
          blockedBy: note.blocked_by,
          running: running.has(note.id),
        }));
        next.push({
          ref,
          name: plan.name,
          groups: groupCache.groupsOf(plan.directory, notes, groupsOfPlan(plan.directory)),
        });
      }
      plans = next;
      const nextView = buildSidebarView(plans, expanded, SIDEBAR_TEXT_WIDTH, tempsOf());
      if (JSON.stringify(nextView) !== JSON.stringify(view)) {
        view = nextView;
        requestRender();
      }
      // 流目标跟着 live 事实走：worker 换了一代（abort 后重派 / resume / 同键新代）就重绑；
      // 暂时没有 live worker 只解绑，不再“永久丢弃”（`temp:15` 的病根）。
      if (detailTarget !== undefined) {
        const wasSession = feedSession;
        ensureFeed();
        if (feedSession !== wasSession) requestRender();
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
    unsubscribe?.();
    unsubscribe = undefined;
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
      // 主路径：账本投影一变就刷新（同进程毫秒级）。
      unsubscribe ??= deps.events?.subscribe(scheduleRefresh);
      // 兜底：跨进程写入（另一个 pi 实例）不一定能收到同进程通知，3s 轮询兜住。
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
