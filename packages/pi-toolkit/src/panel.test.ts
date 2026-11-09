import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { openToolkitPanel, panelItems, type ToolkitPanelOptions } from "./panel.ts";
import { DEFAULT_TOOLS, TOOL_TOGGLE_KEYS } from "./settings.ts";

/** Snapshot of the component the panel hands to `ctx.ui.custom()`. */
interface PanelComponent {
  render(width: number): string[];
  handleInput?(data: string): void;
  invalidate?(): void;
}

interface PanelHarness {
  readonly component: PanelComponent;
  readonly notifications: Array<{ message: string; level: string | undefined }>;
  readonly calls: Array<[string, boolean]>;
  /** Resolve when the panel closes. */
  readonly closed: Promise<void>;
}

const stubTheme = {
  fg: (_token: string, text: string): string => text,
  bold: (text: string): string => text,
};

/**
 * Drive `/toolkit` without a terminal: the fake `custom()` runs the component
 * factory immediately and records the component it returned.
 */
const openPanel = (options: Partial<ToolkitPanelOptions> = {}, mode = "tui"): PanelHarness => {
  const notifications: Array<{ message: string; level: string | undefined }> = [];
  const calls: Array<[string, boolean]> = [];
  let component: PanelComponent | undefined;
  const ctx = {
    mode,
    ui: {
      notify: (message: string, level?: string) => notifications.push({ message, level }),
      custom: (
        factory: (
          tui: { requestRender: () => void },
          theme: typeof stubTheme,
          keybindings: Record<string, never>,
          done: () => void,
        ) => PanelComponent,
      ) =>
        new Promise<void>((resolve) => {
          component = factory({ requestRender: () => undefined }, stubTheme, {}, resolve);
        }),
    },
  } as unknown as ExtensionContext;

  const closed = openToolkitPanel(ctx, {
    toggles: options.toggles ?? DEFAULT_TOOLS,
    configPath: options.configPath ?? "/tmp/pi-toolkit.json",
    onToggle: options.onToggle ?? ((key, enabled) => calls.push([key, enabled])),
  });
  if (component === undefined && mode === "tui") throw new Error("panel did not open");
  // Non-interactive modes never build a component; only `notifications` matters.
  return { component: component as PanelComponent, notifications, calls, closed };
};

beforeAll(() => {
  // The panel reuses pi's own SettingsList theme helpers.
  initTheme("dark", false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openToolkitPanel", () => {
  it("renders the switches inside bordered rows with the config path", () => {
    const { component } = openPanel();
    const text = component.render(80).join("\n");
    expect(text).toContain("Toolkit");
    expect(text).toContain("/tmp/pi-toolkit.json");
    expect(text).toContain("nested-skill");
    expect(text).toContain("session-name");
    expect(text).toContain("pi-deepseek-web");
    expect(text).toContain("off");
    expect(component.render(80).length).toBeGreaterThan(6);
  });

  it("turns the selected switch on with Enter and reports it once", () => {
    const { component, calls } = openPanel();
    component.handleInput?.("\r");
    expect(calls).toEqual([["nestedSkills", true]]);
    expect(component.render(80).join("\n")).toContain("on");
  });

  it("closes on Escape", async () => {
    const { component, closed } = openPanel();
    component.handleInput?.("\u001b");
    await expect(closed).resolves.toBeUndefined();
  });

  it("refuses non-interactive modes with an error notification", async () => {
    const { notifications, closed } = openPanel({}, "print");
    await closed;
    expect(notifications).toEqual([
      { message: "/toolkit requires interactive mode", level: "error" },
    ]);
  });
});

describe("panelItems", () => {
  it("renders exactly five on/off rows, one per bundled tool", () => {
    const items = panelItems(DEFAULT_TOOLS);
    expect(items.map((item) => item.id)).toEqual([...TOOL_TOGGLE_KEYS]);
    expect(items.map((item) => item.label)).toEqual([
      "nested-skill",
      "session-name",
      "pi-deepseek-web",
      "ask_questions",
      "nano-flow",
    ]);
    for (const item of items) {
      expect(item.values).toEqual(["on", "off"]);
      expect(item.currentValue).toBe("off");
      expect(item.description?.length).toBeGreaterThan(0);
    }
  });

  it("reflects enabled switches", () => {
    const items = panelItems({ ...DEFAULT_TOOLS, webTools: true, sessionName: true });
    const byId = new Map(items.map((item) => [item.id, item.currentValue]));
    expect(byId.get("webTools")).toBe("on");
    expect(byId.get("sessionName")).toBe("on");
    expect(byId.get("nestedSkills")).toBe("off");
  });
});
