/**
 * The `/toolkit` panel: one switch per toolkit capability, rendered like the
 * built-in `/settings` screen (bordered `SettingsList`, search, Enter/Space to
 * change, Esc to close). The panel only edits switches; every other tunable
 * lives in `pi-toolkit.json`.
 * @module @kxh4892636/pi-toolkit/panel
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";
import type { ToolkitSettings, ToolToggleKey } from "./settings.ts";

/** One switch row: its key, display name, and one-line explanation. */
export interface ToggleDescriptor {
  readonly id: ToolToggleKey;
  readonly label: string;
  readonly description: string;
}

/** Panel rows in display order. */
export const TOGGLE_DESCRIPTORS: readonly ToggleDescriptor[] = [
  {
    id: "webTools",
    label: "Web tools",
    description: "web_search and web_fetch, backed by DeepSeek's official Search and Fetch APIs.",
  },
  {
    id: "nestedSkills",
    label: "Nested skills",
    description:
      "Discover hidden SKILL.md files (next /reload), complete $skill-name, and expand $ references.",
  },
  {
    id: "sessionName",
    label: "Session naming",
    description: "Name each session from its first user input.",
  },
  {
    id: "orchestrator",
    label: "Orchestrator",
    description:
      "Plan / notes DAG workflow with orchestrator_* tools and skills; run /orchestrator to pick its session mode.",
  },
];

/** Values a switch cycles through; the first is "on" so Enter flips it. */
const SWITCH_VALUES = ["on", "off"] as const;

/**
 * Project the switches into `SettingsList` rows: the same shape `/settings`
 * uses, so Enter/Space cycles and the current value shows on the right.
 */
export const panelItems = (tools: ToolkitSettings["tools"]): SettingItem[] => {
  return TOGGLE_DESCRIPTORS.map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    description: descriptor.description,
    currentValue: tools[descriptor.id] ? "on" : "off",
    values: [...SWITCH_VALUES],
  }));
};

/** Panel inputs. */
export interface ToolkitPanelOptions {
  /** Current switches, snapshotted when the panel opens. */
  readonly toggles: ToolkitSettings["tools"];
  /** File switches are persisted to. */
  readonly configPath: string;
  /** Apply one switch change (memory, active tools, and JSON). */
  readonly onToggle: (key: ToolToggleKey, enabled: boolean) => void;
}

/**
 * Open the switch panel and resolve when it closes.
 *
 * @param ctx - the command context; only TUI mode has custom screens.
 * @param options - switches, persistence path, and change handler.
 */
export const openToolkitPanel = async (
  ctx: ExtensionContext,
  options: ToolkitPanelOptions,
): Promise<void> => {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/toolkit requires interactive mode", "error");
    return;
  }

  await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const border = (text: string): string => theme.fg("accent", text);

    container.addChild(new DynamicBorder(border));
    container.addChild(new Text(theme.bold(theme.fg("accent", "Toolkit")), 1, 1));
    container.addChild(new Text(theme.fg("muted", `Config: ${options.configPath}`), 1, 0));

    const settingsList = new SettingsList(
      panelItems(options.toggles),
      10,
      getSettingsListTheme(),
      (id, newValue) => {
        options.onToggle(id as ToolToggleKey, newValue === "on");
      },
      () => done(undefined),
      { enableSearch: true },
    );
    container.addChild(settingsList);
    container.addChild(new DynamicBorder(border));

    return {
      // Let PageUp/PageDown page the list instead of scrolling the transcript.
      capturesViewportInput: settingsList.capturesViewportInput,
      render(width: number): string[] {
        return container.render(width);
      },
      invalidate(): void {
        container.invalidate();
      },
      handleInput(data: string): void {
        settingsList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};
