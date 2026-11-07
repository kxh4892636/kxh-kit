import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  stripTerminalSequences,
  visibleWidth,
  type Component,
  type OverlayOptions,
} from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_ORCHESTRATOR_SETTINGS } from "./config.ts";
import { parseDocument, serializeDocument } from "./dag.ts";
import { DETAIL_CLOSE_GLYPH, DETAIL_MAX_HEIGHT, DETAIL_WIDTH } from "./detail-overlay.ts";
import { createRegistry, type SessionLike, type WorkerEntry } from "./handles.ts";
import {
  buildSidebarView,
  TEMP_NO_REPORT,
  TEMP_SECTION_LABEL,
  tempRowText,
  tempStatusOf,
  tempSummaryOf,
  type SidebarTemp,
  createIconComponent,
  createSidebar,
  createSidebarComponent,
  groupSidebarNotes,
  ICON_CLOSED,
  ICON_OPEN,
  noteRowText,
  noteStatusText,
  planVisibleInSidebar,
  renderSidebarLines,
  SIDEBAR_HEADER_ROWS,
  ICON_ROWS,
  ICON_WIDTH,
  iconColumns,
  iconMargin,
  SIDEBAR_MARGIN,
  SIDEBAR_MIN_COLUMNS,
  sidebarColumns,
  sidebarMargin,
  SIDEBAR_REFRESH_MS,
  SIDEBAR_TEXT_WIDTH,
  SIDEBAR_TITLE,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDGET_KEY,
  shortPlanName,
  TREE_BLANK,
  TREE_BRANCH,
  TREE_LAST,
  TREE_PIPE,
  UNGROUPED_LABEL,
  WORKER_NOTES_LABEL,
  WORKER_PLAN_LABEL,
  type SidebarGroup,
  type SidebarNote,
  type SidebarPlan,
  type SidebarRow,
  type WorkerGroupSpec,
} from "./sidebar.ts";

const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const note = (
  id: string,
  title: string,
  status: SidebarNote["status"],
  extra: Partial<SidebarNote> = {},
): SidebarNote => ({ id, title, description: `${title}的摘要`, status, running: false, ...extra });

const group = (label: string, notes: readonly SidebarNote[], running = false): SidebarGroup => ({
  key: label,
  label,
  running,
  notes,
});

const demoPlans = (): SidebarPlan[] => [
  {
    ref: "pi/active/2026-01-01-demo",
    name: "2026-01-01-demo",
    groups: [
      group(
        `${WORKER_NOTES_LABEL}02,03`,
        [
          note("02", "在跑", "in_progress", { running: true }),
          note("03", "等验收", "waiting", { needs: "review" }),
        ],
        true,
      ),
      group(UNGROUPED_LABEL, [
        note("01", "待办", "pending"),
        note("04", "等人答", "waiting", { needs: "answer" }),
        note("05", "卡住", "blocked", { blockedReason: "缺凭据" }),
        note("06", "完成", "completed"),
      ]),
    ],
  },
];

interface FakeOverlay {
  component: Component;
  options: OverlayOptions;
  hidden: boolean;
}

/** 最小 TUI 替身：记录 overlay、输入监听与重绘次数。 */
const createFakeTui = (
  init: { mode?: "regular" | "fullscreen"; columns?: number; rows?: number } = {},
) => {
  const state = {
    mode: init.mode ?? "fullscreen",
    columns: init.columns ?? 140,
    rows: init.rows ?? 40,
    renders: 0,
  };
  const overlays: FakeOverlay[] = [];
  const listeners = new Set<(data: string) => { consume?: boolean } | undefined>();
  const tui = {
    get mode() {
      return state.mode;
    },
    terminal: {
      get columns() {
        return state.columns;
      },
      get rows() {
        return state.rows;
      },
    },
    showOverlay(component: Component, options?: OverlayOptions) {
      const entry: FakeOverlay = { component, options: options ?? {}, hidden: false };
      overlays.push(entry);
      return {
        hide: () => {
          entry.hidden = true;
        },
        setHidden: (hidden: boolean) => {
          entry.hidden = hidden;
        },
        isHidden: () => entry.hidden,
        focus: () => undefined,
        unfocus: () => undefined,
        isFocused: () => false,
        getBounds: () => undefined,
      };
    },
    requestRender: () => {
      state.renders += 1;
    },
    addInputListener(listener: (data: string) => { consume?: boolean } | undefined) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { tui, state, overlays, listeners };
};

/** 最小扩展上下文替身：记录 widget 与 notify。 */
const createFakeCtx = (cwd: string, mode: "tui" | "rpc" = "tui") => {
  const widgets = new Map<string, unknown>();
  const notices: { text: string; type?: string }[] = [];
  const ctx = {
    mode,
    cwd,
    ui: {
      setWidget(key: string, content: unknown) {
        if (content === undefined) widgets.delete(key);
        else widgets.set(key, content);
      },
      notify(text: string, type?: string) {
        notices.push({ text, ...(type === undefined ? {} : { type }) });
      },
    },
  };
  return { ctx: ctx as never, widgets, notices };
};

/** 把 widget 工厂变成组件：等价于宿主在 setWidget 时调一次工厂。 */
const mountWidget = (widgets: Map<string, unknown>, tui: unknown, theme = fakeTheme): Component => {
  const factory = widgets.get(SIDEBAR_WIDGET_KEY) as
    | ((tui: unknown, theme: unknown) => Component)
    | undefined;
  expect(factory).toBeTypeOf("function");
  return (factory as (a: unknown, b: unknown) => Component)(tui, theme);
};

const click = (y: number): never =>
  ({ type: "click", button: "left", x: 1, y, screenX: 100, screenY: y }) as never;
const press = (y: number): never =>
  ({ type: "press", button: "left", x: 1, y, screenX: 100, screenY: y }) as never;

describe("侧边栏列表", () => {
  it("三级分组：Plan → worker 组 → note，用 ├─ / └─ 接续", () => {
    const view = buildSidebarView(demoPlans());
    expect(view.rows.map((row) => row.kind)).toEqual([
      "plan",
      "group",
      "note",
      "note",
      "group",
      "note",
      "note",
      "note",
      "fold",
    ]);
    expect(view.rows[0]).toMatchObject({ kind: "plan", plan: "pi/active/2026-01-01-demo" });
    // Plan 是顶层，没有接续符。
    expect(view.rows[0]?.text).toBe("demo");
    // 组是 Plan 的子树：后面还有兄弟 ⇒ ├─；running 组高亮。
    expect(view.rows[1]).toMatchObject({
      kind: "group",
      text: `${TREE_BRANCH}${WORKER_NOTES_LABEL}02,03`,
      running: true,
    });
    expect(view.rows[4]).toMatchObject({
      kind: "group",
      text: `${TREE_BRANCH}${UNGROUPED_LABEL}`,
    });
    // note 是组的子树：父支还有后续 ⇒ 行首 `│  `。
    const childPipe = `${TREE_PIPE}${TREE_BRANCH}`;
    expect(view.rows[2]?.text).toBe(`${childPipe}执行中 · 02 在跑`);
    expect(view.rows[3]?.text).toBe(`${TREE_PIPE}${TREE_LAST}待验收 · 03 等验收`);
    // 组内按状态排序（in_progress → waiting）。
    expect(view.rows.slice(2, 4).map((row) => row.note)).toEqual(["02", "03"]);
    // 未分组组内：waiting → blocked → pending。
    expect(view.rows.slice(5, 8).map((row) => row.note)).toEqual(["04", "05", "01"]);
    expect(view.rows[5]?.text).toBe(`${childPipe}待回答 · 04 等人答`);
    expect(view.rows[6]?.text).toBe(`${childPipe}阻塞 · 05 卡住`);
    expect(view.rows[7]?.text).toBe(`${TREE_PIPE}${TREE_LAST}待开工 · 01 待办`);
    // Plan 的最后一支：折叠行用 └─。
    expect(view.rows[8]?.text).toBe(`${TREE_LAST}已完成 1 条 ▸`);
  });

  it("行距靠接续符：组与组、note 与 note 之间不插空行", () => {
    const view = buildSidebarView(demoPlans());
    // 只有 Plan 与 Plan 之间允许 spacer；单 Plan 一帧里一个 spacer 都没有。
    expect(view.rows.filter((row) => row.kind === "spacer")).toHaveLength(0);
    const lines = renderSidebarLines(view, SIDEBAR_WIDTH, fakeTheme as never);
    const body = lines
      .slice(SIDEBAR_HEADER_ROWS, -1)
      .map((line) => line.replaceAll("│", "").trim());
    // 没有整行空白（上/下边框之间的每一行都有内容）。
    expect(body.some((line) => line === "")).toBe(false);
  });

  it("最后一支用 └─，父支到底后子层用空白接续而不是 │", () => {
    const plans: SidebarPlan[] = [
      {
        ref: "a/active/x",
        name: "2026-01-02-x",
        groups: [
          group(`${WORKER_NOTES_LABEL}02`, [
            note("02", "A", "in_progress", { running: true }),
            note("08", "B", "pending"),
          ]),
        ],
      },
    ];
    const rows = buildSidebarView(plans).rows;
    // 只有一个组 ⇒ 它既是第一支也是最后一支。
    expect(rows[1]?.text).toBe(`${TREE_LAST}${WORKER_NOTES_LABEL}02`);
    // 父支是最后一支 ⇒ 子层前缀是 3 个空格（不是 │）。
    expect(rows[2]?.text).toBe(`${TREE_BLANK}${TREE_BRANCH}执行中 · 02 A`);
    expect(rows[3]?.text).toBe(`${TREE_BLANK}${TREE_LAST}待开工 · 08 B`);
  });

  it("note 行不带概述，只留 状态 · 序号 名称", () => {
    const view = buildSidebarView(demoPlans());
    const noteRows = view.rows.filter((row) => row.kind === "note");
    expect(noteRows.length).toBeGreaterThan(0);
    for (const row of noteRows) {
      expect(row.text).not.toContain("的摘要");
      // 形如 `│  ├─ 执行中 · 02 在跑`：接续符之后就是「状态 · 序号 名称」。
      expect(row.text).toMatch(/(?:├─ |└─ )\S+ · \d+ /u);
    }
  });

  it("已完成折叠成 Plan 的最后一支，展开后归入各自组", () => {
    const collapsed = buildSidebarView(demoPlans());
    expect(collapsed.rows.at(-1)).toMatchObject({
      kind: "fold",
      text: `${TREE_LAST}已完成 1 条 ▸`,
    });
    expect(collapsed.rows.some((row) => row.note === "06")).toBe(false);

    const open = buildSidebarView(demoPlans(), ["pi/active/2026-01-01-demo"]);
    // 06 属 未分组：展开后排在未分组组内（组内最后一支）。
    expect(open.rows.at(-2)).toMatchObject({ kind: "note", note: "06", status: "completed" });
    expect(open.rows.at(-2)?.text).toBe(`${TREE_PIPE}${TREE_LAST}已完成 · 06 完成`);
    expect(open.rows.at(-1)).toMatchObject({ kind: "fold", text: `${TREE_LAST}已完成 1 条 ▾` });
  });

  it("多个 Plan 之间留一个空行，没有汇总行", () => {
    const plans: SidebarPlan[] = [
      {
        ref: "a/active/x",
        name: "2026-01-02-x",
        groups: [group(UNGROUPED_LABEL, [note("01", "A", "blocked")])],
      },
      {
        ref: "a/active/y",
        name: "2026-01-03-y",
        groups: [group(UNGROUPED_LABEL, [note("02", "B", "waiting")])],
      },
    ];
    const view = buildSidebarView(plans);
    expect(view.rows.map((row) => row.kind)).toEqual([
      "plan",
      "group",
      "note",
      "spacer",
      "plan",
      "group",
      "note",
    ]);
    expect("header" in view).toBe(false);
    expect(view.rows.some((row) => /执行 ·|待确认|条$/u.test(row.text))).toBe(false);
  });

  it("状态中文名与条目格式", () => {
    expect(noteStatusText(note("01", "", "pending"))).toBe("待开工");
    expect(noteStatusText(note("02", "", "in_progress"))).toBe("执行中");
    expect(noteStatusText(note("03", "", "waiting", { needs: "review" }))).toBe("待验收");
    expect(noteStatusText(note("04", "", "waiting", { needs: "answer" }))).toBe("待回答");
    expect(noteStatusText(note("05", "", "blocked"))).toBe("阻塞");
    expect(noteStatusText(note("06", "", "completed"))).toBe("已完成");
    expect(noteRowText(note("38", "侧栏改版", "in_progress"))).toBe("执行中 · 38 侧栏改版");
    expect(shortPlanName("2026-11-07-pi多plan编排")).toBe("pi多plan编排");
  });

  it("长名称只截名称并补省略号，状态与序号完整", () => {
    const item = note("43", "侧栏改版：去汇总 / 按 worker 分组 / 浮层外区透明", "in_progress");
    // 40 列侧栏的文本宽 36，扣掉 note 前缀（6 列）后剩 30。
    const text = stripTerminalSequences(noteRowText(item, 30));
    expect(visibleWidth(text)).toBeLessThanOrEqual(30);
    expect(text.startsWith("执行中 · 43 ")).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("浮层外区");

    // 整帧渲染：note 行同样满足「前缀完整 + 不超文本宽」。
    const plans: SidebarPlan[] = [
      {
        ref: "a/active/x",
        name: "2026-01-02-x",
        groups: [group(`${WORKER_NOTES_LABEL}43`, [item])],
      },
    ];
    const lines = renderSidebarLines(buildSidebarView(plans), SIDEBAR_WIDTH, fakeTheme as never);
    const noteLine = lines.find((line) => line.includes("执行中 · 43")) ?? "";
    expect(noteLine).toContain("执行中 · 43 ");
    expect(noteLine.endsWith("│")).toBe(true);
    // 宽度仍然对齐到 40 列，说明是文本自己截断而不是撑破外框。
    expect(visibleWidth(noteLine)).toBe(SIDEBAR_WIDTH);
  });

  it("样式：不用 dim 弱化假装小字号，只有 running 用 accent", () => {
    const colorTheme = {
      fg: (color: string, text: string) => `<${color}>${text}</>`,
      bold: (text: string) => `<b>${text}</b>`,
    };
    const text = renderSidebarLines(
      buildSidebarView(demoPlans()),
      SIDEBAR_WIDTH,
      colorTheme as never,
    ).join("\n");
    expect(text).not.toContain("<dim>");
    expect(text).toContain("<accent>");
  });

  it("上边框就是第一行（无汇总行），行与 rows 一一对应，且每行不超 40 列", () => {
    const view = buildSidebarView(demoPlans());
    const lines = renderSidebarLines(view, SIDEBAR_WIDTH, fakeTheme as never);
    expect(SIDEBAR_HEADER_ROWS).toBe(1);
    expect(lines).toHaveLength(SIDEBAR_HEADER_ROWS + view.rows.length + 1);
    expect(lines[0]).toContain(SIDEBAR_TITLE);
    expect(lines[0]?.startsWith("┌")).toBe(true);
    expect(lines.at(-1)?.startsWith("└")).toBe(true);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(SIDEBAR_WIDTH);
    // 每行都被左右竖线包住（宽度对齐）
    for (const line of lines.slice(1, -1)) {
      expect(line.startsWith("│")).toBe(true);
      expect(line.endsWith("│")).toBe(true);
    }
    // 第 i 行（0 起）的文本就是 rows[i]：第一行内容就是 Plan 标题。
    expect(lines[SIDEBAR_HEADER_ROWS]?.replaceAll("│", "").trim()).toBe("demo");
  });
});

describe("temp workers 分组", () => {
  const temp = (id: string, extra: Partial<SidebarTemp> = {}): SidebarTemp => ({
    id,
    status: "in_progress",
    summary: "正在核对侧栏渲染",
    pending: 0,
    ...extra,
  });

  it("没有 live 临时 worker 时整组不出现", () => {
    const view = buildSidebarView(demoPlans());
    expect(view.rows.some((row) => row.kind === "temp-group")).toBe(false);
    expect(view.rows.some((row) => row.kind === "temp")).toBe(false);
  });

  it("作为最后一个顶层分支：└─ temp workers，条目是它的子支", () => {
    const view = buildSidebarView(demoPlans(), [], SIDEBAR_TEXT_WIDTH, [
      temp("temp:5"),
      temp("temp:6", { status: "pending", summary: TEMP_NO_REPORT }),
    ]);
    const kinds = view.rows.map((row) => row.kind);
    expect(kinds).toEqual([...kinds.slice(0, -4), "spacer", "temp-group", "temp", "temp"]);
    const group = view.rows.at(-3);
    expect(group).toMatchObject({ kind: "temp-group", text: `${TREE_LAST}${TEMP_SECTION_LABEL}` });
    expect(view.rows.at(-2)).toMatchObject({ kind: "temp", temp: "temp:5", running: true });
    expect(view.rows.at(-2)?.text.startsWith(`${TREE_BLANK}${TREE_BRANCH}`)).toBe(true);
    expect(view.rows.at(-1)?.text.startsWith(`${TREE_BLANK}${TREE_LAST}`)).toBe(true);
    expect(view.rows.at(-1)).toMatchObject({ temp: "temp:6", status: "pending" });
  });

  it("行文本：状态 · temp id · 摘要 · 待消费 N，只截摘要", () => {
    const full = tempRowText(temp("temp:5", { summary: "读完了", pending: 2 }), 60);
    expect(full).toBe("执行中 · temp:5 · 读完了 · 待消费 2");

    // 宽度不够：摘要让位，状态 / id / 待消费 保持完整。
    const squeezed = stripTerminalSequences(tempRowText(temp("temp:5", { pending: 2 }), 30));
    expect(squeezed).toBe("执行中 · temp:5 · 待消费 2");
    expect(visibleWidth(squeezed)).toBeLessThanOrEqual(30);

    // 待消费为 0 时不显示那一段（没有信息量），把列让给摘要。
    expect(stripTerminalSequences(tempRowText(temp("temp:5", { summary: "看一下侧栏" }), 30))).toBe(
      "执行中 · temp:5 · 看一下侧栏",
    );

    // 有点余量：摘要被截并补省略号。
    const partial = stripTerminalSequences(
      tempRowText(temp("temp:5", { summary: "正在核对侧栏渲染与临时分组", pending: 1 }), 34),
    );
    expect(partial.startsWith("执行中 · temp:5 · ")).toBe(true);
    expect(partial.endsWith("· 待消费 1")).toBe(true);
    expect(visibleWidth(partial)).toBeLessThanOrEqual(34);
  });

  it("状态：在跑 → 执行中；空闲有上报 → 已完成；都没有 → 待开工", () => {
    expect(tempStatusOf({ running: true, hasReport: false })).toBe("in_progress");
    expect(tempStatusOf({ running: false, hasReport: true })).toBe("completed");
    expect(tempStatusOf({ running: false, hasReport: false })).toBe("pending");
  });

  it("摘要取最近一次输入或上报；都没有写 尚无上报", () => {
    // 只有上报。
    expect(tempSummaryOf({ reportSummary: "做完了", reportAt: "2026-11-07T10:00:00.000Z" })).toBe(
      "做完了",
    );
    // 输入比上报新 ⇒ 取输入。
    expect(
      tempSummaryOf({
        reportSummary: "做完了",
        reportAt: "2026-11-07T10:00:00.000Z",
        inputText: "再补一条",
        inputAt: Date.parse("2026-11-07T11:00:00.000Z"),
      }),
    ).toBe("再补一条");
    // 上报比输入新 ⇒ 取上报。
    expect(
      tempSummaryOf({
        reportSummary: "做完了",
        reportAt: "2026-11-07T12:00:00.000Z",
        inputText: "再补一条",
        inputAt: Date.parse("2026-11-07T11:00:00.000Z"),
      }),
    ).toBe("做完了");
    // 多行只留第一行；空串当没有。
    expect(tempSummaryOf({ inputText: "\n  第一行 \n第二行" })).toBe("第一行");
    expect(tempSummaryOf({})).toBe(TEMP_NO_REPORT);
    expect(tempSummaryOf({ reportSummary: "   ", inputText: "" })).toBe(TEMP_NO_REPORT);
  });
});

describe("按 worker 组分桶", () => {
  const notes: SidebarNote[] = [
    note("01", "A", "pending"),
    note("02", "B", "in_progress", { running: true }),
    note("03", "C", "waiting", { needs: "review" }),
    note("04", "D", "completed"),
  ];

  it("每个 registry 组一个桶，同一 Plan 多组分别列出，未归属的进 未分组", () => {
    const specs: WorkerGroupSpec[] = [
      { notes: ["03", "02"], running: true },
      { notes: ["01"], running: true },
    ];
    const groups = groupSidebarNotes(notes, specs);
    expect(groups.map((item) => item.label)).toEqual([
      `${WORKER_NOTES_LABEL}02,03`,
      `${WORKER_NOTES_LABEL}01`,
      UNGROUPED_LABEL,
    ]);
    expect(groups[0]?.key).toBe("02,03");
    expect(groups[0]?.running).toBe(true);
    expect(groups[0]?.notes.map((item) => item.id)).toEqual(["02", "03"]);
    expect(groups[1]?.notes.map((item) => item.id)).toEqual(["01"]);
    expect(groups[2]?.notes.map((item) => item.id)).toEqual(["04"]);
  });

  it("空组与文档里不存在的 note 都不列出；没有归属时只有 未分组", () => {
    expect(
      groupSidebarNotes(notes, [{ notes: ["99"], running: true }]).map((g) => g.label),
    ).toEqual([UNGROUPED_LABEL]);
    expect(groupSidebarNotes(notes, []).map((g) => g.label)).toEqual([UNGROUPED_LABEL]);
    expect(groupSidebarNotes([], [])).toEqual([]);
  });

  it("notes 为空的 worker 是 Plan 级派工：认领剩下的 note，组名 worker: plan", () => {
    const groups = groupSidebarNotes(notes, [
      { notes: ["02"], running: true },
      { notes: [], running: true },
    ]);
    expect(groups.map((item) => item.label)).toEqual([
      `${WORKER_NOTES_LABEL}02`,
      WORKER_PLAN_LABEL,
    ]);
    expect(groups[1]?.running).toBe(true);
    expect(groups[1]?.notes.map((item) => item.id)).toEqual(["01", "03", "04"]);
  });

  it("编排期域不进侧栏（按 domain 过滤）", () => {
    expect(planVisibleInSidebar({ domain: "orchestration" })).toBe(false);
    expect(planVisibleInSidebar({ domain: "pi" })).toBe(true);
    expect(planVisibleInSidebar({ domain: "common" })).toBe(true);
  });
});

describe("右上角定位与图标对齐", () => {
  it("图标与侧栏右边缘对齐，图标正好在侧栏顶部那一行", () => {
    for (const termWidth of [100, 120, 160]) {
      const box = sidebarColumns(termWidth);
      const icon = iconColumns(termWidth);
      // 右边缘（不含）相同 ⇒ 视觉上右对齐
      expect(icon.right).toBe(box.right);
      expect(box.right).toBe(termWidth - SIDEBAR_MARGIN);
      expect(box.left).toBe(termWidth - SIDEBAR_MARGIN - SIDEBAR_WIDTH);
      expect(icon.left).toBe(box.right - ICON_WIDTH);
      // 图标落在侧栏宽度范围内（挂在侧栏顶部，不越过左边界）
      expect(icon.left).toBeGreaterThanOrEqual(box.left);
    }
    // 行：图标占第 SIDEBAR_MARGIN 行，侧栏从它下一行开始（同一右 margin）。
    expect(iconMargin().right).toBe(sidebarMargin().right);
    expect(sidebarMargin().top).toBe(SIDEBAR_MARGIN + ICON_ROWS);
    expect(iconMargin().top).toBe(SIDEBAR_MARGIN);
  });

  it("占位：40 是内容宽，屏幕上是 40 + 左右 margin = 42 列", () => {
    expect(SIDEBAR_WIDTH).toBe(40);
    expect(SIDEBAR_TEXT_WIDTH).toBe(SIDEBAR_WIDTH - 4);
    const box = sidebarColumns(140);
    expect(box.width).toBe(SIDEBAR_WIDTH);
    expect(140 - box.right).toBe(SIDEBAR_MARGIN);
    expect(box.left).toBe(SIDEBAR_MARGIN + (140 - SIDEBAR_MARGIN * 2) - SIDEBAR_WIDTH);
    // 屏幕上占的列 = 内容宽 + 左右各 1 margin = 42。
    expect(SIDEBAR_WIDTH + 2 * SIDEBAR_MARGIN).toBe(42);
  });
});

describe("侧边栏组件的鼠标", () => {
  const rows: SidebarRow[] = [];

  it("点击按行号派发行，press/release 只登记不触发", () => {
    const component = createSidebarComponent({
      view: () => buildSidebarView(demoPlans()),
      theme: fakeTheme as never,
      onRow: (row) => rows.push(row),
    });
    expect(component.handleMouse?.(press(SIDEBAR_HEADER_ROWS))).toEqual({ handled: true });
    expect(rows).toHaveLength(0);
    // 行 0 是 Plan 标题，行 1 是 worker 组，行 2 是组内第一条 note。
    component.handleMouse?.(click(SIDEBAR_HEADER_ROWS));
    expect(rows[0]).toMatchObject({ kind: "plan" });
    component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 1));
    expect(rows[1]).toMatchObject({ kind: "group" });
    component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 2));
    expect(rows[2]).toMatchObject({ kind: "note", note: "02" });
    // 折叠行
    component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 8));
    expect(rows[3]).toMatchObject({ kind: "fold" });
    // 越界不崩
    expect(component.handleMouse?.(click(200))).toEqual({ handled: true });
    expect(rows).toHaveLength(4);
  });

  it("图标点击切换，图标随状态变化", () => {
    let open = true;
    let clicks = 0;
    const component = createIconComponent({
      open: () => open,
      theme: fakeTheme as never,
      onClick: () => {
        clicks += 1;
      },
    });
    expect(component.render(3)[0]).toBe(ICON_OPEN);
    open = false;
    expect(component.render(3)[0]).toBe(ICON_CLOSED);
    component.handleMouse?.(press(0));
    expect(clicks).toBe(0);
    component.handleMouse?.(click(0));
    expect(clicks).toBe(1);
  });
});

const created: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const runningNote = (id: string, title: string): unknown => ({
  id,
  title,
  description: `${title}的摘要`,
  status: "in_progress",
  blocked_by: [],
  evidence: [],
  updated_at: "2026-01-01T00:00:00.000Z",
  content: "正文",
});

/** 写一份 `domain/active/plan` 的 notes.json；返回工作区根。 */
const tempPlan = async (
  domain: string,
  planName: string,
  notes: unknown[],
): Promise<{ root: string; directory: string }> => {
  const root = await mkdtemp(join(tmpdir(), "pi-sidebar-"));
  created.push(root);
  const directory = join(root, ".agents/domains", domain, "plans/active", planName);
  await mkdir(directory, { recursive: true });
  const document = parseDocument({ version: 1, index: [], notes }, DEFAULT_ORCHESTRATOR_SETTINGS);
  await writeFile(join(directory, "notes.json"), serializeDocument(document), "utf8");
  return { root, directory };
};

const tempWorkspace = async (notes: unknown[]): Promise<string> =>
  (await tempPlan("demo", "2026-01-01-demo", notes)).root;

const fakeSession = (): SessionLike => ({
  isIdle: false,
  prompt: async () => undefined,
  steer: async () => undefined,
  followUp: async () => undefined,
  waitForIdle: async () => undefined,
  abort: async () => undefined,
  dispose: () => undefined,
});

const workerEntry = (directory: string, notes: string[]): WorkerEntry => ({
  planDirectory: directory,
  planRef: `demo/active/${directory.split(/[\\/]/u).at(-1) ?? ""}`,
  notes,
  startedAt: Date.now(),
  released: new Set<string>(),
  inputs: 0,
  session: fakeSession(),
});

describe("侧边栏控制器", () => {
  it("模式关 / 非 tui 时不挂 widget", async () => {
    const root = await tempWorkspace([]);
    const registry = createRegistry();
    const sidebar = createSidebar({
      registry,
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const disabled = createFakeCtx(root);
    sidebar.sync(disabled.ctx, false);
    expect(disabled.widgets.size).toBe(0);
    const rpc = createFakeCtx(root, "rpc");
    sidebar.sync(rpc.ctx, true);
    expect(rpc.widgets.size).toBe(0);
    sidebar.dispose();
  });

  it("编排模式下挂图标 + 40 列侧栏，读盘出 Plan → 组 → note", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-demo", [
      runningNote("07", "侧边栏实现"),
    ]);
    const registry = createRegistry();
    registry.add(workerEntry(directory, ["07"]));
    const sidebar = createSidebar({ registry, limits: () => DEFAULT_ORCHESTRATOR_SETTINGS });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    expect(overlays).toHaveLength(2);
    const [icon, list] = overlays;
    expect(icon?.options).toMatchObject({
      anchor: "top-right",
      width: ICON_WIDTH,
      maxHeight: ICON_ROWS,
      nonCapturing: true,
    });
    expect(icon?.options.margin).toEqual(iconMargin());
    expect(list?.options).toMatchObject({
      // 固定右上角，不居中。
      anchor: "top-right",
      width: SIDEBAR_WIDTH,
      maxHeight: "100%",
      nonCapturing: true,
    });
    expect(list?.options.margin).toEqual(sidebarMargin());
    await wait(20);
    const text = (list?.component.render(SIDEBAR_WIDTH) ?? []).join("\n");
    expect(text).toContain("demo");
    expect(text).toContain(`worker: notes 07`);
    expect(text).toContain("执行中 · 07 侧边栏实现");
    // 没有汇总行。
    expect(text).not.toContain("执行 ·");
    sidebar.dispose();
  });

  it("不显示 orchestration 域的编排期 Plan", async () => {
    const { root } = await tempPlan("demo", "2026-01-01-demo", [runningNote("07", "干活")]);
    await tempPlan("orchestration", "2026-11-07-编排期", [runningNote("01", "编排方自己的")]);
    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    const text = (overlays[1]?.component.render(SIDEBAR_WIDTH) ?? []).join("\n");
    expect(text).toContain("执行中 · 07 干活");
    expect(text).not.toContain("编排期");
    expect(text).not.toContain("编排方自己的");
    sidebar.dispose();
  });

  it("侧栏只在 fullscreen 且 ≥110 列时可见（40 列侧栏给正文留够），图标只在 fullscreen", async () => {
    // 40 + 2 margin = 42 屏幕列；100 列时正文只剩 58（< 一半），110 列时剩 68（与旧的 100/34 同体感）。
    expect(SIDEBAR_MIN_COLUMNS).toBe(110);
    const root = await tempWorkspace([]);
    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, state, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    const [icon, list] = overlays;
    expect(list?.options.visible?.(SIDEBAR_MIN_COLUMNS, 40)).toBe(true);
    expect(list?.options.visible?.(SIDEBAR_MIN_COLUMNS - 1, 40)).toBe(false);
    state.mode = "regular";
    expect(list?.options.visible?.(140, 40)).toBe(false);
    expect(icon?.options.visible?.(140, 40)).toBe(false);
    sidebar.dispose();
  });

  it("窄终端点图标给提示而不是空操作", async () => {
    const root = await tempWorkspace([]);
    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const { ctx, widgets, notices } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui({ columns: 80 });
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    const [icon, list] = overlays;
    list?.options.visible?.(80, 40);
    icon?.component.handleMouse?.(click(0));
    expect(notices[0]?.type).toBe("warning");
    expect(notices[0]?.text).toContain(String(SIDEBAR_MIN_COLUMNS));
    sidebar.dispose();
  });

  it("详情浮层只占卡片矩形（外部真透明），且 nonCapturing", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-demo", [
      runningNote("07", "侧边栏实现"),
    ]);
    const registry = createRegistry();
    registry.add(workerEntry(directory, ["07"]));
    const sidebar = createSidebar({ registry, limits: () => DEFAULT_ORCHESTRATOR_SETTINGS });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    overlays[1]?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 2));
    expect(overlays).toHaveLength(3);
    const detail = overlays[2];
    expect(detail?.options).toMatchObject({
      anchor: "center",
      width: DETAIL_WIDTH,
      maxHeight: DETAIL_MAX_HEIGHT,
      nonCapturing: true,
    });
    // 不再铺满：宽度是数字而不是 100%，渲染行数只有卡片本体那几行。
    expect(detail?.options.width).not.toBe("100%");
    const lines = detail?.component.render(DETAIL_WIDTH) ?? [];
    expect(lines.length).toBeLessThan(20);
    for (const line of lines) expect(visibleWidth(line)).toBe(DETAIL_WIDTH);
    const text = lines.join("\n");
    expect(text).toContain("◇ note 07 · 执行中");
    expect(text).toContain("侧边栏实现的摘要");
    expect(text).toContain(`组：${WORKER_NOTES_LABEL}07`);
    sidebar.dispose();
  });

  it("Esc 只关详情，侧栏保留；详情关着时不吃 Esc", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-demo", [
      runningNote("07", "侧边栏实现"),
    ]);
    const registry = createRegistry();
    registry.add(workerEntry(directory, ["07"]));
    const sidebar = createSidebar({ registry, limits: () => DEFAULT_ORCHESTRATOR_SETTINGS });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays, listeners } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    const list = overlays[1];
    list?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 2));
    const detail = overlays[2];
    expect(listeners.size).toBe(1);
    const listener = [...listeners][0];

    // 详情开着：Esc 关闭，侧栏仍在。
    expect(listener?.("\u001b")).toEqual({ consume: true });
    expect(detail?.hidden).toBe(true);
    expect(overlays[1]?.hidden).toBe(false);
    expect(overlays[1]?.options.visible?.(140, 40)).toBe(true);

    // 详情已关：Esc 不再被消费（侧栏也不会被收起）。
    expect(listener?.("\u001b")).toBeUndefined();
    expect(overlays[1]?.options.visible?.(140, 40)).toBe(true);

    // 无关按键：不消费。
    expect(listener?.("x")).toBeUndefined();
    sidebar.dispose();
  });

  it("点卡片右上角 × 只关详情，侧栏仍开着", async () => {
    const { root } = await tempPlan("demo", "2026-01-01-demo", [runningNote("07", "侧边栏实现")]);
    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    overlays[1]?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 2));
    const detail = overlays[2];
    const lines = detail?.component.render(DETAIL_WIDTH) ?? [];
    expect(lines[0]).toContain(DETAIL_CLOSE_GLYPH);
    detail?.component.handleMouse?.({
      type: "click",
      x: DETAIL_WIDTH - 2,
      y: 0,
    } as never);
    expect(detail?.hidden).toBe(true);
    expect(overlays[1]?.options.visible?.(140, 40)).toBe(true);
    sidebar.dispose();
  });

  it("临时 worker（temp:*）单独成组：状态 · id · 摘要 / 待消费", async () => {
    const root = await tempWorkspace([]);
    const registry = createRegistry();
    registry.add({
      planDirectory: "temp:5",
      planRef: "temp:5",
      kind: "temp",
      startedAt: Date.now(),
      released: new Set<string>(),
      inputs: 1,
      session: fakeSession(),
      job: {
        kind: "message",
        startedAt: Date.now(),
        progressAt: Date.now(),
        settled: Promise.resolve(),
        notified: false,
      },
      lastInput: { kind: "message", delivery: "queue", text: "看一下侧栏", at: Date.now() },
      inputLog: [
        { seq: 1, kind: "message", delivery: "queued", text: "看一下侧栏", sentAt: Date.now() },
      ],
    });
    registry.add({
      planDirectory: "temp:6",
      planRef: "temp:6",
      kind: "temp",
      startedAt: Date.now(),
      released: new Set<string>(),
      inputs: 1,
      session: fakeSession(),
      lastReport: {
        outcome: "needs_review",
        note: "",
        summary: "侧栏渲染核对完毕",
        at: new Date().toISOString(),
      },
    });
    const sidebar = createSidebar({ registry, limits: () => DEFAULT_ORCHESTRATOR_SETTINGS });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    const text = (overlays[1]?.component.render(SIDEBAR_WIDTH) ?? []).join("\n");
    expect(text).toContain(TEMP_SECTION_LABEL);
    // 有排队：待消费优先，摘要让位。
    expect(text).toContain("执行中 · temp:5 · 待消费 1");
    // 没有排队：把列让给摘要。
    expect(text).toContain("已完成 · temp:6 · 侧栏渲染核");
    expect(text).not.toContain("待消费 0");
    sidebar.dispose();
  });

  it("点临时条目开详情卡片：状态 + 摘要 + 待消费 + 实时流，Esc 只关卡片", async () => {
    const root = await tempWorkspace([]);
    const registry = createRegistry();
    registry.add({
      planDirectory: "temp:5",
      planRef: "temp:5",
      kind: "temp",
      startedAt: Date.now(),
      released: new Set<string>(),
      inputs: 1,
      session: fakeSession(),
      lastReport: {
        outcome: "needs_review",
        note: "",
        summary: "侧栏渲染核对完毕",
        at: new Date().toISOString(),
      },
    });
    const sidebar = createSidebar({ registry, limits: () => DEFAULT_ORCHESTRATOR_SETTINGS });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays, listeners } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    // 行：plan（无组）+ spacer + temp-group + temp 行。
    overlays[1]?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 3));
    const detail = overlays[2];
    expect(detail).toBeDefined();
    const card = (detail?.component.render(DETAIL_WIDTH) ?? []).join("\n");
    expect(card).toContain("◇ temp:5 · 已完成");
    expect(card).toContain("侧栏渲染核对完毕");
    expect(card).toContain("待消费 0");
    // Esc 只关卡片。
    expect([...listeners][0]?.("")).toEqual({ consume: true });
    expect(detail?.hidden).toBe(true);
    expect(overlays[1]?.options.visible?.(140, 40)).toBe(true);
    sidebar.dispose();
  });

  it("列表按 SIDEBAR_REFRESH_MS（3s）刷新，实时流的 200ms 不参与", async () => {
    // 读盘是真实 IO：只假 timer，别假 setImmediate，否则等不到 fs 回调。
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
    const root = await tempWorkspace([runningNote("07", "侧边栏实现")]);
    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, state } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    // 读盘是一串真实 IO：按真实时间等到条件成立，不数 setImmediate 轮次（会抖）。
    const until = async (predicate: () => boolean, ms = 2_000): Promise<boolean> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (predicate()) return true;
        await tick();
      }
      return predicate();
    };
    // 首帧读盘落地。
    expect(await until(() => state.renders >= 1)).toBe(true);
    expect(SIDEBAR_REFRESH_MS).toBe(3_000);
    // 盘上内容变了：tick 没到就不重绘。
    const directory = join(root, ".agents/domains/demo/plans/active/2026-01-01-demo");
    const document = parseDocument(
      { version: 1, index: [], notes: [runningNote("07", "改名后的标题")] },
      DEFAULT_ORCHESTRATOR_SETTINGS,
    );
    await writeFile(join(directory, "notes.json"), serializeDocument(document), "utf8");
    const before = state.renders;
    await vi.advanceTimersByTimeAsync(SIDEBAR_REFRESH_MS - 1);
    // 还没到点：不可能有 tick 去读盘，只让事件循环空转一小会儿。
    await until(() => false, 20);
    expect(state.renders).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(await until(() => state.renders > before)).toBe(true);
    sidebar.dispose();
  });

  it("模式关与 dispose 都会清 overlay、定时器与监听", async () => {
    vi.useFakeTimers();
    const root = await tempWorkspace([]);
    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, state, overlays, listeners } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    expect(overlays).toHaveLength(2);
    expect(listeners.size).toBe(1);
    const before = state.renders;
    sidebar.sync(ctx, false);
    expect(widgets.size).toBe(0);
    expect(overlays.every((overlay) => overlay.hidden)).toBe(true);
    expect(listeners.size).toBe(0);
    // 定时器已清：推进 3 个刷新周期（3 × 3s）也不再有重绘请求
    vi.advanceTimersByTime(SIDEBAR_REFRESH_MS * 3);
    expect(state.renders).toBe(before);
    sidebar.dispose();
  });
});
