/**
 * Nano Flow 的 pi 接线：开关门控、`/nano-flow` 会话模式、提示词注入、三个工具、
 * 随包 skill、会话绑定的 Plan 侧栏，以及达到阈值时的上下文清空与恢复 seed。
 *
 * 实现要点：没有 Agent 预设、没有自动新建会话、没有会话删除、没有浏览器 dock；
 * 绑定与模式存 session 自定义条目，历史只过滤不删除。
 * @module @kxh4892636/pi-toolkit/nano-flow/register
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import { applyToolActivation } from "../activation.ts";
import type { ToolkitSettings } from "../settings.ts";
import { DEFAULT_DOMAIN_ROOT, type NanoFlowSettings } from "./config.ts";
import {
  bindingOf,
  buildSeed,
  isNanoFlowActive,
  lastAssistantAt,
  lastAssistantText,
  latestResetOf,
  MODE_ENTRY,
  BINDING_ENTRY,
  RESET_ENTRY,
  resolveBindingDirectory,
  type BranchEntryLike,
} from "./mode.ts";
import { readUnfinishedNotes } from "./notes.ts";
import { activePlans, listPlans, planRefOf, resolvePlan, type PlanRef } from "./plan.ts";
import { createBindTool } from "./tools/bind.ts";
import { createCheckTool } from "./tools/check.ts";
import { createCreateTool } from "./tools/create.ts";
import type { NanoDeps } from "./tools/shared.ts";
import { pickNanoFlowMode } from "./ui/selector.ts";
import { createNotesSidebar, type SidebarSnapshot } from "./ui/sidebar.ts";

/** 三个 Nano Flow 工具名；用于激活集合。 */
export const NANO_FLOW_TOOL_NAMES = [
  "nano_flow_create",
  "nano_flow_bind",
  "nano_flow_check",
] as const;

/** 包内资产目录（`src/nano-flow`）。 */
const ROOT = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = join(ROOT, "templates");
const SKILLS_ROOT = join(ROOT, "skills");
const SYSTEM_PROMPT = readFileSync(join(ROOT, "prompts", "system.md"), "utf8").trim();
const USER_PROMPT = readFileSync(join(ROOT, "prompts", "user.md"), "utf8").trim();
const LIMIT_TEMPLATE = readFileSync(join(ROOT, "prompts", "limit.md"), "utf8").trim();

/** 依赖：设置读取与 `always` 持久化由根插件注入。 */
export interface NanoFlowDeps {
  readonly settings: () => ToolkitSettings;
  /** 写 `nanoFlow.always`；失败由调用方提示。 */
  readonly saveAlways: (always: boolean) => void;
}

/** 注册后的控制器：`/toolkit` 切换后由根插件调用 `sync`。 */
export interface NanoFlowController {
  sync(ctx: ExtensionContext): void;
}

const kb = (bytes: number): string => {
  const value = bytes / 1024;
  return `${Number.isInteger(value) ? value : value.toFixed(2)} KB`;
};

/** 把 `limit.md` 的规则与当前数值拼成注入块。 */
const buildLimitsText = (settings: NanoFlowSettings): string =>
  [
    LIMIT_TEMPLATE,
    [
      `- spec.md ≤ ${kb(settings.specMaxBytes)}`,
      `- 单条 note ≤ ${kb(settings.noteMaxBytes)}`,
      `- description ≤ ${settings.noteDescriptionMaxChars} 字`,
      `- CONTEXT.md ≤ ${kb(settings.contextMaxBytes)}`,
      `- question ≤ ${kb(settings.questionMaxBytes)}`,
      `- ADR ≤ ${kb(settings.adrMaxBytes)}`,
      `- workflow ≤ ${kb(settings.workflowMaxBytes)}`,
      `- GUIDE.md ≤ ${kb(settings.guideMaxBytes)}`,
    ].join("\n"),
  ].join("\n\n");

/** 读 GUIDE.md 快照；读不到时为空。 */
const readGuide = (cwd: string): string => {
  try {
    return readFileSync(join(cwd, DEFAULT_DOMAIN_ROOT, "GUIDE.md"), "utf8").trim();
  } catch {
    return "";
  }
};

/** 分支条目：只声明本模块用到的字段。 */
const branchOf = (ctx: ExtensionContext): BranchEntryLike[] =>
  ctx.sessionManager.getBranch() as unknown as BranchEntryLike[];

/** 当前 Plan 侧栏快照；没有绑定、目录失效或没有未完成 note 时返回 null。 */
const snapshotOf = (ctx: ExtensionContext): SidebarSnapshot | null => {
  const binding = bindingOf(branchOf(ctx));
  if (binding === undefined) return null;
  const directory = resolveBindingDirectory(binding, ctx.cwd);
  if (!existsSync(directory)) return null;
  const notes = readUnfinishedNotes(directory);
  return notes.length === 0 ? null : { planName: basename(directory), notes };
};

/** 注册 Nano Flow 的开关、命令、提示词、工具、skill 与侧栏。 */
export const registerNanoFlow = (pi: ExtensionAPI, deps: NanoFlowDeps): NanoFlowController => {
  let activeForSession = false;
  const sidebar = createNotesSidebar({ snapshot: snapshotOf });

  const activeOf = (ctx: ExtensionContext): boolean => {
    const settings = deps.settings();
    return isNanoFlowActive(branchOf(ctx), {
      switchOn: settings.tools.nanoFlow,
      always: settings.nanoFlow.always,
    });
  };

  const sync = (ctx: ExtensionContext): void => {
    activeForSession = activeOf(ctx);
    applyToolActivation(pi, NANO_FLOW_TOOL_NAMES, activeForSession);
    sidebar.sync(ctx, activeForSession);
  };

  const toolDeps: NanoDeps = {
    settings: () => deps.settings().nanoFlow,
    templatesRoot: TEMPLATES_ROOT,
    bind: (planDirectory, workspace) => {
      pi.appendEntry(BINDING_ENTRY, {
        planPath: relative(workspace, planDirectory).replaceAll("\\", "/"),
        cwd: workspace,
        boundAt: new Date().toISOString(),
      });
      sidebar.refresh();
    },
  };

  const registerGated = (definition: ToolDefinition): void => {
    pi.registerTool({
      ...definition,
      defaultActive: false,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        if (!activeOf(ctx)) {
          throw new Error(
            `${definition.name} is disabled. Run /nano-flow to enable Nano Flow for this session.`,
          );
        }
        if (definition.execute === undefined) {
          throw new Error(`${definition.name} has no execute function`);
        }
        return definition.execute(toolCallId, params, signal, onUpdate, ctx);
      },
    });
  };

  registerGated(createCreateTool(toolDeps));
  registerGated(createBindTool(toolDeps));
  registerGated(createCheckTool(toolDeps));

  pi.on("before_agent_start", (event, ctx) => {
    const active = activeOf(ctx);
    activeForSession = active;
    applyToolActivation(pi, NANO_FLOW_TOOL_NAMES, active);
    if (!active) return undefined;

    const settings = deps.settings().nanoFlow;
    if (event.messageType === "user") {
      const usage = ctx.getContextUsage();
      const ratio =
        usage?.tokens === null || usage?.tokens === undefined || usage.contextWindow <= 0
          ? 0
          : usage.tokens / usage.contextWindow;
      const entries = branchOf(ctx);
      const previous = latestResetOf(entries);
      const assistantAt = lastAssistantAt(entries);
      // 清空后必须等模型重新产出一轮，才允许下一次清空；否则同一条高占用会被反复清。
      const fresh =
        previous === undefined || (assistantAt !== undefined && assistantAt > previous.at);
      if (ratio >= settings.rotateAt && fresh) {
        const seed = buildSeed(bindingOf(entries), ctx.cwd, lastAssistantText(entries));
        pi.appendEntry(RESET_ENTRY, { at: Date.now(), seed });
        ctx.ui.notify("Nano Flow：上下文达到阈值，本轮将清空历史并恢复 Plan。", "info");
      }
    }

    const guide = readGuide(ctx.cwd);
    event.systemPromptOptions.sections["nano-flow"] = [
      SYSTEM_PROMPT,
      guide,
      buildLimitsText(settings),
    ]
      .filter((part) => part !== "")
      .join("\n\n");

    if (event.messageType !== "user") return undefined;
    return {
      message: {
        customType: "nano-flow/input",
        content: USER_PROMPT,
        display: false,
      },
    };
  });

  pi.on("context", (event, ctx) => {
    if (!activeOf(ctx)) return undefined;
    const reset = latestResetOf(branchOf(ctx));
    if (reset === undefined) return undefined;
    const kept = event.messages.filter((message) => {
      const timestamp = (message as { timestamp?: unknown }).timestamp;
      return typeof timestamp === "number" && timestamp >= reset.at;
    });
    const seed = {
      role: "user",
      content: [{ type: "text", text: reset.seed }],
      timestamp: reset.at,
    } as (typeof event.messages)[number];
    return { messages: [seed, ...kept] };
  });

  pi.on("turn_end", () => {
    sidebar.refresh();
  });

  pi.on("resources_discover", () => {
    return activeForSession ? { skillPaths: [SKILLS_ROOT] } : undefined;
  });

  pi.on("session_shutdown", () => {
    sidebar.dispose();
  });

  pi.registerCommand("nano-flow", {
    description: "Nano Flow：开 / 关；Ctrl+S 同时设为新会话默认；bind [plan] 绑定 Plan",
    handler: async (args, ctx) => {
      if (!deps.settings().tools.nanoFlow) {
        ctx.ui.notify("Nano Flow 未启用：先在 /toolkit 打开 nano-flow 开关。", "warning");
        return;
      }
      const [subcommand, ...rest] = args
        .trim()
        .split(/\s+/u)
        .filter((part) => part !== "");
      if (subcommand === "bind") {
        const requested = rest.join(" ").trim();
        try {
          const plan =
            requested === ""
              ? onlyActivePlan(await listPlans(ctx.cwd, DEFAULT_DOMAIN_ROOT))
              : await resolvePlan(ctx.cwd, DEFAULT_DOMAIN_ROOT, { plan: requested });
          toolDeps.bind(plan.directory, ctx.cwd);
          ctx.ui.notify(`已绑定 Plan: ${planRefOf(plan)}`, "info");
        } catch (error) {
          ctx.ui.notify(
            `nano-flow: 绑定失败: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
        return;
      }
      const before = activeForSession;
      const choice = await pickNanoFlowMode(ctx, {
        enabled: activeOf(ctx),
        always: deps.settings().nanoFlow.always,
      });
      if (choice === undefined) return;
      if (choice.persist) {
        try {
          deps.saveAlways(choice.enabled);
        } catch (error) {
          ctx.ui.notify(
            `pi-toolkit: 保存 nanoFlow.always 失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error",
          );
          return;
        }
      }
      pi.appendEntry(MODE_ENTRY, { enabled: choice.enabled });
      sync(ctx);
      if (choice.enabled && !before) {
        ctx.ui.notify("Nano Flow：已开启；随包 skill 需要 /reload 或新会话后出现。", "info");
        return;
      }
      ctx.ui.notify(
        `Nano Flow：${choice.enabled ? "开" : "关"}${choice.persist ? "（已设为默认）" : ""}`,
        "info",
      );
    },
  });

  return { sync };
};

/** `/nano-flow bind` 无参数时只接受唯一 active Plan，避免猜错。 */
const onlyActivePlan = (plans: readonly PlanRef[]): PlanRef => {
  const active = activePlans(plans);
  if (active.length === 1) return active[0] as PlanRef;
  if (active.length === 0) throw new Error("当前没有 active 的 Plan");
  throw new Error(
    `当前有多个 active Plan，请显式指定：${active.map((plan) => plan.name).join("、")}`,
  );
};
