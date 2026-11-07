import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth, type Component, type OverlayOptions } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_ORCHESTRATOR_SETTINGS } from "./config.ts";
import { parseDocument, serializeDocument } from "./dag.ts";
import { createRegistry, type SessionLike, type WorkerEntry } from "./handles.ts";
import {
  buildSidebarView,
  createIconComponent,
  createSidebar,
  createSidebarComponent,
  ICON_CLOSED,
  ICON_OPEN,
  noteMark,
  noteStatusLabel,
  renderSidebarLines,
  SIDEBAR_HEADER_ROWS,
  SIDEBAR_MARGIN,
  SIDEBAR_MIN_COLUMNS,
  SIDEBAR_REFRESH_MS,
  SIDEBAR_TITLE,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDGET_KEY,
  shortPlanName,
  sidebarTotals,
  type SidebarNote,
  type SidebarPlan,
  type SidebarRow,
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

const demoPlans = (): SidebarPlan[] => [
  {
    ref: "pi/active/2026-01-01-demo",
    name: "2026-01-01-demo",
    notes: [
      note("01", "待办", "pending"),
      note("02", "在跑", "in_progress", { running: true }),
      note("03", "等验收", "waiting", { needs: "review" }),
      note("04", "等人答", "waiting", { needs: "answer" }),
      note("05", "卡住", "blocked", { blockedReason: "缺凭据" }),
      note("06", "完成", "completed"),
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
  it("按 Plan 分组，未完成按状态排序，已完成折叠成一行", () => {
    const view = buildSidebarView(demoPlans());
    expect(view.header).toContain("1 执行");
    expect(view.header).toContain("2 待确认");
    expect(view.rows[0]).toMatchObject({ kind: "plan", plan: "pi/active/2026-01-01-demo" });
    // in_progress → waiting → blocked → pending
    expect(view.rows.slice(1, 6).map((row) => row.note)).toEqual(["02", "03", "04", "05", "01"]);
    expect(view.rows[1]?.text.startsWith("▶")).toBe(true);
    const fold = view.rows[6];
    expect(fold).toMatchObject({ kind: "fold", text: "已完成 1 条 ▸" });
  });

  it("展开后把已完成的 note 也列出来", () => {
    const view = buildSidebarView(demoPlans(), ["pi/active/2026-01-01-demo"]);
    const fold = view.rows.findIndex((row) => row.kind === "fold");
    expect(view.rows[fold]?.text).toBe("已完成 1 条 ▾");
    expect(view.rows.at(-1)?.note).toBe("06");
  });

  it("多个 Plan 之间留一个空行，汇总跨 Plan 累加", () => {
    const plans: SidebarPlan[] = [
      { ref: "a/active/x", name: "2026-01-02-x", notes: [note("01", "A", "blocked")] },
      { ref: "a/active/y", name: "2026-01-03-y", notes: [note("02", "B", "waiting")] },
    ];
    const view = buildSidebarView(plans);
    expect(view.rows.map((row) => row.kind)).toEqual(["plan", "note", "spacer", "plan", "note"]);
    expect(sidebarTotals(plans)).toEqual({ running: 0, waiting: 1, blocked: 1, notes: 2 });
    expect(view.header).toContain("1 阻塞");
  });

  it("状态符号与展示名", () => {
    expect(noteMark(note("01", "", "pending"))).toBe("·");
    expect(noteMark(note("02", "", "in_progress"))).toBe("●");
    expect(noteMark(note("03", "", "waiting", { needs: "review" }))).toBe("◆");
    expect(noteMark(note("04", "", "waiting", { needs: "answer" }))).toBe("?");
    expect(noteMark(note("05", "", "blocked"))).toBe("⊘");
    expect(noteMark(note("06", "", "completed"))).toBe("✓");
    expect(noteStatusLabel(note("04", "", "waiting", { needs: "answer" }))).toBe("waiting/answer");
    expect(noteStatusLabel(note("02", "", "in_progress"))).toBe("in_progress");
    expect(shortPlanName("2026-11-07-pi多plan编排")).toBe("pi多plan编排");
  });

  it("外框 + 行与 rows 一一对应，且每行不超 32 列", () => {
    const view = buildSidebarView(demoPlans());
    const lines = renderSidebarLines(view, SIDEBAR_WIDTH, fakeTheme as never);
    // 上边框（含标题）+ 汇总行 + rows + 下边框
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
    // 第 i 行（0 起）的文本就是 rows[i]
    expect(lines[SIDEBAR_HEADER_ROWS]?.replaceAll("│", "").trim()).toContain("▾ demo");
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
    // 行 0 是 Plan 标题，行 1 是第一条 note。
    component.handleMouse?.(click(SIDEBAR_HEADER_ROWS));
    expect(rows[0]).toMatchObject({ kind: "plan" });
    component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 1));
    expect(rows[1]).toMatchObject({ kind: "note", note: "02" });
    // 折叠行
    component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 6));
    expect(rows[2]).toMatchObject({ kind: "fold" });
    // 越界不崩
    expect(component.handleMouse?.(click(200))).toEqual({ handled: true });
    expect(rows).toHaveLength(3);
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

const tempWorkspace = async (notes: unknown[]): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "pi-sidebar-"));
  created.push(root);
  const directory = join(root, ".agents/domains/demo/plans/active/2026-01-01-demo");
  await mkdir(directory, { recursive: true });
  const document = parseDocument({ version: 1, index: [], notes }, DEFAULT_ORCHESTRATOR_SETTINGS);
  await writeFile(join(directory, "notes.json"), serializeDocument(document), "utf8");
  return root;
};

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

const fakeSession = (): SessionLike => ({
  isIdle: false,
  prompt: async () => undefined,
  steer: async () => undefined,
  followUp: async () => undefined,
  waitForIdle: async () => undefined,
  abort: async () => undefined,
  dispose: () => undefined,
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

  it("编排模式下挂图标 + 32 列侧栏，并读盘出列表", async () => {
    const root = await tempWorkspace([runningNote("07", "侧边栏实现")]);
    const registry = createRegistry();
    const sidebar = createSidebar({ registry, limits: () => DEFAULT_ORCHESTRATOR_SETTINGS });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    expect(overlays).toHaveLength(2);
    const [icon, list] = overlays;
    expect(icon?.options).toMatchObject({ anchor: "top-right", nonCapturing: true });
    expect(list?.options).toMatchObject({
      anchor: "right-center",
      width: SIDEBAR_WIDTH,
      maxHeight: "100%",
      // 四周各留 1 列/1 行：32 是组件内容宽，屏幕上占 34 列。
      margin: SIDEBAR_MARGIN,
      nonCapturing: true,
    });
    await wait(20);
    const text = (list?.component.render(SIDEBAR_WIDTH) ?? []).join("\n");
    expect(text).toContain("demo");
    expect(text).toContain("07 侧边栏实现");
    sidebar.dispose();
  });

  it("侧栏只在 fullscreen 且 ≥100 列时可见，图标只在 fullscreen", async () => {
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

  it("点 note 打开详情浮层，Esc 逐层关闭", async () => {
    const root = await tempWorkspace([runningNote("07", "侧边栏实现")]);
    const registry = createRegistry();
    const entry: WorkerEntry = {
      planDirectory: join(root, ".agents/domains/demo/plans/active/2026-01-01-demo"),
      planRef: "demo/active/2026-01-01-demo",
      notes: ["07"],
      startedAt: Date.now(),
      released: new Set<string>(),
      inputs: 0,
      session: fakeSession(),
    };
    registry.add(entry);
    const sidebar = createSidebar({ registry, limits: () => DEFAULT_ORCHESTRATOR_SETTINGS });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays, listeners } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    const list = overlays[1];
    // 行 0 = Plan 标题，行 1 = note 07
    list?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 1));
    expect(overlays).toHaveLength(3);
    const detail = overlays[2];
    expect(detail?.options.nonCapturing).toBeUndefined();
    expect((detail?.component.render(48) ?? []).join("\n")).toContain("note 07");
    expect(detail?.component.render(48).join("\n")).toContain("等待输出");
    // 第一层 Esc：关详情
    detail?.component.handleInput?.("\u001b");
    expect(detail?.hidden).toBe(true);
    expect(listeners.size).toBe(1);
    // 第二层 Esc：收起侧栏（被输入监听消费）
    const [consume] = [...listeners];
    expect(consume?.("\u001b")).toEqual({ consume: true });
    expect(overlays[1]?.options.visible?.(140, 40)).toBe(false);
    // 无关按键不再被消费
    expect(consume?.("x")).toBeUndefined();
    sidebar.dispose();
  });

  it("点击详情卡片外部只关详情，侧栏仍开着", async () => {
    const root = await tempWorkspace([runningNote("07", "侧边栏实现")]);
    const sidebar = createSidebar({
      registry: createRegistry(),
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    });
    const { ctx, widgets } = createFakeCtx(root);
    const { tui, overlays, listeners } = createFakeTui();
    sidebar.sync(ctx, true);
    mountWidget(widgets, tui);
    await wait(20);
    overlays[1]?.component.handleMouse?.(click(SIDEBAR_HEADER_ROWS + 1));
    const detail = overlays[2];
    const lines = detail?.component.render(140) ?? [];
    // 卡片第一行之前是空白：点它就只关详情。
    expect(lines[0]).toBe("");
    detail?.component.handleMouse?.(click(0));
    expect(detail?.hidden).toBe(true);
    // 侧栏没被顺手关掉：visible 仍为 true，输入监听还在。
    expect(overlays[1]?.hidden).toBe(false);
    expect(overlays[1]?.options.visible?.(140, 40)).toBe(true);
    expect(listeners.size).toBe(1);
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
    // 定时器已清：推进 3 个刷新周期（3 × 5s）也不再有重绘请求
    vi.advanceTimersByTime(SIDEBAR_REFRESH_MS * 3);
    expect(state.renders).toBe(before);
    sidebar.dispose();
  });
});
