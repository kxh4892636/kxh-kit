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
  forgetInterruptedPlan,
  installCrashGuard,
  readInterrupted,
  stateDirectory,
} from "./errors.ts";
import {
  createRegistry,
  deliver,
  disposeAll,
  disposeEntry,
  entryKeyOf,
  harvest,
  keyBelongsToPlan,
  renew,
  type WorkerEntry,
  type WorkerJob,
  type WorkerRegistry,
} from "./handles.ts";
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
import { activePlans, listPlans, planRefOf, resolvePlan, type PlanRef } from "./plan.ts";
import { pickMode } from "./selector.ts";
import { loadDocument, NOTES_FILE } from "./store.ts";
import { createCheckTool } from "./tools/check.ts";
import { createReadTool } from "./tools/read.ts";
import {
  asArguments,
  createToolRuntime,
  optionalString,
  optionalStringArray,
  statusLine,
  textBlocks,
  type InterruptedAccess,
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
 * 校验一组 note 可以并行：note 必须存在，且组内不得互相 `blocked_by`（否则「并行」会
 * 因为依赖而退化为串行，又看不出原因）。文件是否重叠是软建议，不在派工时阻断。
 * @param plan - 目标 Plan。
 * @param notes - 组内 note id。
 * @param runtime - 共享运行期依赖（取上限）。
 */
const assertParallelGroup = async (
  plan: PlanRef,
  notes: readonly string[],
  runtime: ToolRuntime,
): Promise<void> => {
  const document = await loadDocument(plan.directory, runtime.limits());
  const missing = notes.filter((id) => !document.notes.some((note) => note.id === id));
  if (missing.length > 0) {
    throw new Error(`没有 note ${missing.join(", ")}（${planRefOf(plan)}）`);
  }
  const group = new Set(notes);
  const conflicts = document.notes
    .filter((note) => group.has(note.id))
    .flatMap((note) =>
      note.blocked_by.filter((id) => group.has(id)).map((id) => `${id} → ${note.id}`),
    );
  if (conflicts.length > 0) {
    throw new Error(
      `这一组 note 之间有 blocked_by 依赖（${conflicts.join("、")}）：依赖必须串行，请拆成不同的组再派工`,
    );
  }
};

/** 在已分组的 Plan 里按 note 找它所属的组。 */
const findByNote = (
  registry: WorkerRegistry,
  planDirectory: string,
  note: string,
): WorkerEntry | undefined => {
  return registry
    .list()
    .find(
      (entry) =>
        keyBelongsToPlan(entry.planDirectory, planDirectory) && (entry.notes ?? []).includes(note),
    );
};

/** 该 Plan 是否已经按组派过工（有 `notes` 非空的条目）。 */
const hasGroups = (registry: WorkerRegistry, planDirectory: string): boolean => {
  return registry
    .list()
    .some(
      (entry) =>
        keyBelongsToPlan(entry.planDirectory, planDirectory) && (entry.notes?.length ?? 0) > 0,
    );
};

/**
 * `orchestrator_dispatch`：起一个 worker 或向它投递输入。
 *
 * 三种形态：给了 `plan` + `notes` 就派**组 worker**（一组无依赖 note 一个 worker，同一组
 * 复用句柄）；只给 `plan` 走 Plan 级派工（老路径）；`plan` 与 `lockedPlan` 都没有则是
 * **临时 worker**（不解析 Plan、键 `temp:<id>`、跑完即弃）。`kind=pass` 先把 note 记进
 * 放行集合，worker 才能写 `completed`。
 *
 * **入队即返回**：`deliver` 只给出那条输入的终态 promise，不等整轮；终态由
 * `settled` 收割，超时交给后台 watchdog。
 */
const createDispatchTool = (
  runtime: ToolRuntime,
  registry: WorkerRegistry,
  deps: OrchestratorDeps,
  onReport: (report: WorkerReport) => void,
  sendTimeout: (entry: WorkerEntry, job: WorkerJob, timeoutMs: number) => void,
): OrchestratorTool => {
  /** 临时 worker 的序号：进程内自增，键形如 `temp:1`，与 plan 目录不冲突。 */
  let tempSeq = 0;
  return {
    name: "orchestrator_dispatch",
    label: "Dispatch",
    description:
      "把一项工作交给 worker：给了 plan + notes 就按组分派（一组无依赖 note 一个 worker），只给 plan 走 Plan 级派工，都没给则起临时 worker（无 Plan、只读 + report、跑完即弃）。kind 为 message（默认，派活或追加）、pass（放行某条 note 置 completed）、rework、answer、fact。",
    promptSnippet:
      "Dispatch work to a plan's worker group, a plan-wide worker, or a temporary worker.",
    promptGuidelines: [
      "一组无依赖 note 一个 worker：用 notes 显式给出这一组；组内不得互相 blocked_by。",
      "pass / rework / answer 带 note 时路由到包含它的组；找不到就报错，不要自己猜。",
      "用户的明确决定才可下发 pass / rework；不要把推断当放行。",
    ],
    parameters: Type.Unsafe<Record<string, unknown>>({
      type: "object",
      additionalProperties: false,
      properties: {
        plan: {
          type: "string",
          description:
            "<domain>/<lifecycle>/<name>；省略且无 lockedPlan 时起临时 worker（不绑定 Plan）",
        },
        kind: {
          type: "string",
          enum: [...INPUT_KINDS],
          description: "输入种类，默认 message",
        },
        note: { type: "string", description: "kind=pass / rework / answer 时针对的 note id" },
        notes: {
          type: "array",
          items: { type: "string" },
          description:
            "组派工：这一组 note（互相不得有 blocked_by 依赖）；省略则走 Plan 级派工（老行为）",
        },
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
      const groupNotes = [...new Set(optionalStringArray(args, "notes") ?? [])];
      const workspace = runtime.workspace(exec);
      const planArgument = optionalString(args, "plan") ?? runtime.lockedPlan;
      // 没有 plan 也没有 lockedPlan：临时模式，不解析 Plan。
      const plan =
        planArgument === undefined
          ? undefined
          : await resolvePlan(workspace, runtime.domainRoot, planArgument);
      /** 临时 worker 的 id（`temp:<id>` 里的 `<id>`）；只有临时模式会用到。 */
      const tempId = plan === undefined ? String((tempSeq += 1)) : "";
      const key = plan === undefined ? `temp:${tempId}` : entryKeyOf(plan.directory, groupNotes);
      const planRef = plan === undefined ? key : planRefOf(plan);

      if (plan !== undefined && groupNotes.length > 0) {
        await assertParallelGroup(plan, groupNotes, runtime);
      }

      // pass / rework / answer 只看 note 落在哪个组；Plan 已经分组却找不到匹配时直接报错。
      const routeByNote =
        plan !== undefined && note !== undefined && kind !== "message"
          ? (() => {
              const matched = findByNote(registry, plan.directory, note);
              if (matched === undefined && hasGroups(registry, plan.directory)) {
                throw new Error(
                  `没有包含 note ${note} 的 worker 组（${planRef}）：不知道投给哪一组，先确认分组或重新派工`,
                );
              }
              return matched;
            })()
          : undefined;

      let entry = routeByNote ?? registry.get(key);
      const started = entry === undefined;
      if (entry === undefined) {
        const released = new Set<string>();
        const base = { cwd: workspace, settings: deps.settings, report: onReport, released };
        const spawned = await (deps.spawn ?? spawnWorker)(
          plan === undefined ? { ...base, temp: tempId } : { ...base, plan },
        );
        entry = registry.add({
          planDirectory: key,
          planRef,
          ...(plan === undefined ? { kind: "temp" as const } : {}),
          ...(groupNotes.length === 0 ? {} : { notes: groupNotes }),
          startedAt: Date.now(),
          released,
          session: spawned.session,
          inputs: 0,
        });
      }
      if (kind === "pass" && note !== undefined) entry.released.add(note);
      const target = entry;
      const timeoutMs = deps.settings().orchestrator.workerTimeoutMs;
      const delivery = deliver(target, kind, message, note);
      // 新一代 job 接管：先把上一条的清掉，免得定时器滞留到超时后才消失。
      harvest(target);
      const now = Date.now();
      const job: WorkerJob = {
        kind,
        ...(note === undefined ? {} : { note }),
        ...(groupNotes.length === 0 ? {} : { notes: groupNotes }),
        startedAt: now,
        progressAt: now,
        settled: delivery.settled,
        notified: false,
      };
      target.job = job;
      renew(target, job, timeoutMs, () => sendTimeout(target, job, timeoutMs));
      // 终态到了就收割：清定时器、摘 job。reject 也走到这里，不让它变成未处理拒绝。
      // 临时 worker 是一次性的：终态即摘除句柄并 dispose，不留隐性状态也不进 live 清单。
      const done = (): void => {
        harvest(target, job);
        if (target.kind === "temp") {
          registry.remove(target.planDirectory);
          void disposeEntry(target);
        }
      };
      void delivery.settled.then(done, done);

      const head = started
        ? plan === undefined
          ? `已起临时 worker ${planRef}（无 Plan，跑完即弃）`
          : groupNotes.length > 0
            ? `已起 worker 接手 ${planRef} 的组 [${groupNotes.join(", ")}]`
            : `已起 worker 接手 ${planRef}`
        : `已投递给 ${planRef} 的 worker${groupNotes.length > 0 ? `（组 [${groupNotes.join(", ")}]）` : ""}`;
      return {
        content: textBlocks(
          [
            head,
            `kind: ${kind}${note === undefined ? "" : ` · note ${note}`}`,
            delivery.queued ? "worker 正在跑，输入已排队。" : "worker 已开始处理。",
            "完成后会有 report 推回；用 orchestrator_workers 查 live 清单。",
          ].join("\n"),
        ),
        details: {
          plan: planRef,
          started,
          queued: delivery.queued,
          kind,
          ...(groupNotes.length === 0 ? {} : { notes: groupNotes }),
          ...(plan === undefined ? { temp: true } : {}),
          ...(note === undefined ? {} : { note }),
        },
      };
    },
  };
};

/** `orchestrator_workers`：列 live worker 或中止它们（不设并发上限，但要能刹车）。 */
const createWorkersTool = (registry: WorkerRegistry): OrchestratorTool => ({
  name: "orchestrator_workers",
  label: "Workers",
  description:
    "列出当前 live worker（plan 或 temp:<id>、形态、起始时刻、最近上报），或中止其中一个 / 全部。",
  promptSnippet: "List or abort live worker sessions.",
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: { type: "string", enum: ["list", "abort"], description: "list | abort" },
      plan: {
        type: "string",
        description: "op=abort 时的 plan 引用或 `temp:<id>`；省略表示中止全部",
      },
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
        await disposeEntry(entry);
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
      const group = entry.notes === undefined ? "" : `notes: ${entry.notes.join(",")} · `;
      lines.push(
        `  ${entry.planRef} · ${group}${entry.kind === "temp" ? "temp" : "plan"} · ${minutes} 分钟 · 输入 ${entry.inputs} 次 · ${report}`,
      );
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

  /**
   * 模式关闭时该恢复的活跃工具集合。**只在 `start()` 快照一次**：若在 `sync()` 里
   * 重取，第二次拿到的就是收敛后的集合，关掉模式后宿主工具再也回不来。
   */
  let baseline: readonly string[] | undefined;

  /**
   * 严格白名单：模式开 → 活跃工具就 `ORCHESTRATOR_TOOL_NAMES` 这六个（宿主的
   * `read` / `bash` / `edit` / `write` / web 全部收掉 —— 靠提示词自觉已被证伪）；
   * 模式关 → 恢复基线。
   *
   * 关闭时的集合是「当前活跃集合去掉本插件的工具，再补回基线里缺的」：基线只是
   * 快照，web 这类由别的开关管的工具可能在快照之后被 `/toolkit` 改过，直接用基线
   * 覆盖会把它们的开关状态一起抹掉。
   *
   * 基线还没快照（`start()` 之前）时不动：宁可维持现状，也不把半收敛的集合当基线。
   * @param enabled - 是否处于 Orchestrator 模式。
   */
  const setTools = (enabled: boolean): void => {
    if (baseline === undefined) return;
    const active = pi.getActiveTools();
    let next: string[] = [];
    if (enabled) {
      next = [...ORCHESTRATOR_TOOL_NAMES];
    } else {
      next = [...baseline];
      for (const name of active) {
        if (!ORCHESTRATOR_TOOL_SET.has(name) && !next.includes(name)) next.push(name);
      }
    }
    const unchanged =
      next.length === active.length && next.every((name, index) => name === active[index]);
    if (!unchanged) pi.setActiveTools(next);
  };

  const sync = (ctx: ExtensionContext): void => {
    setTools(modeOn(ctx));
  };

  /** 状态目录：崩溃凭据落在这里。 */
  const stateDir = (): string => stateDirectory(getAgentDir());

  /** 崩溃凭据的读写口；只给编排方，worker 拿不到。 */
  const interrupted: InterruptedAccess = {
    read: () => readInterrupted(stateDir()),
    forget: (planRef) => forgetInterruptedPlan(stateDir(), planRef),
    clear: () => clearInterrupted(stateDir()),
  };

  const runtime = createToolRuntime({
    limits: () => deps.settings().orchestrator,
    domainRoot: DEFAULT_DOMAIN_ROOT,
    interrupted,
  });

  /** 进程内的 worker 句柄表；闭包持有，不做模块级单例。 */
  const registry: WorkerRegistry = createRegistry();

  /**
   * 后台 watchdog 到点：中止这条派工的 worker、摘除句柄，并向编排方注入一条超时消息。
   *
   * 只对同一次派工发一次（`job.notified`），stale timer 或已被新一代接管的 job 直接
   * 返回；**不代写 note 状态** —— 编排方对业务域只读，重新派工还是改派由人决定。
   *
   * 摘除句柄是必需的：被 abort 的 session 不能再复用，留着会让 `orchestrator_workers`
   * 的 live 清单说谎；下次派工应该起一个干净的新 worker。
   */
  const sendTimeout = (entry: WorkerEntry, job: WorkerJob, timeoutMs: number): void => {
    if (entry.job !== job || job.notified) return;
    job.notified = true;
    const planRef = entry.planRef;
    const target = job.note === undefined ? "" : ` · note ${job.note}`;
    const group =
      job.notes === undefined || job.notes.length === 0 ? "" : ` · notes ${job.notes.join(",")}`;
    const minutes = Math.round(timeoutMs / 60_000);
    void (async () => {
      try {
        await entry.session.abort();
      } catch {
        // 已经结束的 session 会拒绝 abort；收尾时忽略。
      }
      await disposeEntry(entry);
      registry.remove(entry.planDirectory);
      try {
        pi.sendMessage(
          {
            customType: "orchestrator-worker-timeout",
            content: [
              `[worker] 超时：${planRef} 的 worker 超过 ${minutes} 分钟没有进展，已中止并摘除句柄（kind: ${job.kind}${group}${target}）。`,
              "下次派工会起新 worker。note 状态未改动：按磁盘上的 notes 决定重新派工还是改派。",
              "用 orchestrator_workers 查 live 清单。",
            ].join("\n"),
            display: true,
            details: {
              plan: planRef,
              kind: job.kind,
              timedOut: true,
              ...(job.note === undefined ? {} : { note: job.note }),
              ...(job.notes === undefined ? {} : { notes: job.notes }),
            },
          },
          { triggerTurn: true, deliverAs: "followUp" },
        );
      } catch {
        // 会话正在关闭时无法注入；abort 与摘除已经发生。
      }
    })();
  };

  /**
   * worker 上报的落点：续期 watchdog、记进句柄表，再把一条消息注入编排方会话。
   * report 只是通知，磁盘上的 notes 才是事实。
   *
   * 任何 outcome（包括纯信息性的 `done`）都算进展并续期：`workerTimeoutMs` 衡量连续
   * 无进展，不是单轮总时长，长任务只需定期报一句。
   */
  const onReport = (report: WorkerReport): void => {
    const directory = report.plan;
    if (directory !== undefined) {
      // 路由：先找包含该 note 的组，再退到 Plan 级条目（老路径），最后试临时 worker 的键。
      const entry =
        findByNote(registry, directory, report.note) ??
        registry.get(entryKeyOf(directory)) ??
        registry.get(directory);
      if (entry !== undefined) {
        entry.lastReport = report;
        const job = entry.job;
        if (job !== undefined) {
          const timeoutMs = deps.settings().orchestrator.workerTimeoutMs;
          renew(entry, job, timeoutMs, () => sendTimeout(entry, job, timeoutMs));
        }
      }
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
    createDispatchTool(runtime, registry, deps, onReport, sendTimeout),
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

  const start = (ctx: ExtensionContext): void => {
    resetPending = false;
    // 基线只在这里取一次：此处活跃集合还是宿主给的原始值，没被本插件收敛过。
    baseline ??= pi.getActiveTools();
    if (
      deps.settings().tools.orchestrator &&
      pi.getFlag("orchestrator") === true &&
      sessionModeOf(branchOf(ctx)) === undefined
    ) {
      pi.appendEntry(MODE_ENTRY, { enabled: true });
    }
    sync(ctx);
  };

  // 进程级兜底：记录中断凭据后干净退出；凭据等人显式查询时才展示并被移除。
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
    } else {
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
    }
    // 全局视图连崩溃凭据一起展示，展示后整档清除。
    const crashed = interrupted.read();
    if (crashed !== undefined) {
      lines.push(`上次崩溃: ${crashed.at} · ${crashed.reason}`);
      lines.push(
        `  仍在跑: ${crashed.plans.length === 0 ? "（无记录）" : crashed.plans.join(", ")}`,
      );
      interrupted.clear();
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
