/**
 * pi-toolkit: one extension bundling the workspace's pi capabilities, each
 * behind a switch in a single JSON config.
 *
 * - `web_search` / `web_fetch` — DeepSeek's official Search and Fetch APIs.
 * - Nested skill discovery, `$skill-name` completion, and `$` expansion.
 * - Automatic session naming from the first user input.
 * - `ask_questions` — blocking, multi-question prompts for user decisions.
 * - Nano Flow — prompted plan workflow with plan tools, skills, notes sidebar, context reset.
 *
 * Every capability starts off. `/toolkit` opens a `/settings`-style switch
 * panel; switches apply immediately where the pi event model allows and are
 * persisted to `pi-toolkit.json` for the next launch.
 * @module @kxh4892636/pi-toolkit
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { applyAskToolActivation, registerAskTool } from "./ask/register.ts";
import { registerNanoFlow } from "./nano-flow/register.ts";
import { registerSessionNaming } from "./naming/register.ts";
import { openToolkitPanel } from "./panel.ts";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveNanoFlowAlways,
  saveToggles,
  type LoadedSettings,
  type ToolkitSettings,
  type ToolToggleKey,
} from "./settings.ts";
import { registerNestedSkills } from "./skills/register.ts";
import { applyWebToolActivation, registerWebTools } from "./web/register.ts";

/** Injectable overrides (tests keep every read out of the real home dir). */
export interface ToolkitOptions {
  readonly agentDir?: string;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** Register the toolkit, its switches, and the `/toolkit` panel. */
const piToolkit = (pi: ExtensionAPI, options: ToolkitOptions = {}): void => {
  let settings: ToolkitSettings = DEFAULT_SETTINGS;
  let loaded: LoadedSettings | undefined;

  /**
   * Read the single JSON config once per session. A missing file is not an
   * error: it means "all switches off"; a malformed one throws so the caller
   * can surface it without disabling the extension.
   */
  const ensureLoaded = (ctx: ExtensionContext): LoadedSettings => {
    if (loaded !== undefined) return loaded;
    loaded = loadSettings({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ...options });
    settings = loaded.settings;
    return loaded;
  };

  const settingsAt = (): ToolkitSettings => settings;
  const configPathsAt = (): readonly string[] => loaded?.configPaths ?? [];

  registerWebTools(pi, { settings: settingsAt, configPaths: configPathsAt });
  registerNestedSkills(pi, {
    settings: settingsAt,
    ...(options.agentDir !== undefined ? { agentDir: options.agentDir } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
  });
  registerSessionNaming(pi, { settings: settingsAt });
  registerAskTool(pi, { settings: settingsAt });
  const nanoFlow = registerNanoFlow(pi, {
    settings: settingsAt,
    saveAlways: (always: boolean) => {
      const target = loaded?.writePath;
      if (target !== undefined) saveNanoFlowAlways(target, always);
      settings = { ...settings, nanoFlow: { ...settings.nanoFlow, always } };
    },
  });

  pi.registerCommand("toolkit", {
    description: "Enable or disable pi-toolkit tools",
    handler: async (_args, ctx) => {
      let resolved: LoadedSettings;
      try {
        resolved = ensureLoaded(ctx);
      } catch (error) {
        ctx.ui.notify(`pi-toolkit: ${messageOf(error)}`, "error");
        return;
      }
      await openToolkitPanel(ctx, {
        toggles: settings.tools,
        configPath: resolved.writePath,
        onToggle: (key: ToolToggleKey, enabled: boolean) => {
          settings = { ...settings, tools: { ...settings.tools, [key]: enabled } };
          applyWebToolActivation(pi, settings);
          applyAskToolActivation(pi, settings);
          nanoFlow.sync(ctx);
          try {
            saveToggles(resolved.writePath, settings.tools);
          } catch (error) {
            ctx.ui.notify(
              `pi-toolkit: cannot save ${resolved.writePath}: ${messageOf(error)}`,
              "error",
            );
          }
        },
      });
    },
  });

  pi.on("session_start", (_event, ctx) => {
    try {
      ensureLoaded(ctx);
    } catch (error) {
      ctx.ui.notify(`pi-toolkit: ${messageOf(error)}`, "error");
      return;
    }
    applyWebToolActivation(pi, settings);
    applyAskToolActivation(pi, settings);
    nanoFlow.sync(ctx);
  });
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export default piToolkit;
