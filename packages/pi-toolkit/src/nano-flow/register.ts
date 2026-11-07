/**
 * Nano Flow 的 pi 接线：开关 + `/nano-flow` 模式选择 + 固定提示词 + 三个工具 +
 * 随包 skill + notes.json 收口 + 上下文清空。没有面板：查询走命令与工具。
 * @module @kxh4892636/pi-toolkit/nano-flow/register
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ToolkitSettings } from "../settings.ts";
import { assetsSkillsRoot, readPromptText } from "./assets.ts";
import { createAskQuestionsTool } from "./ask.ts";
import { DEFAULT_DOMAIN_ROOT } from "./config.ts";
import {
  buildSeed,
  isNanoFlowActive,
  latestResetAt,
  MODE_ENTRY,
  RESET_ENTRY,
  sessionModeOf,
  type BranchEntryLike,
} from "./mode.ts";
import { activePlans, listPlans, planRefOf } from "./plan.ts";
import { pickMode } from "./selector.ts";
import { loadDocument, NOTES_FILE } from "./store.ts";
import { createCheckTool } from "./tools/check.ts";
import { createReadTool } from "./tools/read.ts";
import { createToolRuntime, statusLine } from "./tools/shared.ts";
import { createWriteTool } from "./tools/write.ts";

/** 三个 Plan 工具与询问工具；Nano Flow 生效时一并激活。 */
export const NANO_FLOW_TOOL_NAMES = [
  "nano_flow_read",
  "nano_flow_write",
  "nano_flow_check",
  "ask_questions",
] as const;

const NANO_FLOW_TOOL_SET: ReadonlySet<string> = new Set(NANO_FLOW_TOOL_NAMES);

/** 宿主入口提供的依赖。 */
export interface NanoFlowDeps {
  /** 当前设置；每次读取，`/toolkit` 改动立即生效。 */
  readonly settings: () => ToolkitSettings;
  /** 持久化 `nanoFlow.always`；失败由入口提示。 */
  readonly setAlways: (always: boolean) => void;
}

/** 返回给入口的句柄：配置加载完成后启动，切换开关后同步。 */
export interface NanoFlowHandle {
  /** 在配置加载完成后的 `session_start` 调用：处理 flag、恢复 mode、同步工具。 */
  start(ctx: ExtensionContext): void;
  /** 工具开关或模式变化后同步活动工具。 */
  sync(ctx: ExtensionContext): void;
}

const branchOf = (ctx: ExtensionContext): readonly BranchEntryLike[] => {
  return ctx.sessionManager.getBranch() as readonly BranchEntryLike[];
};

/** 文件类工具里表示路径的参数字段。 */
const PATH_KEYS = new Set(["path", "file_path", "filePath", "file", "target", "output_path"]);

/** shell 工具里表示命令的参数字段。 */
const COMMAND_KEYS = new Set(["command", "script", "cmd"]);

const mentionsNotes = (value: unknown, depth = 0): boolean => {
  if (depth > 4) return false;
  if (typeof value === "string") return value.includes(NOTES_FILE);
  if (Array.isArray(value)) return value.some((item) => mentionsNotes(item, depth + 1));
  return false;
};

/**
 * 只检查真正代表路径/命令的参数，避免把源码内容或检索词当成访问。
 * shell 工具检查 command/script；其它工具检查 path 类字段。
 */
const referencesNotesFile = (toolName: string, input: unknown): boolean => {
  if (typeof input !== "object" || input === null) return false;
  const keys = toolName === "bash" || toolName === "powershell" ? COMMAND_KEYS : PATH_KEYS;
  const record = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (keys.has(key) && mentionsNotes(value)) return true;
  }
  return false;
};

/**
 * 注册 Nano Flow。
 * @param pi - pi 扩展 API。
 * @param deps - 设置读取与持久化回调。
 * @returns 工具同步句柄。
 */
export const registerNanoFlow = (pi: ExtensionAPI, deps: NanoFlowDeps): NanoFlowHandle => {
  let promptText: string | undefined;
  let promptError: string | undefined;
  let resetPending = false;

  const prompt = (): string | undefined => {
    if (promptText !== undefined) return promptText;
    if (promptError !== undefined) return undefined;
    try {
      promptText = readPromptText();
      return promptText;
    } catch (error) {
      promptError = error instanceof Error ? error.message : String(error);
      return undefined;
    }
  };

  const modeOn = (ctx: ExtensionContext): boolean => {
    const settings = deps.settings();
    return isNanoFlowActive(branchOf(ctx), {
      switchOn: settings.tools.nanoFlow,
      always: settings.nanoFlow.always,
    });
  };

  const setTools = (enabled: boolean): void => {
    const active = pi.getActiveTools();
    const next = active.filter((name) => !NANO_FLOW_TOOL_SET.has(name));
    if (enabled) {
      for (const name of NANO_FLOW_TOOL_NAMES) {
        if (!next.includes(name)) next.push(name);
      }
    }
    const unchanged =
      next.length === active.length && next.every((name, index) => name === active[index]);
    if (!unchanged) pi.setActiveTools(next);
  };

  const sync = (ctx: ExtensionContext): void => {
    setTools(modeOn(ctx));
  };

  const runtime = createToolRuntime({
    limits: () => deps.settings().nanoFlow,
    domainRoot: DEFAULT_DOMAIN_ROOT,
  });
  for (const tool of [
    createReadTool(runtime),
    createWriteTool(runtime),
    createCheckTool(runtime),
    createAskQuestionsTool(),
  ]) {
    pi.registerTool({ ...tool, defaultActive: false });
  }

  pi.registerFlag("nano-flow", {
    description: "Start this session in Nano Flow mode",
    type: "boolean",
    default: false,
  });

  pi.on("resources_discover", () => {
    if (!deps.settings().tools.nanoFlow) return undefined;
    return { skillPaths: [assetsSkillsRoot()] };
  });

  const start = (ctx: ExtensionContext): void => {
    resetPending = false;
    if (
      deps.settings().tools.nanoFlow &&
      pi.getFlag("nano-flow") === true &&
      sessionModeOf(branchOf(ctx)) === undefined
    ) {
      pi.appendEntry(MODE_ENTRY, { enabled: true });
    }
    sync(ctx);
  };

  pi.on("session_tree", (_event, ctx) => {
    sync(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!modeOn(ctx)) return;
    const text = prompt();
    if (text === undefined) {
      ctx.ui.notify(`pi-toolkit: 读取 Nano Flow 提示词失败: ${promptError ?? "未知错误"}`, "error");
      return;
    }
    event.systemPromptOptions.sections["nano_flow"] = text;
    sync(ctx);
  });

  // Nano Flow 生效时关闭 pi 的自动压缩：上下文清空由本插件接管。
  pi.on("session_before_compact", (_event, ctx) => {
    return modeOn(ctx) ? { cancel: true } : undefined;
  });

  pi.on("input", (event, ctx) => {
    if (event.source === "extension" || resetPending || !modeOn(ctx)) return;
    const usage = ctx.getContextUsage();
    if (usage === undefined || usage.tokens === null || usage.contextWindow <= 0) return;
    const ratio = usage.tokens / usage.contextWindow;
    if (ratio < deps.settings().nanoFlow.rotateAt) return;
    resetPending = true;
    pi.appendEntry(RESET_ENTRY, { at: Date.now() });
    ctx.ui.notify("Nano Flow：上下文达到阈值，本轮将清空历史并恢复 Plan。", "info");
  });

  pi.on("context", async (event, ctx) => {
    if (!modeOn(ctx)) return;
    const at = latestResetAt(branchOf(ctx));
    if (at === undefined) return;
    resetPending = false;
    type Message = (typeof event.messages)[number];
    const kept = event.messages.filter((message) => {
      const timestamp = (message as { timestamp?: unknown }).timestamp;
      return typeof timestamp === "number" && timestamp >= at;
    });
    const seed = {
      role: "user",
      content: [{ type: "text", text: await buildSeed(ctx.cwd, DEFAULT_DOMAIN_ROOT) }],
      timestamp: at,
    } as unknown as Message;
    return { messages: [seed, ...kept] };
  });

  pi.on("tool_call", (event, ctx) => {
    if (!modeOn(ctx)) return;
    if (NANO_FLOW_TOOL_SET.has(event.toolName)) return;
    if (!referencesNotesFile(event.toolName, event.input)) return;
    return {
      block: true,
      reason: "notes.json 只能经 nano_flow_* 工具读写；请改用 nano_flow_read / nano_flow_write。",
    };
  });

  const statusText = async (ctx: ExtensionContext): Promise<string> => {
    const plans = activePlans(await listPlans(ctx.cwd, DEFAULT_DOMAIN_ROOT));
    const lines = [`Nano Flow: ${modeOn(ctx) ? "开" : "关"}`];
    if (plans.length === 0) {
      lines.push(`active Plan: 无（域根 ${DEFAULT_DOMAIN_ROOT}）`);
      return lines.join("\n");
    }
    for (const plan of plans) {
      try {
        const document = await loadDocument(plan.directory, deps.settings().nanoFlow);
        lines.push(`${planRefOf(plan)} · ${statusLine(document)}`);
      } catch (error) {
        lines.push(
          `${planRefOf(plan)} · 读取失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return lines.join("\n");
  };

  pi.registerCommand("nano-flow", {
    description: "Nano Flow：开 / 关；Ctrl+S 同时设为新会话默认",
    handler: async (args, ctx) => {
      if (!deps.settings().tools.nanoFlow) {
        ctx.ui.notify("Nano Flow 未启用：先在 /toolkit 打开 Nano Flow 开关。", "warning");
        return;
      }
      if (args.trim() === "status") {
        ctx.ui.notify(await statusText(ctx), "info");
        return;
      }
      const settings = deps.settings();
      const choice = await pickMode(ctx, {
        enabled: modeOn(ctx),
        always: settings.nanoFlow.always,
      });
      if (choice === undefined) return;
      if (choice.persist) {
        try {
          deps.setAlways(choice.enabled);
        } catch (error) {
          ctx.ui.notify(
            `pi-toolkit: 保存 nanoFlow.always 失败: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
      }
      pi.appendEntry(MODE_ENTRY, { enabled: choice.enabled });
      sync(ctx);
      ctx.ui.notify(
        `Nano Flow：${modeOn(ctx) ? "开" : "关"}${choice.persist ? "（已设为默认）" : ""}`,
        "info",
      );
    },
  });

  return { start, sync };
};
