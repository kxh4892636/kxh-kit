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
  COMPLETED_LABEL,
  createSidebarGroupCache,
  sidebarGroupSignature,
  SHARED_MARK,
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
  groupSourceLive,
  GROUP_COLLAPSED_MARK,
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
    // 组内按状态排序（in_progress 置顶，其余按 id）。
    expect(view.rows.slice(2, 4).map((row) => row.note)).toEqual(["02", "03"]);
    // 未分组组内：没有执行中的，一律按 id 升序。
    expect(view.rows.slice(5, 8).map((row) => row.note)).toEqual(["01", "04", "05"]);
    expect(view.rows[5]?.text).toBe(`${childPipe}待开工 · 01 待办`);
    expect(view.rows[6]?.text).toBe(`${childPipe}待回答 · 04 等人答`);
    expect(view.rows[7]?.text).toBe(`${TREE_PIPE}${TREE_LAST}阻塞 · 05 卡住`);
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

  it("样式：不用 dim；已完成 / 待开工不加颜色，只靠行首状态名", () => {
    const colorTheme = {
      fg: (color: string, text: string) => `<${color}>${text}</>`,
      bold: (text: string) => `<b>${text}</b>`,
    };
    const view = buildSidebarView(demoPlans());
    const lines = renderSidebarLines(view, SIDEBAR_WIDTH, colorTheme as never);
    const text = lines.join("\n");
    // 全帧没有任何 dim：终端没字号，弱化色会被读成“小一号字体”。
    expect(text).not.toContain("<dim>");
    // 只有 running 的行用 accent。
    expect(text).toContain("<accent>");

    // 逐行对齐 rows：左右竖线各贡献 1 个 accent，所以非 running 的 note 行恰好 2 个，
    // running 的那行会多出 1 个（整行 accent）——「只有在跑的才有颜色」就是这么落地的。
    const accents = (line: string): number => (line.match(/<accent>/gu) ?? []).length;
    const noteLines = lines
      .slice(SIDEBAR_HEADER_ROWS, SIDEBAR_HEADER_ROWS + view.rows.length)
      .map((line, index) => ({ line, row: view.rows[index] }))
      .filter((item) => item.row?.kind === "note");
    const idle = noteLines.filter((item) => item.row?.running !== true);
    const running = noteLines.filter((item) => item.row?.running === true);
    expect(idle.length).toBeGreaterThan(0);
    expect(running.length).toBeGreaterThan(0);
    for (const { line } of idle) {
      expect(accents(line)).toBe(2);
      expect(line).not.toContain("<dim>");
    }
    for (const { line } of running) expect(accents(line)).toBe(3);
    // 状态名自己承担区分：待开工 / 阻塞 直接写在行里，已完成由折叠行与展开后的行承担。
    expect(text).toContain("待开工 · 01 待办");
    expect(text).toContain("阻塞 · 05 卡住");
    expect(text).toContain("已完成 1 条 ▸");
    const expanded = renderSidebarLines(
      buildSidebarView(demoPlans(), ["pi/active/2026-01-01-demo"]),
      SIDEBAR_WIDTH,
      colorTheme as never,
    ).join("\n");
    expect(expanded).toContain("已完成 · 06 完成");
    expect(expanded).not.toContain("<dim>");
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

  it("行文本：状态 · temp id · 摘要，不出现待消费", () => {
    const full = tempRowText(temp("temp:5", { summary: "读完了" }), 60);
    expect(full).toBe("执行中 · temp:5 · 读完了");

    // 40 列侧栏里 temp 行只有 30 列：摘要被截并补省略号。
    const partial = stripTerminalSequences(
      tempRowText(temp("temp:5", { summary: "正在核对侧栏渲染与临时分组" }), 30),
    );
    expect(partial.startsWith("执行中 · temp:5 · 正在核对")).toBe(true);
    expect(partial.endsWith("…")).toBe(true);
    expect(visibleWidth(partial)).toBeLessThanOrEqual(30);

    // 一点余量都没有：只留状态与 id，不留孤零零的省略号。
    expect(stripTerminalSequences(tempRowText(temp("temp:5"), 18))).toBe("执行中 · temp:5");

    // 任何宽度下都不出现「待消费」。
    for (const width of [18, 24, 30, 60]) {
      expect(tempRowText(temp("temp:5"), width)).not.toContain("待消费");
    }
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

describe("status 文案", () => {
  it("有 live worker 时 pending 显示执行中（不依赖 worker 改 in_progress）", () => {
    expect(noteStatusText({ status: "pending", running: true })).toBe("执行中");
    expect(noteStatusText({ status: "pending" })).toBe("待开工");
    // 业务结论不被覆盖：等验收 / 阻塞 / 完成照旧。
    expect(noteStatusText({ status: "waiting", needs: "review", running: true })).toBe("待验收");
    expect(noteStatusText({ status: "waiting", needs: "answer" })).toBe("待回答");
    expect(noteStatusText({ status: "blocked", running: true })).toBe("阻塞");
    expect(noteStatusText({ status: "completed", running: true })).toBe("已完成");
  });
});

describe("结构快照（追加口径锁定）", () => {
  const plans = (): SidebarPlan[] => [
    {
      ref: "pi/active/2026-11-07-demo",
      name: "2026-11-07-demo",
      groups: [
        group(
          `${WORKER_NOTES_LABEL}43,44`,
          [
            note("43", "侧栏改版", "in_progress", { running: true }),
            note("44", "追问默认 steer", "waiting", { needs: "review", running: true }),
          ],
          true,
        ),
        group(UNGROUPED_LABEL, [
          note("01", "旧活", "completed"),
          note("02", "更旧的活", "completed"),
        ]),
      ],
    },
    {
      ref: "pi/active/2026-11-08-demo2",
      name: "2026-11-08-demo2",
      groups: [group(`${WORKER_NOTES_LABEL}05`, [note("05", "另一个 Plan 的活", "pending")], true)],
    },
  ];

  it("整帧：树形层级 + Plan 间一行空行 + 最下方 temp workers + 40 列对齐", () => {
    const temps: SidebarTemp[] = [
      { id: "temp:5", status: "in_progress", summary: "核对合成逻辑" },
      { id: "temp:6", status: "completed", summary: "侧栏渲染核对完毕" },
    ];
    const lines = renderSidebarLines(
      buildSidebarView(plans(), ["pi/active/2026-11-07-demo"], undefined, temps),
      SIDEBAR_WIDTH,
      fakeTheme as never,
    ).map((line) => stripTerminalSequences(line));

    expect(lines).toEqual([
      "┌ ▤ Note 状态 ─────────────────────────┐",
      "│ demo                                 │",
      "│ ├─ worker: notes 43,44               │",
      "│ │  ├─ 执行中 · 43 侧栏改版           │",
      "│ │  └─ 待验收 · 44 追问默认 steer     │",
      "│ ├─ 未分组                            │",
      "│ │  ├─ 已完成 · 01 旧活               │",
      "│ │  └─ 已完成 · 02 更旧的活           │",
      "│ └─ 已完成 2 条 ▾                     │",
      "│                                      │",
      "│ demo2                                │",
      "│ └─ worker: notes 05                  │",
      "│    └─ 待开工 · 05 另一个 Plan 的活   │",
      "│                                      │",
      "│ └─ temp workers                      │",
      "│    ├─ 执行中 · temp:5 · 核对合成逻辑 │",
      "│    └─ 已完成 · temp:6 · 侧栏渲染核…  │",
      "└──────────────────────────────────────┘",
    ]);

    // 1) 宽度恒 40（40 内容宽 + margin 1 ⇒ 屏幕 42）。
    for (const line of lines) expect(visibleWidth(line)).toBe(SIDEBAR_WIDTH);
    // 2) 只有 Plan 之间 / Plan 与 temp 分组之间有空行（恰好两处），组与 note 之间没有。
    const blank = `│${" ".repeat(SIDEBAR_WIDTH - 2)}│`;
    expect(lines.slice(1, -1).filter((line) => line === blank)).toHaveLength(2);
    // 3) 层级只用树形接续符。
    for (const mark of [TREE_BRANCH, TREE_LAST, TREE_PIPE, TREE_BLANK]) {
      expect(lines.some((line) => line.includes(mark))).toBe(true);
    }
    // 4) 侧栏任何位置都没有“待消费”。
    for (const line of lines) expect(line).not.toContain("待消费");
  });

  it("没有 live 临时 worker 时，temp 分组与它前面的空行都不出现", () => {
    const lines = renderSidebarLines(
      buildSidebarView(plans(), [], undefined, []),
      SIDEBAR_WIDTH,
      fakeTheme as never,
    ).map((line) => stripTerminalSequences(line));
    for (const line of lines) expect(line).not.toContain(TEMP_SECTION_LABEL);
    // 末尾不留尾巴空行：最后一行正文就是第二个 Plan 的 note。
    expect(lines.at(-2)).toContain("待开工 · 05 另一个 Plan 的活");
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

describe("按依赖闭包分组", () => {
  /** 把一组 note + 派工 specs 拼成单 Plan 帧。 */
  const planOf = (
    notes: readonly SidebarNote[],
    specs: readonly WorkerGroupSpec[],
  ): SidebarPlan => ({
    ref: "pi/active/2026-11-07-closure",
    name: "2026-11-07-closure",
    groups: groupSidebarNotes(notes, specs),
  });
  /** 帧里的 note 行（不含组与标题行）。 */
  const noteRows = (
    notes: readonly SidebarNote[],
    specs: readonly WorkerGroupSpec[],
  ): readonly SidebarRow[] =>
    buildSidebarView([planOf(notes, specs)]).rows.filter((row) => row.kind === "note");

  it("派工的 note 把下游一起带进组：45 + 46 同组，46 显示真实状态", () => {
    const notes = [
      note("45", "侧栏", "in_progress"),
      note("46", "依赖侧栏", "pending", { blockedBy: ["45"] }),
    ];
    const groups = groupSidebarNotes(notes, [{ notes: ["45"], running: true }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("45,46");
    expect(groups[0]?.label).toBe(`${WORKER_NOTES_LABEL}45,46`);
    expect(groups[0]?.notes.map((item) => item.id)).toEqual(["45", "46"]);
    const rows = noteRows(notes, [{ notes: ["45"], running: true }]);
    expect(rows.map((row) => row.note)).toEqual(["45", "46"]);
    // 46 是真实状态（待开工），不是因为它被“展开”而变成别的。
    expect(rows[1]?.text).toContain("待开工 · 46 依赖侧栏");
    expect(rows.some((row) => row.text.includes(UNGROUPED_LABEL))).toBe(false);
  });

  it("上游也进同组：44 被 45 依赖，派 45 就带上 44", () => {
    const notes = [
      note("44", "前置", "pending"),
      note("45", "中间", "in_progress", { blockedBy: ["44"] }),
      note("46", "后续", "pending", { blockedBy: ["45"] }),
    ];
    const specs: readonly WorkerGroupSpec[] = [{ notes: ["45"], running: true }];
    const groups = groupSidebarNotes(notes, specs);
    expect(groups.map((item) => item.label)).toEqual([`${WORKER_NOTES_LABEL}44,45,46`]);
    expect(groups[0]?.notes.map((item) => item.id)).toEqual(["44", "45", "46"]);
    // 执行中置顶，其余按 id。
    expect(noteRows(notes, specs).map((row) => row.note)).toEqual(["45", "44", "46"]);
  });

  it("已完成的仍在组里但不进可见行，只计入「已完成 N 条」", () => {
    const notes = [
      note("45", "待办", "pending"),
      note("46", "已完成", "completed", { blockedBy: ["45"] }),
    ];
    const specs: readonly WorkerGroupSpec[] = [{ notes: ["45", "46"], running: true }];
    const groups = groupSidebarNotes(notes, specs);
    expect(groups[0]?.notes.map((item) => item.id)).toEqual(["45", "46"]);
    const collapsed = buildSidebarView([planOf(notes, specs)]).rows;
    expect(collapsed.some((row) => row.note === "46")).toBe(false);
    expect(collapsed.at(-1)).toMatchObject({ kind: "fold" });
    expect(collapsed.at(-1)?.text).toContain(`${COMPLETED_LABEL} 1 条`);
    // 展开后它才出现，且仍在组内（组名不变）。
    const open = buildSidebarView([planOf(notes, specs)], ["pi/active/2026-11-07-closure"]).rows;
    expect(open.find((row) => row.note === "46")?.text).toContain("已完成 · 46 已完成");
  });

  it("闭包重叠时只归组键最前的组，行尾标 ↔", () => {
    // 未完成的连通分量双向闭合，所以两个组的闭包重叠只会来自“已完成的种子”。
    // 这里 03 已完成，同时是 A（01,03）与 B（03,04）的种子。
    const notes = [
      note("01", "左支", "pending"),
      note("03", "已完成", "completed"),
      note("04", "右支", "pending"),
    ];
    const specs: readonly WorkerGroupSpec[] = [
      { notes: ["01", "03"], running: true },
      { notes: ["03", "04"], running: true },
    ];
    const groups = groupSidebarNotes(notes, specs);
    expect(groups.map((item) => item.label)).toEqual([
      `${WORKER_NOTES_LABEL}01,03`,
      `${WORKER_NOTES_LABEL}03,04`,
    ]);
    expect(groups[0]?.notes.map((item) => item.id)).toEqual(["01", "03"]);
    expect(groups[1]?.notes.map((item) => item.id)).toEqual(["04"]);

    const frame = (): readonly SidebarRow[] =>
      buildSidebarView([planOf(notes, specs)], ["pi/active/2026-11-07-closure"]).rows;
    const rows = frame();
    // 03 只出现一次（且只在展开后出现，因为已完成），行尾带标记。
    expect(rows.filter((row) => row.note === "03")).toHaveLength(1);
    const sharedRow = rows.find((row) => row.note === "03");
    expect(sharedRow?.text.endsWith(SHARED_MARK)).toBe(true);
    // 不重叠的行不带标记。
    expect(rows.find((row) => row.note === "01")?.text).not.toContain(SHARED_MARK);
    expect(rows.find((row) => row.note === "04")?.text).not.toContain(SHARED_MARK);
    // 标记要算进宽度：不挤掉状态与 id。
    const shared = note("01", "很长的名称很长的名称很长的名称", "pending", { shared: true });
    const narrow = stripTerminalSequences(noteRowText(shared, 14));
    expect(visibleWidth(narrow)).toBeLessThanOrEqual(14);
    expect(narrow.startsWith("待开工 · 01 ")).toBe(true);
    expect(narrow.endsWith(SHARED_MARK)).toBe(true);
  });

  it("两个组的闭包完全相同（同一条链拆成两组派）时 note 也不重复", () => {
    // 45 → 46 是同一条链，两个组各自的闭包都是 {45,46}：键相等时按组实例判归属，
    // 只归排序最前的那个组，另一组因此为空、不列出（同一条链本就不该拆两组并行派）。
    const notes = [
      note("45", "前", "in_progress"),
      note("46", "后", "pending", { blockedBy: ["45"] }),
    ];
    const specs: readonly WorkerGroupSpec[] = [
      { notes: ["45"], running: true },
      { notes: ["46"], running: true },
    ];
    const groups = groupSidebarNotes(notes, specs);
    expect(groups.map((item) => item.label)).toEqual([`${WORKER_NOTES_LABEL}45,46`]);
    expect(noteRows(notes, specs).map((row) => row.note)).toEqual(["45", "46"]);
    expect(noteRows(notes, specs).filter((row) => row.note === "45")).toHaveLength(1);
  });

  it("既没被闭包覆盖也没派工的 note 落 未分组", () => {
    const notes = [note("01", "在闭包里", "pending"), note("02", "历史遗留", "pending")];
    const specs: readonly WorkerGroupSpec[] = [{ notes: ["01"], running: true }];
    const groups = groupSidebarNotes(notes, specs);
    expect(groups.map((item) => item.label)).toEqual([`${WORKER_NOTES_LABEL}01`, UNGROUPED_LABEL]);
    expect(groups[1]?.notes.map((item) => item.id)).toEqual(["02"]);
  });

  it("执行中置顶，其余按 id 升序（含 live worker 的 pending）", () => {
    const notes = [
      note("04", "等人答", "waiting", { needs: "answer" }),
      note("05", "有 worker", "pending", { running: true }),
      note("06", "在改了", "in_progress"),
    ];
    const specs: readonly WorkerGroupSpec[] = [{ notes: ["04", "05", "06"], running: true }];
    expect(noteRows(notes, specs).map((row) => row.note)).toEqual(["05", "06", "04"]);
  });

  it("组缓存：签名不变复用同一份结果，变了才重建", () => {
    const notes = [note("01", "A", "pending"), note("02", "B", "pending", { blockedBy: ["01"] })];
    const specs: readonly WorkerGroupSpec[] = [{ notes: ["02"], running: true }];
    const cache = createSidebarGroupCache();
    const first = cache.groupsOf("/tmp/plan", notes, specs);
    const second = cache.groupsOf("/tmp/plan", notes, specs);
    expect(second).toBe(first);
    expect(second.map((item) => item.label)).toEqual([`${WORKER_NOTES_LABEL}01,02`]);
    // 不同 Plan 目录不共用缓存。
    expect(cache.groupsOf("/tmp/other", notes, specs)).not.toBe(first);
    // 状态变了（闭包输入变）：重建。
    const changed = [notes[0]!, { ...notes[1]!, status: "in_progress" as const }];
    expect(cache.groupsOf("/tmp/plan", changed, specs)).not.toBe(first);
    expect(sidebarGroupSignature(notes, specs)).toBe(sidebarGroupSignature(notes, specs));
    expect(sidebarGroupSignature(notes, specs)).not.toBe(sidebarGroupSignature(changed, specs));
    expect(sidebarGroupSignature(notes, specs)).not.toBe(
      sidebarGroupSignature(notes, [{ notes: ["02"], running: false }]),
    );
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

  it("账本一变就刷新（同进程 <50ms），3s 定时器只做跨进程兜底", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-live", [
      { ...(runningNote("07", "侧栏实现") as Record<string, unknown>), status: "pending" },
    ]);
    const registry = createRegistry();
    registry.add(workerEntry(directory, ["07"]));
    const listeners: Array<() => void> = [];
    const sidebar = createSidebar({
      registry,
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
      events: {
        subscribe: (listener) => {
          listeners.push(listener);
          return () => undefined;
        },
      },
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    expect(SIDEBAR_REFRESH_MS).toBeGreaterThanOrEqual(3_000);
    await wait(30);
    const textOf = (): string => (overlays[1]?.component.render(SIDEBAR_WIDTH) ?? []).join("\n");
    // notes.json 里还是 pending，但投影说这条 note 有 live worker ⇒ 执行中。
    expect(textOf()).toContain("执行中 · 07 侧栏实现");

    // 模拟 worker 报完 waiting/review（改 notes.json），随后账本 append 触发订阅。
    const document = parseDocument(
      {
        version: 1,
        index: [],
        notes: [
          {
            ...(runningNote("07", "侧栏实现") as Record<string, unknown>),
            status: "waiting",
            needs: "review",
          },
        ],
      },
      DEFAULT_ORCHESTRATOR_SETTINGS,
    );
    await writeFile(join(directory, "notes.json"), serializeDocument(document), "utf8");

    const started = Date.now();
    for (const listener of listeners) listener();
    while (!textOf().includes("待验收 · 07") && Date.now() - started < 500) await wait(2);
    const elapsed = Date.now() - started;
    expect(textOf()).toContain("待验收 · 07");
    // 同进程订阅：远快于 3s 轮询。
    expect(elapsed).toBeLessThan(50);
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

  it("详情卡片的流跟随该组当前 live worker：abort 后重绑，两代不混流", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-rebind", [
      runningNote("07", "侧栏实现"),
    ]);
    const registry = createRegistry();
    /** 每一代会话都记下自己的订阅者与退订次数：重绑的证据就在这里。 */
    const generation = () => {
      const state = { listeners: [] as Array<(event: unknown) => void>, subscribed: 0, stopped: 0 };
      const session: SessionLike = {
        ...fakeSession(),
        subscribe: (listener) => {
          state.subscribed += 1;
          state.listeners.push(listener);
          return () => {
            state.stopped += 1;
          };
        },
      };
      return { state, session };
    };
    const first = generation();
    const key = `${directory}::07`;
    registry.add({
      planDirectory: key,
      planRef: "demo/active/2026-01-01-rebind",
      notes: ["07"],
      startedAt: Date.now(),
      session: first.session,
    });
    const refreshListeners: Array<() => void> = [];
    const sidebar = createSidebar({
      registry,
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
      events: {
        subscribe: (listener) => {
          refreshListeners.push(listener);
          return () => undefined;
        },
      },
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    overlays[1]?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 2));
    const card = (): string => (overlays[2]?.component.render(DETAIL_WIDTH) ?? []).join("\n");
    /** 刷新是异步读盘 + setTimeout(0)：轮询到位再断言，不赌 20ms。 */
    const waitFor = async (predicate: () => boolean): Promise<void> => {
      const started = Date.now();
      while (!predicate() && Date.now() - started < 1_000) await wait(2);
    };
    // 一代：卡片绑的就是它，流目标写在卡片上。
    await waitFor(() => first.state.subscribed === 1);
    expect(first.state.subscribed).toBe(1);
    expect(card()).toContain("流目标：demo/active/2026-01-01-rebind");
    first.state.listeners[0]?.({ type: "tool_execution_start", toolName: "一代工具" });
    expect(card()).toContain("⋯ 一代工具");

    // abort：句柄没了，但卡片不关、不“永久丢弃”——只解绑。
    registry.remove(key);
    for (const listener of refreshListeners) listener();
    await waitFor(() => first.state.stopped === 1);
    expect(first.state.stopped).toBe(1);
    expect(card()).toContain("◇ note 07");
    expect(card()).not.toContain("流目标：");

    // 同组重派（新一代）：下一帧就重新绑上，且只看到新一代的流。
    const second = generation();
    registry.add({
      planDirectory: key,
      planRef: "demo/active/2026-01-01-rebind",
      notes: ["07"],
      startedAt: Date.now() + 1000,
      session: second.session,
    });
    for (const listener of refreshListeners) listener();
    await waitFor(() => second.state.subscribed === 1);
    expect(second.state.subscribed).toBe(1);
    expect(card()).toContain("流目标：demo/active/2026-01-01-rebind");
    second.state.listeners[0]?.({ type: "tool_execution_start", toolName: "二代工具" });
    expect(card()).toContain("⋯ 二代工具");
    // 两代不混流：一代那条已经随退订消失。
    expect(card()).not.toContain("一代工具");
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

  it("临时 worker（temp:*）单独成组：状态 · id · 摘要（不含待消费）", async () => {
    const root = await tempWorkspace([]);
    const registry = createRegistry();
    registry.add({
      planDirectory: "temp:5",
      planRef: "temp:5",
      kind: "temp",
      startedAt: Date.now(),
      session: fakeSession(),
      job: {
        kind: "message",
        startedAt: Date.now(),
        progressAt: Date.now(),
        settled: Promise.resolve(),
        notified: false,
      },
      lastInput: { kind: "message", delivery: "queue", text: "看一下侧栏", at: Date.now() },
    });
    registry.add({
      planDirectory: "temp:6",
      planRef: "temp:6",
      kind: "temp",
      startedAt: Date.now(),
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
    expect(text).toContain("执行中 · temp:5 · 看一下侧栏");
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
    // 卡片也不放待消费：诊断信息只在 orchestrator_state 里。
    expect(card).not.toContain("待消费");
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

describe("分组来源与组折叠（note 62）", () => {
  /** 帧里的纯文本：渲染成 40 列的行，去掉边框与内距（断言只看内容与先后顺序）。 */
  const bodyOf = (component: Component): readonly string[] =>
    component
      .render(SIDEBAR_WIDTH)
      .slice(SIDEBAR_HEADER_ROWS, -1)
      .map((line) => stripTerminalSequences(line).replaceAll("│", "").trimEnd());
  const indexOf = (lines: readonly string[], needle: string): number =>
    lines.findIndex((line) => line.includes(needle));

  it("分组走结构化数据：live 句柄退场后仍按派工种子分组，不回退到平铺 未分组", async () => {
    /** 一条指定状态的 note（派工种子的闭包要靠 blocked_by 拉进来）。 */
    const planNote = (
      id: string,
      title: string,
      status: string,
      blockedBy: string[] = [],
    ): unknown => ({
      ...(runningNote(id, title) as Record<string, unknown>),
      status,
      blocked_by: blockedBy,
    });
    const { root, directory } = await tempPlan("demo", "2026-01-01-groups", [
      planNote("07", "侧栏分组", "in_progress"),
      // 只给 07 派工：08 靠 blocked_by 进 07 的闭包。
      planNote("08", "依赖分组", "pending", ["07"]),
      planNote("01", "历史残留", "pending"),
    ]);
    // 句柄表是空的：worker 已 exit（合并回收 / abort / 重启）—— 症状现场就是这一帧。
    const registry = createRegistry();
    const sidebar = createSidebar({
      registry,
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
      workers: () => [{ worker: `${directory}::07`, notes: ["07"], running: false }],
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    const lines = bodyOf(overlays[1]!.component);
    const groupAt = indexOf(lines, `${WORKER_NOTES_LABEL}07,08`);
    const ungroupedAt = indexOf(lines, UNGROUPED_LABEL);
    // 三级分组还在：Plan → worker 组 → note。
    expect(groupAt).toBeGreaterThan(-1);
    expect(ungroupedAt).toBeGreaterThan(groupAt);
    // 07 / 08 归组，只有真没归属的 01 落 未分组。
    expect(indexOf(lines, "07 侧栏分组")).toBeGreaterThan(groupAt);
    expect(indexOf(lines, "07 侧栏分组")).toBeLessThan(ungroupedAt);
    expect(indexOf(lines, "08 依赖分组")).toBeLessThan(ungroupedAt);
    expect(indexOf(lines, "01 历史残留")).toBeGreaterThan(ungroupedAt);
    sidebar.dispose();
  });

  it("点组行收起 / 展开，且 refresh 之后收起状态保持", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-fold", [
      runningNote("07", "侧栏实现"),
      {
        ...(runningNote("08", "依赖实现") as Record<string, unknown>),
        status: "pending",
        blocked_by: ["07"],
      },
    ]);
    const registry = createRegistry();
    registry.add(workerEntry(directory, ["07"]));
    const listeners: Array<() => void> = [];
    const sidebar = createSidebar({
      registry,
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
      events: {
        subscribe: (listener) => {
          listeners.push(listener);
          return () => undefined;
        },
      },
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    const list = overlays[1]!;
    const textOf = (): string => bodyOf(list.component).join("\n");
    // 组行是 Plan 下面的第一支（行 1），点它收起。
    expect(textOf()).toContain("07 侧栏实现");
    list.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 1));
    expect(textOf()).toContain(`${WORKER_NOTES_LABEL}07,08 ${GROUP_COLLAPSED_MARK} 2 条`);
    expect(textOf()).not.toContain("07 侧栏实现");
    expect(textOf()).not.toContain("08 依赖实现");

    // 刷新（盘上多一条 note 触发重绘）：收起状态不重置。
    const document = parseDocument(
      {
        version: 1,
        index: [],
        notes: [
          runningNote("07", "侧栏实现"),
          {
            ...(runningNote("08", "依赖实现") as Record<string, unknown>),
            status: "pending",
            blocked_by: ["07"],
          },
          { ...(runningNote("09", "新条目") as Record<string, unknown>), status: "pending" },
        ],
      },
      DEFAULT_ORCHESTRATOR_SETTINGS,
    );
    await writeFile(join(directory, "notes.json"), serializeDocument(document), "utf8");
    for (const listener of listeners) listener();
    const started = Date.now();
    while (!textOf().includes("09 新条目") && Date.now() - started < 1_000) await wait(2);
    expect(textOf()).toContain("09 新条目");
    expect(textOf()).toContain(`${GROUP_COLLAPSED_MARK} 2 条`);
    expect(textOf()).not.toContain("07 侧栏实现");

    // 再点一下展开：子行回来，标记消失。
    list.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 1));
    expect(textOf()).toContain("07 侧栏实现");
    expect(textOf()).not.toContain(GROUP_COLLAPSED_MARK);
    sidebar.dispose();
  });

  it("投影里的历史 worker 不抢流：卡片只绑 live 句柄，换代重绑且两代不混流", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-history", [
      runningNote("07", "侧栏实现"),
    ]);
    const key = `${directory}::07`;
    /** 每一代会话都记下自己的订阅者与退订次数：重绑的证据就在这里。 */
    const generation = () => {
      const state = { listeners: [] as Array<(event: unknown) => void>, subscribed: 0, stopped: 0 };
      const session: SessionLike = {
        ...fakeSession(),
        subscribe: (listener) => {
          state.subscribed += 1;
          state.listeners.push(listener);
          return () => {
            state.stopped += 1;
          };
        },
      };
      return { state, session };
    };
    const stale = generation();
    const first = generation();
    const registry = createRegistry();
    registry.add({
      planDirectory: key,
      planRef: "demo/active/2026-01-01-history",
      notes: ["07"],
      startedAt: Date.now(),
      session: first.session,
    });
    const refreshListeners: Array<() => void> = [];
    const sidebar = createSidebar({
      registry,
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
      events: {
        subscribe: (listener) => {
          refreshListeners.push(listener);
          return () => undefined;
        },
      },
      // 账本里还有更早的一代（已退出）：它有 notes、也是同一个组，但没有 live 会话。
      workers: () => [
        { worker: `${key}#3`, notes: ["07"], running: false },
        { worker: key, notes: ["07"], running: true },
      ],
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    overlays[1]?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 2));
    const card = (): string => (overlays[2]?.component.render(DETAIL_WIDTH) ?? []).join("\n");
    const waitFor = async (predicate: () => boolean): Promise<void> => {
      const started = Date.now();
      while (!predicate() && Date.now() - started < 1_000) await wait(2);
    };
    await waitFor(() => first.state.subscribed === 1);
    expect(first.state.subscribed).toBe(1);
    // 历史那一代一次都没被订阅（不会把两代混进一张卡片）。
    expect(stale.state.subscribed).toBe(0);

    // 换代（同组重派）：解旧绑新，只看到新一代的流。
    const second = generation();
    registry.remove(key);
    registry.add({
      planDirectory: key,
      planRef: "demo/active/2026-01-01-history",
      notes: ["07"],
      startedAt: Date.now() + 1_000,
      session: second.session,
    });
    for (const listener of refreshListeners) listener();
    await waitFor(() => second.state.subscribed === 1);
    expect(first.state.stopped).toBe(1);
    first.state.listeners[0]?.({ type: "tool_execution_start", toolName: "一代工具" });
    second.state.listeners[0]?.({ type: "tool_execution_start", toolName: "二代工具" });
    expect(card()).toContain("⋯ 二代工具");
    expect(card()).not.toContain("一代工具");
    expect(stale.state.subscribed).toBe(0);
    sidebar.dispose();
  });
});

describe("收起态的口径（真机回归 note 62）", () => {
  /** 一个只有已完成 note 的组（真机帧里 46–50 就是这种：一条已完成、一个组头）。 */
  const doneGroupPlans = (count: number): SidebarPlan[] => [
    {
      ref: "pi/active/2026-11-07-done",
      name: "2026-11-07-done",
      groups: [
        group(
          `${WORKER_NOTES_LABEL}46`,
          Array.from({ length: count }, (_, index) =>
            note(String(index + 1).padStart(2, "0"), "已完成项", "completed"),
          ),
        ),
      ],
    },
  ];

  it("只含已完成 note 的单条组不提供收起：点了也还是展开（真机帧里 `worker: notes 46 ▸ 1 条` 是噪声）", () => {
    const plans = doneGroupPlans(1);
    const collapsed = new Set([`${plans[0]!.ref}::${WORKER_NOTES_LABEL}46`]);
    const view = buildSidebarView(plans, [plans[0]!.ref], undefined, [], collapsed);
    const groupRow = view.rows.find((row) => row.kind === "group");
    // 组后面还有「已完成 N 条」那一支 ⇒ 组行是 ├─。
    expect(groupRow?.text).toBe(`${TREE_BRANCH}${WORKER_NOTES_LABEL}46`);
    expect(groupRow?.collapsed).toBeUndefined();
    // 子行照旧展开：收起 1 条等于没省地方，只留一行 `▸ 1 条` 让人以为坏了。
    expect(view.rows.filter((row) => row.kind === "note")).toHaveLength(1);
  });

  it("确实能省地方的纯已完成组可收起，且文案自解释（`▸ 已完成 N 条`）", () => {
    const plans = doneGroupPlans(2);
    const key = `${plans[0]!.ref}::${WORKER_NOTES_LABEL}46`;
    const collapsed = buildSidebarView(plans, [plans[0]!.ref], undefined, [], new Set([key]));
    const row = collapsed.rows.find((item) => item.kind === "group");
    expect(row?.collapsed).toBe(true);
    expect(row?.text).toBe(
      `${TREE_BRANCH}${WORKER_NOTES_LABEL}46 ${GROUP_COLLAPSED_MARK} ${COMPLETED_LABEL} 2 条`,
    );
    expect(collapsed.rows.filter((item) => item.kind === "note")).toHaveLength(0);
  });

  it("投影里 suspended / merged 的历史 worker 不算 live：不高亮、也不认领 未分组", async () => {
    const { root, directory } = await tempPlan("demo", "2026-01-01-suspended", [
      runningNote("07", "侧栏实现"),
      { ...(runningNote("08", "历史遗留") as Record<string, unknown>), status: "pending" },
    ]);
    // 真机现场（note 56）：账本是 `worker.suspended`，但没有 `worker.exit` ⇒ 投影 status 仍是 live。
    expect(groupSourceLive({ status: "live", suspended: { at: "2026-01-01T00:00:00.000Z" } })).toBe(
      false,
    );
    expect(groupSourceLive({ status: "live", merged: { at: "2026-01-01T00:00:00.000Z" } })).toBe(
      false,
    );
    expect(groupSourceLive({ status: "live", timedOut: { at: "2026-01-01T00:00:00.000Z" } })).toBe(
      false,
    );
    expect(groupSourceLive({ status: "live" })).toBe(true);
    expect(groupSourceLive({ status: "exited" })).toBe(false);

    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
      workers: () => [
        // Plan 级派工（还没有种子）但已 suspended：不许把两条 note 洗成 `worker: plan`。
        {
          worker: `${directory}::`,
          notes: [],
          running: groupSourceLive({
            status: "live",
            suspended: { at: "2026-01-01T00:00:00.000Z" },
          }),
        },
        {
          worker: `${directory}::07`,
          notes: ["07"],
          running: groupSourceLive({ status: "live" }),
        },
      ],
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    const text = (overlays[1]?.component.render(SIDEBAR_WIDTH) ?? []).join(String.fromCharCode(10));
    expect(text).toContain(`${WORKER_NOTES_LABEL}07`);
    expect(text).toContain(UNGROUPED_LABEL);
    expect(text).not.toContain(WORKER_PLAN_LABEL);
    sidebar.dispose();
  });
});
