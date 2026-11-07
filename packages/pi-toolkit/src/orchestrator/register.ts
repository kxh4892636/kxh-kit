/**
 * Orchestrator 的 pi 接线：开关 + `/orchestrator` 模式选择 + 固定提示词 + 三个工具 +
 * 随包 skill + notes.json 收口 + 上下文清空。没有面板：查询走命令与工具。
 * @module @kxh4892636/pi-toolkit/orchestrator/register
 */

import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ToolkitSettings } from "../settings.ts";
import {
  clearInterrupted,
  installCrashGuard,
  readInterrupted,
  stateDirectory,
  withTimeout,
} from "./errors.ts";
import { createRegistry, deliver, disposeAll, type WorkerRegistry } from "./handles.ts";
import { formatReconcile, reconcile, type PlanSnapshot } from "./reconcile.ts";
import { spawnWorker, type SpawnWorkerOptions, type SpawnedWorker } from "./spawn.ts";
import { INPUT_KINDS, type InputKind, type WorkerReport } from "./types.ts";
import { assetsSkillsRoot, readPromptText } from "./assets.ts";
import { createAskQuestionsTool } from "./ask.ts";
import { DEFAULT_DOMAIN_ROOT } from "./config.ts";
import {
  buildSeed,
  isOrchestratorActive,
  latestResetAt,
  MODE_ENTRY,
  RESET_ENTRY,
  sessionModeOf,
  type BranchEntryLike,
} from "./mode.ts";
import { activePlans, listPlans, planRefOf, resolvePlan } from "./plan.ts";
import { pickMode } from "./selector.ts";
import { loadDocument, NOTES_FILE } from "./store.ts";
import { createCheckTool } from "./tools/check.ts";
import { createReadTool } from "./tools/read.ts";
import {
  asArguments,
  createToolRuntime,
  optionalString,
  statusLine,
  textBlocks,
  type OrchestratorTool,
  type ToolRuntime,
} from "./tools/shared.ts";
import { createWriteTool } from "./tools/write.ts";

/** 三个 Plan 工具、编排桥接与询问工具；Orchestrator 生效时一并激活。 */
export const ORCHESTRATOR_TOOL_NAMES = [
  "orchestrator_read",
  "orchestrator_write",
  "orchestrator_check",
  "orchestrator_dispatch",
  "orchestrator_workers",
  "ask_questions",
] as const;

const ORCHESTRATOR_TOOL_SET: ReadonlySet<string> = new Set(ORCHESTRATOR_TOOL_NAMES);

/** 宿主入口提供的依赖。 */
export interface OrchestratorDeps {
  /** 当前设置；每次读取，`/toolkit` 改动立即生效。 */
  readonly settings: () => ToolkitSettings;
  /** 持久化 `orchestrator.always`；失败由入口提示。 */
  readonly setAlways: (always: boolean) => void;
  /** 起 worker 的入口；缺省用 SDK，测试可替换以避开真实会话。 */
  readonly spawn?: (options: SpawnWorkerOptions) => Promise<SpawnedWorker>;
}

/** 返回给入口的句柄：配置加载完成后启动，切换开关后同步。 */
export interface OrchestratorHandle {
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
 * `orchestrator_dispatch`：起一个 worker 或向它投递输入。
 *
 * 同一 plan 已有 live worker 时复用，绝不起第二个 —— `worker:plan` 同时 1:1
 * 由句柄表保证。`kind=pass` 先把 note 记进放行集合，worker 才能写 `completed`。
 */
const createDispatchTool = (
  runtime: ToolRuntime,
  registry: WorkerRegistry,
  deps: OrchestratorDeps,
  onReport: (report: WorkerReport) => void,
): OrchestratorTool => ({
  name: "orchestrator_dispatch",
  label: "Dispatch",
  description:
    "把一项工作交给某个 Plan 的 worker：首次调用会用 SDK 起一个 worker session，之后同一 Plan 复用同一个 worker。kind 为 message（默认，派活或追加）、pass（放行某条 note 置 completed）、rework、answer、fact。",
  promptSnippet: "Start or message the worker of a plan.",
  promptGuidelines: [
    "同一 Plan 同一时刻只有一个 worker；重复 dispatch 复用既有 worker。",
    "用户的明确决定才可下发 pass / rework；不要把推断当放行。",
  ],
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      plan: {
        type: "string",
        description: "<domain>/<lifecycle>/<name>；工作区只有一个 active 的 Plan 时可省略",
      },
      kind: {
        type: "string",
        enum: [...INPUT_KINDS],
        description: "输入种类，默认 message",
      },
      note: { type: "string", description: "kind=pass / rework 时针对的 note id" },
      message: { type: "string", description: "派活正文或追加说明" },
    },
    required: [],
  }),
  async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
    const args = asArguments(raw);
    const kind = (optionalString(args, "kind") ?? "message") as InputKind;
    if (!(INPUT_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`kind 必须是 ${INPUT_KINDS.join(" | ")}`);
    }
    const note = optionalString(args, "note");
    const message = optionalString(args, "message") ?? "";
    const workspace = runtime.workspace(exec);
    const plan = await resolvePlan(
      workspace,
      runtime.domainRoot,
      optionalString(args, "plan") ?? runtime.lockedPlan,
    );

    let entry = registry.get(plan.directory);
    const started = entry === undefined;
    if (entry === undefined) {
      const released = new Set<string>();
      const spawned = await (deps.spawn ?? spawnWorker)({
        plan,
        cwd: workspace,
        settings: deps.settings,
        report: onReport,
        released,
      });
      entry = registry.add({
        planDirectory: plan.directory,
        planRef: planRefOf(plan),
        startedAt: Date.now(),
        released,
        session: spawned.session,
        inputs: 0,
      });
    }
    if (kind === "pass" && note !== undefined) entry.released.add(note);
    const target = entry;
    const timeoutMs = deps.settings().orchestrator.workerTimeoutMs;
    const delivery = await withTimeout(deliver(target, kind, message, note), timeoutMs, () =>
      target.session.abort(),
    );
    if (delivery === "timeout") {
      return {
        content: textBlocks(
          [
            `${planRefOf(plan)} 的 worker 超过 ${Math.round(timeoutMs / 60000)} 分钟没有结束，已中止。`,
            "用 orchestrator_read 看 note 的落盘状态，再决定是否重新派工。",
          ].join("\n"),
        ),
        details: { plan: planRefOf(plan), timedOut: true },
      };
    }
    const head = started
      ? `已起 worker 接手 ${planRefOf(plan)}`
      : `已投递给 ${planRefOf(plan)} 的 worker`;
    return {
      content: textBlocks(
        [
          head,
          `kind: ${kind}${note === undefined ? "" : ` · note ${note}`}`,
          delivery.queued ? "worker 正在跑，输入已排队。" : "worker 已开始处理。",
        ].join("\n"),
      ),
      details: { plan: planRefOf(plan), started, queued: delivery.queued },
    };
  },
});

/** `orchestrator_workers`：列 live worker 或中止它们（不设并发上限，但要能刹车）。 */
const createWorkersTool = (registry: WorkerRegistry): OrchestratorTool => ({
  name: "orchestrator_workers",
  label: "Workers",
  description: "列出当前 live worker（plan、起始时刻、最近上报），或中止其中一个 / 全部。",
  promptSnippet: "List or abort live worker sessions.",
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: { type: "string", enum: ["list", "abort"], description: "list | abort" },
      plan: { type: "string", description: "op=abort 时的 plan 引用；省略表示中止全部" },
    },
    required: ["op"],
  }),
  async execute(_toolCallId, raw) {
    const args = asArguments(raw);
    const op = optionalString(args, "op") ?? "list";
    if (op === "abort") {
      const plan = optionalString(args, "plan");
      if (plan === undefined) {
        const count = await disposeAll(registry);
        return { content: textBlocks(`已中止 ${count} 个 worker。`), details: { count } };
      }
      const entries = registry.list().filter((entry) => entry.planRef === plan);
      if (entries.length === 0) throw new Error(`没有在跑的 worker: ${plan}`);
      for (const entry of entries) {
        registry.remove(entry.planDirectory);
        try {
          await entry.session.abort();
        } catch {
          // 已结束的 session 拒绝 abort；中止是幂等的。
        }
        entry.session.dispose();
      }
      return {
        content: textBlocks(`已中止 ${plan} 的 worker。`),
        details: { count: entries.length },
      };
    }
    const entries = registry.list();
    if (entries.length === 0) {
      return { content: textBlocks("当前没有 live worker。"), details: { count: 0 } };
    }
    const lines = [`live worker（${entries.length}）:`];
    for (const entry of entries) {
      const minutes = Math.round((Date.now() - entry.startedAt) / 60_000);
      const report =
        entry.lastReport === undefined
          ? "尚无上报"
          : `${entry.lastReport.outcome} · note ${entry.lastReport.note}`;
      lines.push(`  ${entry.planRef} · ${minutes} 分钟 · 输入 ${entry.inputs} 次 · ${report}`);
    }
    return { content: textBlocks(lines.join("\n")), details: { count: entries.length } };
  },
});

/**
 * 注册 Orchestrator。
 * @param pi - pi 扩展 API。
 * @param deps - 设置读取与持久化回调。
 * @returns 工具同步句柄。
 */
export const registerOrchestrator = (
  pi: ExtensionAPI,
  deps: OrchestratorDeps,
): OrchestratorHandle => {
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
    return isOrchestratorActive(branchOf(ctx), {
      switchOn: settings.tools.orchestrator,
      always: settings.orchestrator.always,
    });
  };

  const setTools = (enabled: boolean): void => {
    const active = pi.getActiveTools();
    const next = active.filter((name) => !ORCHESTRATOR_TOOL_SET.has(name));
    if (enabled) {
      for (const name of ORCHESTRATOR_TOOL_NAMES) {
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
    limits: () => deps.settings().orchestrator,
    domainRoot: DEFAULT_DOMAIN_ROOT,
  });

  /** 进程内的 worker 句柄表；闭包持有，不做模块级单例。 */
  const registry: WorkerRegistry = createRegistry();

  /**
   * worker 上报的落点：先记进句柄表，再把一条消息注入编排方会话。
   * report 只是通知，磁盘上的 notes 才是事实。
   */
  const onReport = (report: WorkerReport): void => {
    const directory = report.plan;
    if (directory !== undefined) {
      const entry = registry.get(directory);
      if (entry !== undefined) entry.lastReport = report;
    }
    const lines = [`[worker] ${report.outcome} · note ${report.note}: ${report.summary}`];
    if (report.question !== undefined) lines.push(`问题: ${report.question}`);
    if (report.plan !== undefined) lines.push(`plan: ${report.plan}`);
    try {
      pi.sendMessage(
        {
          customType: "orchestrator-report",
          content: lines.join("\n"),
          display: true,
          details: { ...report },
        },
        { triggerTurn: true, deliverAs: "steer" },
      );
    } catch {
      // 会话正在关闭时无法注入；上报已经记进句柄表，不影响状态。
    }
  };

  for (const tool of [
    createReadTool(runtime),
    createWriteTool(runtime),
    createCheckTool(runtime),
    createAskQuestionsTool(),
    createDispatchTool(runtime, registry, deps, onReport),
    createWorkersTool(registry),
  ]) {
    pi.registerTool({ ...tool, defaultActive: false });
  }

  pi.registerFlag("orchestrator", {
    description: "Start this session in Orchestrator mode",
    type: "boolean",
    default: false,
  });

  pi.on("resources_discover", () => {
    if (!deps.settings().tools.orchestrator) return undefined;
    return { skillPaths: [assetsSkillsRoot()] };
  });

  /** 状态目录：崩溃凭据落在这里。 */
  const stateDir = (): string => stateDirectory(getAgentDir());

  /**
   * 启动对账：把磁盘上的事实摆到编排方面前。
   * 只发一条消息，不重派、不归档、不改状态。
   */
  const runReconcile = async (ctx: ExtensionContext): Promise<void> => {
    const directory = stateDir();
    const snapshots: PlanSnapshot[] = [];
    for (const plan of activePlans(await listPlans(ctx.cwd, DEFAULT_DOMAIN_ROOT))) {
      try {
        const document = await loadDocument(plan.directory, deps.settings().orchestrator);
        snapshots.push({ planRef: planRefOf(plan), notes: document.notes });
      } catch {
        // 读不出来的 Plan 交给 orchestrator_check 报错，不阻断对账。
      }
    }
    const interrupted = readInterrupted(directory);
    const text = formatReconcile(reconcile(snapshots, interrupted));
    if (interrupted !== undefined) clearInterrupted(directory);
    if (text === undefined) return;
    try {
      pi.sendMessage(
        { customType: "orchestrator-reconcile", content: text, display: true },
        { triggerTurn: true, deliverAs: "followUp" },
      );
    } catch {
      // 会话正在关闭时无法注入。
    }
  };

  const start = (ctx: ExtensionContext): void => {
    resetPending = false;
    if (
      deps.settings().tools.orchestrator &&
      pi.getFlag("orchestrator") === true &&
      sessionModeOf(branchOf(ctx)) === undefined
    ) {
      pi.appendEntry(MODE_ENTRY, { enabled: true });
    }
    sync(ctx);
    if (modeOn(ctx)) void runReconcile(ctx).catch(() => undefined);
  };

  // 进程级兜底：记录中断凭据后干净退出，交给下次启动的对账。
  installCrashGuard({
    directory: stateDir,
    plans: () => registry.list().map((entry) => entry.planRef),
  });

  // 退出收尾：abort 并 dispose 全部 worker，避免留下无人读 stdout 的会话。
  pi.on("session_shutdown", async () => {
    await disposeAll(registry);
  });

  pi.on("session_tree", (_event, ctx) => {
    sync(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!modeOn(ctx)) return;
    const text = prompt();
    if (text === undefined) {
      ctx.ui.notify(
        `pi-toolkit: 读取 Orchestrator 提示词失败: ${promptError ?? "未知错误"}`,
        "error",
      );
      return;
    }
    event.systemPromptOptions.sections["orchestrator"] = text;
    sync(ctx);
  });

  // Orchestrator 生效时关闭 pi 的自动压缩：上下文清空由本插件接管。
  pi.on("session_before_compact", (_event, ctx) => {
    return modeOn(ctx) ? { cancel: true } : undefined;
  });

  pi.on("input", (event, ctx) => {
    if (event.source === "extension" || resetPending || !modeOn(ctx)) return;
    const usage = ctx.getContextUsage();
    if (usage === undefined || usage.tokens === null || usage.contextWindow <= 0) return;
    const ratio = usage.tokens / usage.contextWindow;
    if (ratio < deps.settings().orchestrator.rotateAt) return;
    resetPending = true;
    pi.appendEntry(RESET_ENTRY, { at: Date.now() });
    ctx.ui.notify("Orchestrator：上下文达到阈值，本轮将清空历史并恢复 Plan。", "info");
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
    if (ORCHESTRATOR_TOOL_SET.has(event.toolName)) return;
    if (!referencesNotesFile(event.toolName, event.input)) return;
    return {
      block: true,
      reason:
        "notes.json 只能经 orchestrator_* 工具读写；请改用 orchestrator_read / orchestrator_write。",
    };
  });

  const statusText = async (ctx: ExtensionContext): Promise<string> => {
    const plans = activePlans(await listPlans(ctx.cwd, DEFAULT_DOMAIN_ROOT));
    const lines = [`Orchestrator: ${modeOn(ctx) ? "开" : "关"}`];
    if (plans.length === 0) {
      lines.push(`active Plan: 无（域根 ${DEFAULT_DOMAIN_ROOT}）`);
      return lines.join("\n");
    }
    for (const plan of plans) {
      try {
        const document = await loadDocument(plan.directory, deps.settings().orchestrator);
        lines.push(`${planRefOf(plan)} · ${statusLine(document)}`);
      } catch (error) {
        lines.push(
          `${planRefOf(plan)} · 读取失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return lines.join("\n");
  };

  pi.registerCommand("orchestrator", {
    description: "Orchestrator：开 / 关；Ctrl+S 同时设为新会话默认",
    handler: async (args, ctx) => {
      if (!deps.settings().tools.orchestrator) {
        ctx.ui.notify("Orchestrator 未启用：先在 /toolkit 打开 Orchestrator 开关。", "warning");
        return;
      }
      if (args.trim() === "status") {
        ctx.ui.notify(await statusText(ctx), "info");
        return;
      }
      const settings = deps.settings();
      const choice = await pickMode(ctx, {
        enabled: modeOn(ctx),
        always: settings.orchestrator.always,
      });
      if (choice === undefined) return;
      if (choice.persist) {
        try {
          deps.setAlways(choice.enabled);
        } catch (error) {
          ctx.ui.notify(
            `pi-toolkit: 保存 orchestrator.always 失败: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
      }
      pi.appendEntry(MODE_ENTRY, { enabled: choice.enabled });
      sync(ctx);
      ctx.ui.notify(
        `Orchestrator：${modeOn(ctx) ? "开" : "关"}${choice.persist ? "（已设为默认）" : ""}`,
        "info",
      );
    },
  });

  return { start, sync };
};
