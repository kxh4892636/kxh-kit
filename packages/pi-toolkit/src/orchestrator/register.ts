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
import { installCrashGuard, stateDirectory } from "./errors.ts";
import {
  createRegistry,
  DELIVERY_MODES,
  deliver,
  disposeAll,
  disposeEntry,
  entryKeyOf,
  harvest,
  keyBelongsToPlan,
  planDirectoryOf,
  type DeliveryMode,
  type WorkerEntry,
  type WorkerJob,
  type WorkerRegistry,
} from "./handles.ts";
import { spawnWorker, type SpawnWorkerOptions, type SpawnedWorker } from "./spawn.ts";
import { clipText } from "./events.ts";
import { compactLedger, COMPACT_THRESHOLD } from "./projection.ts";
import { migrateLedger } from "./migrate.ts";
import { closeLedger, openLedger } from "./ledger.ts";
import {
  closeProjection,
  createInterruptedAccess,
  openProjection,
  orphanWorkers,
  progressAtOf,
  type ProjectedWorker,
  type Projection,
} from "./projection.ts";
import {
  abortedWorkerSession,
  markWorkerSessionAborted,
  nextTempSeq,
  rememberWorkerSession,
} from "./worker-sessions.ts";
import {
  buildRetryMessage,
  buildTimeoutEvidence,
  decideRetry,
  diagnosisFromReports,
  diagnosisPrompt,
  type Diagnosis,
  type TimeoutEvidencePack,
} from "./diagnose.ts";
import { INPUT_KINDS, type InputKind, type WorkerReport } from "./types.ts";
import { assetsSkillsRoot, readPromptText } from "./assets.ts";
import { createAskQuestionsTool } from "./ask.ts";
import { DEFAULT_DOMAIN_ROOT } from "./config.ts";
import {
  buildSeed,
  currentPlanOf,
  CURRENT_PLAN_ENTRY,
  isOrchestratorActive,
  latestResetAt,
  MODE_ENTRY,
  RESET_ENTRY,
  sessionModeOf,
  type BranchEntryLike,
} from "./mode.ts";
import {
  activePlans,
  listPlans,
  mainWorkspaceOf,
  planRefOf,
  resolvePlan,
  type PlanRef,
} from "./plan.ts";
import { pickMode } from "./selector.ts";
import { createSidebar } from "./sidebar.ts";
import {
  autoWorktreeName,
  DEFAULT_WORKTREE_HOOKS,
  sanitizeWorktreeName,
  type InstallOutcome,
  type MergeOutcome,
  type WorktreeHooks,
  type WorktreeInfo,
} from "./worktree.ts";
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

/** 三个 Plan 工具、账本摘要 / 命令入口与询问工具；Orchestrator 生效时一并激活。 */
export const ORCHESTRATOR_TOOL_NAMES = [
  "orchestrator_read",
  "orchestrator_write",
  "orchestrator_check",
  "orchestrator_state",
  "orchestrator_command",
  "ask_questions",
] as const;

const ORCHESTRATOR_TOOL_SET: ReadonlySet<string> = new Set(ORCHESTRATOR_TOOL_NAMES);

/**
 * 宿主内置工具的默认集合：`defaultTools` 没设置时 pi 用的就是这四个（`docs/settings.md`）。
 *
 * 不从 pi 包里 import `DEFAULT_TOOL_NAMES`：它没从包根导出，而扩展在运行时是 bundle 进来的。
 */
const HOST_DEFAULT_TOOL_NAMES = ["read", "bash", "edit", "write"] as const;

/**
 * 会话 entry：本会话**首次收敛之前**的活跃工具集合。
 *
 * pi 会把工具装载记进 transcript（`toolsAdded` / `toolsRemoved`），`/reload` 与恢复会话都会
 * 重现上一次的装载。`orchestrator-baseline` 记的是收敛之前的值，reload 之后从这里读回来，
 * 而不是再快照一次（再快照拿到的只会是收敛后的六个）。
 */
export const BASELINE_ENTRY = "orchestrator-baseline";

/** `+name` / `-name` 形式的条目：叠加在默认集上，而不是替换它。 */
const isToolModifier = (entry: string): boolean => entry.startsWith("+") || entry.startsWith("-");

/**
 * 配置层的默认工具集合，与 `defaultTools` / `--tools` 同语义：纯名字列表替换默认集，只有
 * `+name` / `-name` 时叠加在默认集上。
 *
 * 这是「模式关掉之后宿主该有哪些工具」的**配置层**来源。不能用运行时 `getActiveTools()` 当基线：
 * 收敛过的集合会被 pi 记进 transcript 并在 `/reload`、恢复会话时重现，于是“基线”就是收敛结果，
 * 宿主工具再也回不来（note 30 首次真机验证就是这个现象）。
 *
 * 已知缺口：`--tools` / `--exclude-tools` 的 CLI 覆写不进设置，扩展读不到；那种启动方式下
 * 由 `BASELINE_ENTRY` 记下的启动集合兜底。
 * @param pi - 扩展 API（取生效设置）。
 * @returns 默认工具名，配置层顺序。
 */
const configToolDefaults = (pi: ExtensionAPI): string[] => {
  let configured: string[] | undefined;
  try {
    const value = (pi.getSettings() as { defaultTools?: unknown }).defaultTools;
    if (Array.isArray(value)) {
      configured = value.filter((item): item is string => typeof item === "string");
    }
  } catch {
    configured = undefined;
  }
  const replace = configured !== undefined && !configured.some(isToolModifier);
  const names: string[] = replace ? [...(configured ?? [])] : [...HOST_DEFAULT_TOOL_NAMES];
  for (const entry of configured ?? []) {
    if (!isToolModifier(entry)) continue;
    const name = entry.slice(1);
    if (entry.startsWith("+")) {
      if (!names.includes(name)) names.push(name);
      continue;
    }
    const at = names.indexOf(name);
    if (at >= 0) names.splice(at, 1);
  }
  return names;
};

/** 分支上最后一次记下的启动活跃集合；没有返回 undefined。 */
const baselineEntryOf = (entries: readonly BranchEntryLike[]): string[] | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== BASELINE_ENTRY) continue;
    const names = (entry.data as { names?: unknown } | undefined)?.names;
    if (!Array.isArray(names)) continue;
    return names.filter((item): item is string => typeof item === "string");
  }
  return undefined;
};

/** 宿主入口提供的依赖。 */
export interface OrchestratorDeps {
  /** 当前设置；每次读取，`/toolkit` 改动立即生效。 */
  readonly settings: () => ToolkitSettings;
  /** 持久化 `orchestrator.always`；失败由入口提示。 */
  readonly setAlways: (always: boolean) => void;
  /** 起 worker 的入口；缺省用 SDK，测试可替换以避开真实会话。 */
  readonly spawn?: (options: SpawnWorkerOptions) => Promise<SpawnedWorker>;
  /** 状态目录（崩溃凭据、worker 会话索引）；缺省 `<agentDir>/orchestrator`，测试可覆盖。 */
  readonly stateDir?: () => string;
  /** worktree 操作；缺省真的跑 git + pnpm，测试可整体替换。 */
  readonly worktree?: WorktreeHooks;
  /**
   * 重要推送的合并窗口（毫秒）；缺省 5 秒。
   *
   * 测试给 0 让推送变同步，否则要等 5 秒才能断言“推了 / 没推”。
   */
  readonly digestWindowMs?: number;
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

/**
 * 把 live worker 按父子关系排开：父先列，子紧跟其后。
 *
 * 子 worker（`depth >= 1`）的父不在列表里时当根列出（父已经退出，子还在收尾）。
 * @param workers - live worker（已按开始时刻升序）。
 * @returns 展示顺序。
 */
const orderByHierarchy = (workers: readonly ProjectedWorker[]): readonly ProjectedWorker[] => {
  const keys = new Set(workers.map((worker) => worker.worker));
  const children = new Map<string, ProjectedWorker[]>();
  const roots: ProjectedWorker[] = [];
  for (const worker of workers) {
    const parent = worker.parent;
    if (parent === undefined || !keys.has(parent)) {
      roots.push(worker);
      continue;
    }
    const list = children.get(parent) ?? [];
    list.push(worker);
    children.set(parent, list);
  }
  const ordered: ProjectedWorker[] = [];
  for (const root of roots) {
    ordered.push(root);
    for (const child of children.get(root.worker) ?? []) ordered.push(child);
  }
  return ordered;
};

/** 相对时刻：清单里只需要“多久之前”，不需要绝对时间。 */
const formatAgo = (at: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
};

/**
 * 需要人知晓 / 确认的上报结果：只有这些推送并开回合。
 *
 * 普通 `done` 只留在账本里：它是进展播报，推送只会把编排方的上下文灌满。
 */
const IMPORTANT_OUTCOMES: ReadonlySet<string> = new Set([
  "needs_review",
  "needs_answer",
  "blocked",
  "failed",
]);

/** 诊断 worker 自己的兑底超时：一次诊断不应比一个 worker 还费时间。 */
const DIAGNOSIS_TIMEOUT_MS = 5 * 60_000;

/**
 * 超时那一刻的现场：句柄已经摘掉，但诊断与重派都还需要这些字段。
 *
 * 全部在 `timeoutWorker` 里先拷出来（`entry` 随后会被 dispose）。
 */
interface TimedOutWorker {
  readonly key: string;
  readonly planRef: string;
  readonly kind: "plan" | "temp";
  readonly notes: readonly string[];
  readonly note?: string;
  readonly sessionPath?: string;
  readonly cwd: string;
  readonly workspace: string;
  readonly plan?: PlanRef;
  readonly worktree?: {
    readonly name: string;
    readonly directory: string;
    readonly branch: string;
  };
  readonly lastReport?: {
    readonly note: string;
    readonly outcome: string;
    readonly summary: string;
  };
  readonly elapsedMs: number;
  readonly lastProgressAt: string;
  /** 被中止那一代的 `timeout` 事件 seq（重试事件带它，方便回查）。 */
  readonly timeoutSeq: number;
}

/**
 * worker 终态后自动合并它的 worktree（代码执行，不经模型）。
 *
 * 为什么不让编排方派一条“回收指令”：合并是收工信号的最后一跳，再排一个 LLM 回合去
 * 跑两条 git 命令既慢又容易忘。这里只在主分支能 fast-forward 时合并 —— 分叉的现场
 * （目录 + 分支）一律保留，rework 和人看都还要它。
 *
 * 只写账本：成功 `worker.merged`、失败 `worker.merge_blocked`；不写任何 json 文件、
 * 不碰 `released`。
 * @param input - 目标 worker、主工作区、依赖与账本。
 */
const mergeWorktreeOf = async (input: {
  readonly entry: WorkerEntry;
  readonly workspace: string;
  readonly deps: OrchestratorDeps;
  readonly ledgerOf: () => ReturnType<typeof openLedger>;
}): Promise<void> => {
  const worktree = input.entry.worktree;
  if (worktree === undefined) return;
  const hooks = input.deps.worktree ?? DEFAULT_WORKTREE_HOOKS;
  let outcome: MergeOutcome;
  try {
    outcome = await hooks.merge({
      workspace: input.workspace,
      name: worktree.name,
      branch: worktree.branch,
    });
  } catch (error) {
    // 钩子自己抛错也要落账：合并失败不能变成一条未处理拒绕。
    outcome = {
      merged: false,
      branch: worktree.branch,
      directory: worktree.directory,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  const worker = input.entry.planDirectory;
  if (outcome.merged) {
    input.ledgerOf().append({
      type: "worker.merged",
      payload: {
        worker,
        worktree: worktree.name,
        branch: worktree.branch,
        ...(outcome.commit === undefined ? {} : { commit: outcome.commit }),
        ...(outcome.cleanup === undefined ? {} : { cleanup: outcome.cleanup }),
      },
    });
    // 目录已回收：条目上不再挂 worktree，否则同一键再派会拿一个不存在的目录。
    if (input.entry.worktree?.name === worktree.name) delete input.entry.worktree;
    return;
  }
  input.ledgerOf().append({
    type: "worker.merge_blocked",
    payload: {
      worker,
      worktree: worktree.name,
      branch: worktree.branch,
      directory: outcome.directory,
      reason: outcome.reason ?? "未知原因",
    },
  });
};

/**
 * `orchestrator_command`：编排方对 worker 的所有动作的统一入口。
 *
 * `op` 默认 `dispatch`（派工或追加）；`pass` / `rework` / `answer` / `fact` 是对应输入种类的
 * 快捷方式（等价于 `op: "dispatch"` + 那个 `kind`）；`abort` 中止 worker。
 *
 * 派工三种形态：给了 `plan` + `notes` 就派**组 worker**（一组无依赖 note 一个 worker，同一组
 * 复用句柄）；只给 `plan` 走 Plan 级派工；`plan` 与 `lockedPlan` 都没有则是**临时 worker**
 * （不解析 Plan、键 `temp:<id>`、跑完即弃）。
 *
 * **每个命令都落成账本事件**：`worker.spawned` / `input.sent` / `note.pass` / `worker.exit`。
 * 投递仍然调 SDK（`session.prompt/steer/followUp`）—— 账本只负责记录与顺序，不替代投递。
 * `pass` 授权重放得出（`note.pass`），不再放内存集合。
 */
const createCommandTool = (
  runtime: ToolRuntime,
  registry: WorkerRegistry,
  deps: OrchestratorDeps,
  stateDir: () => string,
  ledgerOf: () => ReturnType<typeof openLedger>,
  projectionOf: () => Projection,
  onReport: (report: WorkerReport) => void,
): OrchestratorTool => {
  return {
    name: "orchestrator_command",
    label: "Command",
    description:
      "编排方对 worker 的统一命令入口：op=dispatch（默认，派工或追加输入）/ pass / rework / answer / fact / abort。给了 plan + notes 就按组分派（一组无依赖 note 一个 worker），只给 plan 走 Plan 级派工，都没给则起临时 worker（无 Plan、只读 + report、跑完即弃）。**只有 kind=message（要干活）的 Plan 派工**默认先在 .worktrees/<名字>（分支 wt/<名字>）里隔离并在那里 pnpm install；pass / rework / answer / fact 是纯控制指令，复用主工作区、不建也不装依赖；临时 worker 默认不建。显式 worktree: true / 一个名字会覆盖默认（任何 kind 都尊重），false 保证不建。worker 终态后代码自动做 --ff-only 合并并回收（可 ff-only 才合，否则保留现场）。delivery 为 steer（默认，插入当前运行）或 queue（排到 worker 当前轮之后）。每个命令都写进事件账本。",
    promptSnippet:
      "Send commands to workers (dispatch / pass / rework / answer / abort); every command is an event in the ledger.",
    promptGuidelines: [
      "一组无依赖 note 一个 worker：用 notes 显式给出这一组；组内不得互相 blocked_by。",
      "只有 kind=message 的 Plan 派工默认在 .worktrees/<名字> 隔离（单 note 为 note-<id>，组为 grp-<id-id>，Plan 级为 plan），worker 的 cwd 就是那个目录，Plan 仍锚定主工作区；pass / rework / answer / fact 复用主工作区，不建也不装依赖。临时 worker 默认不建；需要隔离时显式给 worktree: true 或一个名字（任何 kind 都尊重），不想隔离用 worktree: false。",
      "worktree 的 worker 完成前必须自己 rebase 到主分支最新提交并在 report 里写明；合并由代码自动做（可 ff-only 就合 + 回收，否则保留现场），不要再派回收指令。",
      "pass / rework / answer 带 note 时路由到包含它的组；该 note 不属于任何组就自动以 [note] 单独成组投递。只有 note 本身不在 Plan 里才报错。",
      "默认 delivery=steer：追加口径在本轮生效；批量派活或不希望打断时显式 delivery=queue。硬停整个 worker 用 op=abort。",
      "用户的明确决定才可下发 pass / rework；不要把推断当放行。worker 的 report 不再自动推给你，需要时用 orchestrator_state 拉摘要。",
    ],
    parameters: Type.Unsafe<Record<string, unknown>>({
      type: "object",
      additionalProperties: false,
      properties: {
        op: {
          type: "string",
          enum: ["dispatch", "pass", "rework", "answer", "fact", "abort"],
          description:
            "dispatch（默认，派工或追加）| pass | rework | answer | fact（各自等价于对应 kind 的 dispatch）| abort（中止 worker）",
        },
        plan: {
          type: "string",
          description:
            "<domain>/<lifecycle>/<name>；省略且无 lockedPlan 时起临时 worker（不绑定 Plan）",
        },
        kind: {
          type: "string",
          enum: [...INPUT_KINDS],
          description: "输入种类，默认 message（op 为 pass/rework/answer/fact 时以 op 为准）",
        },
        delivery: {
          type: "string",
          enum: [...DELIVERY_MODES],
          description:
            "投递方式：steer（默认，插入当前运行，下一次 LLM 调用前生效；worker 空闲时退化为直接开新一轮）| queue（追加到当前轮之后，不打断）",
        },
        note: { type: "string", description: "kind=pass / rework / answer 时针对的 note id" },
        notes: {
          type: "array",
          items: { type: "string" },
          description: "组派工：这一组 note（互相不得有 blocked_by 依赖）；省略则走 Plan 级派工",
        },
        message: { type: "string", description: "派活正文或追加说明" },
        worktree: {
          type: ["boolean", "string"],
          description:
            "省略时：kind=message 的 Plan 派工默认建（true → 自动命名：单 note 为 note-<id>，组为 grp-<id-id>，Plan 级为 plan），pass / rework / answer / fact 与临时 worker 默认不建。给 true 或名字 → 任何 kind 都建 / 复用 .worktrees/<名字>（分支 wt/<名字>，基线 HEAD），并先在该目录 pnpm install；false → 不建。",
        },
        worker: {
          type: "string",
          description:
            "临时 worker 标识 `temp:<id>`（只与 plan 缺省时的临时派工合用）：盘上有这个 id 的会话就续上它，没有则新建；被 abort / 超时作废的 id 直接报错。省略则自动取下一个序号。",
        },
        idem: {
          type: "string",
          description: "幂等键：同一次逻辑投递重发时带上同一个键，账本里只算一次（可选）",
        },
      },
      required: [],
    }),
    async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
      const args = asArguments(raw);
      const op = optionalString(args, "op") ?? "dispatch";
      if (op === "abort") return abortWorker(args, registry, stateDir, ledgerOf);
      if (!["dispatch", "pass", "rework", "answer", "fact"].includes(op)) {
        throw new Error("op 必须是 dispatch | pass | rework | answer | fact | abort");
      }
      const kind = (
        op === "dispatch" ? (optionalString(args, "kind") ?? "message") : op
      ) as InputKind;
      if (!(INPUT_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`kind 必须是 ${INPUT_KINDS.join(" | ")}`);
      }
      const deliveryMode = (optionalString(args, "delivery") ?? "steer") as DeliveryMode;
      const idem = optionalString(args, "idem");
      if (!(DELIVERY_MODES as readonly string[]).includes(deliveryMode)) {
        throw new Error(`delivery 必须是 ${DELIVERY_MODES.join(" | ")}`);
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
      const requestedWorker = optionalString(args, "worker");
      if (requestedWorker !== undefined && plan !== undefined) {
        throw new Error("worker=temp:<id> 只用于临时派工；Plan 派工用 plan + notes 定位");
      }
      if (requestedWorker !== undefined && !/^temp:.+/.test(requestedWorker)) {
        throw new Error("worker 必须是 `temp:<id>`");
      }
      const tempId =
        plan === undefined
          ? (requestedWorker?.slice("temp:".length) ?? String(nextTempSeq(stateDir())))
          : "";
      // pass / rework / answer 带 note 时先找包含它的组；没有就**以该 note 单独成组**（组键 = [note]），
      // 不再报“不知道投给哪一组”。只有 note 本身不在 Plan 里才报错（下面校验）。
      const noteRouting = plan !== undefined && note !== undefined && kind !== "message";
      const groupedByNote = noteRouting ? findByNote(registry, plan.directory, note) : undefined;
      // 显式给了 notes 就以那组为准（不再拆成单 note 组）；只有既没组也没命中的 note 才自动成组。
      const autoGroup = noteRouting && groupNotes.length === 0 && groupedByNote === undefined;
      /** 本次真正落到哪个组：note 路由命中的组 / 自动成组的 [note] / 参数给的组。 */
      const targetNotes = groupedByNote?.notes ?? (autoGroup ? [note as string] : groupNotes);
      if (autoGroup && plan !== undefined) {
        const document = await loadDocument(plan.directory, runtime.limits());
        if (!document.notes.some((item) => item.id === note)) {
          throw new Error(`note ${note} 不在 ${planRefOf(plan)} 里：检查 note id 或换一个 Plan`);
        }
      }
      const key =
        plan === undefined
          ? `temp:${tempId}`
          : (groupedByNote?.planDirectory ?? entryKeyOf(plan.directory, targetNotes));
      const planRef = plan === undefined ? key : planRefOf(plan);
      // 作废登记是落盘的：被 abort / 超时的会话不再复用那时的上下文，连重启也不复活。
      // 临时 id 直接报错（id 本身就是地址，得换一个）；Plan/组的键必须能重派，所以换一代
      // 会话（id 与作废时刻绑定），旧 jsonl 当作历史留在盘上。
      const aborted = abortedWorkerSession(stateDir(), key);
      if (aborted !== undefined && plan === undefined) {
        throw new Error(
          `${key} 的 worker 会话已于 ${aborted.at} 作废（${aborted.reason}）：换一个 id（worker=temp:<新 id>）或重新分组再派`,
        );
      }
      const sessionKey = aborted === undefined ? key : `${key}#${aborted.at}`;

      if (plan !== undefined && groupNotes.length > 0) {
        await assertParallelGroup(plan, groupNotes, runtime);
      }

      // worktree：先把目录与依赖备好，再起 worker；装不上就中止派工（不许静默跳测试）。
      const requestedWorktree = args["worktree"];
      if (
        requestedWorktree !== undefined &&
        typeof requestedWorktree !== "boolean" &&
        typeof requestedWorktree !== "string"
      ) {
        throw new Error("worktree 必须是 true 或一个名字");
      }
      // 只有**要干活**的派工（`kind: message`）才默认建 worktree：两个 worker 改同一批文件时
      // 不靠“文件不重叠”的自觉。`pass` / `rework` / `answer` / `fact` 是纯控制指令，不产生代码
      // 改动，建 + 装依赖只是白花十几秒；临时 worker 同样默认不建（一次性活不值得）。
      // 显式 `worktree: true | "<名字>"` 仍然覆盖默认（任何 kind 都尊重），`false` 保证不建。
      const wantsWorktree =
        requestedWorktree === undefined
          ? plan !== undefined && kind === "message"
          : requestedWorktree !== false;
      let entry = registry.get(key);
      const started = entry === undefined;
      let worktree: WorktreeInfo | undefined;
      /** 本次是否新建（复用已有 worktree 时不再装依赖）。 */
      let worktreeCreated = false;
      let worktreeInstall: InstallOutcome | undefined;
      if (wantsWorktree) {
        const hooks = deps.worktree ?? DEFAULT_WORKTREE_HOOKS;
        const name =
          typeof requestedWorktree === "string"
            ? sanitizeWorktreeName(requestedWorktree)
            : (entry?.worktree?.name ?? autoWorktreeName(targetNotes));
        // 合并成功会在条目上摘掉 worktree；同一键再派（rework / answer）时目录已经没了，
        // 这里重新 ensure + install 并写回条目 —— 复用同一个会话，不重开会话。
        worktree = await hooks.ensure({ workspace, name });
        worktreeCreated = worktree.created;
        // 复用已有 worktree 时依赖已装完（上次派工装的），不重复花 13s。
        worktreeInstall = worktree.created
          ? await hooks.install(worktree.directory)
          : { ok: true, command: "（复用已有 worktree，跳过 install）", durationMs: 0 };
        if (!worktreeInstall.ok) {
          throw new Error(
            `worktree ${name} 的依赖安装失败（${worktreeInstall.command}，${worktreeInstall.durationMs}ms）：${worktreeInstall.reason ?? "未知原因"}。` +
              `worker 在那里跑不了测试，已中止派工；工作区保留在 ${worktree.directory}，可手工修后重派或删掉。`,
          );
        }
        if (entry !== undefined) {
          entry.worktree = {
            name: worktree.name,
            directory: worktree.directory,
            branch: worktree.branch,
          };
        }
      }

      /** 本次是否从磁盘上的旧会话续上（新建时为 false）。 */
      let resumed = false;
      if (entry === undefined) {
        const base = {
          // 有 worktree 时 worker 的 cwd 就是隔离目录；Plan 仍用主工作区的绝对路径（`lockedPlan`）。
          cwd: worktree?.directory ?? workspace,
          settings: deps.settings,
          report: onReport,
          // 放行集合是账本里的 `note.pass` 重放出来的，不再放内存。
          released: (noteId: string) =>
            plan === undefined ? false : projectionOf().isReleased(plan.directory, noteId),
          workerKey: key,
          sessionKey,
        };
        const spawned = await (deps.spawn ?? spawnWorker)(
          plan === undefined ? { ...base, temp: tempId } : { ...base, plan },
        );
        // 登记“这个键已经被用过”：临时 id 计数不依赖内存计数器，重启后不会重发 temp:1。
        rememberWorkerSession(stateDir(), sessionKey, spawned.sessionPath ?? "");
        resumed = spawned.resumed;
        entry = registry.add({
          planDirectory: key,
          planRef,
          ...(plan === undefined ? { kind: "temp" as const } : {}),
          ...(targetNotes.length === 0 ? {} : { notes: targetNotes }),
          ...(spawned.sessionPath === undefined ? {} : { sessionPath: spawned.sessionPath }),
          // 诊断与重派都要用这三项，而它们几十分钟后才用得到：派工时就得存下来。
          cwd: worktree?.directory ?? workspace,
          workspace,
          ...(plan === undefined ? {} : { plan }),
          ...(worktree === undefined
            ? {}
            : {
                worktree: {
                  name: worktree.name,
                  directory: worktree.directory,
                  branch: worktree.branch,
                },
              }),
          startedAt: Date.now(),
          session: spawned.session,
        });
        // 起 worker 落账：投影据此得到 worker 表（live / 组 / worktree / 会话路径）。
        ledgerOf().append({
          type: "worker.spawned",
          payload: {
            worker: key,
            planRef,
            kind: plan === undefined ? "temp" : "plan",
            ...(targetNotes.length === 0 ? {} : { notes: targetNotes }),
            ...(spawned.sessionPath === undefined ? {} : { sessionPath: spawned.sessionPath }),
            sessionKey,
            resumed: spawned.resumed,
            startedAt: new Date().toISOString(),
            ...(worktree === undefined
              ? {}
              : {
                  worktree: {
                    name: worktree.name,
                    branch: worktree.branch,
                    directory: worktree.directory,
                  },
                }),
          },
        });
      }
      // `pass` 授权进账本（重启靠重放恢复），再投递。
      if (kind === "pass" && note !== undefined && plan !== undefined) {
        ledgerOf().append({
          type: "note.pass",
          payload: { plan: plan.directory, planRef, note },
        });
      }
      const target = entry;
      const delivery = deliver(target, kind, message, note, deliveryMode);
      // 新一代 job 接管：先把上一条的清掉，免得定时器滞留到超时后才消失。
      harvest(target);
      const now = Date.now();
      const job: WorkerJob = {
        kind,
        ...(note === undefined ? {} : { note }),
        ...(targetNotes.length === 0 ? {} : { notes: targetNotes }),
        startedAt: now,
        progressAt: now,
        settled: delivery.settled,
        notified: false,
      };
      target.job = job;
      // 投递落账（`input.sent`）：`deliver` 已经算好实际落到哪条分支。
      const sentEvent = ledgerOf().append({
        type: "input.sent",
        ...(idem === undefined ? {} : { idem }),
        payload: {
          worker: key,
          planRef,
          kind,
          delivery: deliveryMode,
          delivered: delivery.delivered,
          text: clipText(message),
          ...(note === undefined ? {} : { note }),
          ...(targetNotes.length === 0 ? {} : { notes: targetNotes }),
        },
      });
      // 终态到了就收割：清定时器、摘 job。reject 也走到这里，不让它变成未处理拒绝。
      // 临时 worker 是一次性的：终态即摘除句柄并 dispose，会话文件留在盘上等同 id 再派。
      const done = (): void => {
        const harvested = harvest(target, job);
        // 自动合并只在“正常终态”做：
        // - 已有更新的一代 job 排着（`target.job !== undefined`）：等它的终态，否则会把别人还没改完的分支合掉；
        // - abort / 超时已经提前收割了 job（`harvest` 返回 false）：半成品不合入主分支，现场保留。
        if (harvested && target.job === undefined) {
          void mergeWorktreeOf({ entry: target, workspace, deps, ledgerOf });
        }
        if (target.kind === "temp") {
          ledgerOf().append({
            type: "worker.exit",
            payload: { worker: target.planDirectory, reason: "settled" },
          });
          registry.remove(target.planDirectory);
          void disposeEntry(target);
        }
      };
      void delivery.settled.then(done, done);

      const head = started
        ? plan === undefined
          ? `已起临时 worker ${planRef}（无 Plan，跑完即弃；同 id 再派可续上它）`
          : targetNotes.length > 0
            ? `已起 worker 接手 ${planRef} 的组 [${targetNotes.join(", ")}]${autoGroup ? "（该 note 原本不属于任何组，已单独成组）" : ""}`
            : `已起 worker 接手 ${planRef}`
        : `已投递给 ${planRef} 的 worker${targetNotes.length > 0 ? `（组 [${targetNotes.join(", ")}]）` : ""}`;
      const sessionLine =
        target.sessionPath === undefined
          ? undefined
          : `会话：${resumed ? "续上既有 jsonl" : "新建 jsonl"} ${target.sessionPath}`;
      const deliverLine =
        delivery.delivered === "steered"
          ? "worker 正在跑，已插话：下一次 LLM 调用前生效。"
          : delivery.delivered === "queued"
            ? "worker 正在跑，输入已排队：当前轮做完再消化。"
            : deliveryMode === "steer"
              ? "worker 空闲，插话退化为直接开新一轮。"
              : "worker 已开始处理。";
      const worktreeLine =
        target.worktree === undefined
          ? undefined
          : `worktree: ${target.worktree.name}（${target.worktree.branch}）· ${worktreeCreated ? "新建" : "复用"}${worktreeInstall === undefined ? "" : ` · 依赖 ${worktreeInstall.durationMs}ms`}`;
      return {
        content: textBlocks(
          [
            head,
            `kind: ${kind}${note === undefined ? "" : ` · note ${note}`}`,
            `delivery: ${deliveryMode} → ${delivery.delivered}`,
            deliverLine,
            ...(sessionLine === undefined ? [] : [sessionLine]),
            ...(worktreeLine === undefined ? [] : [worktreeLine]),
            ...(target.worktree === undefined
              ? []
              : [
                  `worker 的 cwd 是 ${target.worktree.directory}；Plan 仍锚定主工作区。完成前先 rebase 到主分支最新提交，再 report 里写“可 --ff-only 合并”（合并由代码自动做，不需派回收指令）。`,
                ]),
            `已记入账本：seq ${sentEvent.seq}（事件账本不再推送 report，用 orchestrator_state 拉摘要）。`,
          ].join("\n"),
        ),
        details: {
          plan: planRef,
          started,
          resumed,
          queued: delivery.queued,
          delivery: deliveryMode,
          delivered: delivery.delivered,
          kind,
          seq: sentEvent.seq,
          ...(targetNotes.length === 0 ? {} : { notes: targetNotes }),
          ...(autoGroup ? { autoGroup: true } : {}),
          ...(plan === undefined ? { temp: true, worker: key } : {}),
          ...(target.sessionPath === undefined ? {} : { sessionPath: target.sessionPath }),
          ...(note === undefined ? {} : { note }),
          ...(target.worktree === undefined
            ? {}
            : {
                worktree: target.worktree.name,
                branch: target.worktree.branch,
                worktreePath: target.worktree.directory,
              }),
          ...(worktreeInstall === undefined ? {} : { worktreeInstall }),
        },
      };
    },
  };
};

/** `abort` 命令：中止一个 / 一批 / 全部 worker，并落 `worker.exit` 事件（会话同时作废）。 */
const abortWorker = async (
  args: Record<string, unknown>,
  registry: WorkerRegistry,
  stateDir: () => string,
  ledgerOf: () => ReturnType<typeof openLedger>,
): Promise<{ content: ReturnType<typeof textBlocks>; details: Record<string, unknown> }> => {
  const target = optionalString(args, "plan") ?? optionalString(args, "worker");
  const exiting = (key: string): void => {
    ledgerOf().append({ type: "worker.exit", payload: { worker: key, reason: "abort" } });
  };
  if (target === undefined) {
    for (const entry of registry.list()) {
      markWorkerSessionAborted(stateDir(), entry.planDirectory, "abort");
      exiting(entry.planDirectory);
    }
    const count = await disposeAll(registry);
    return { content: textBlocks(`已中止 ${count} 个 worker。`), details: { count } };
  }
  const entries = registry
    .list()
    .filter((entry) => entry.planRef === target || entry.planDirectory === target);
  if (entries.length === 0) throw new Error(`没有在跑的 worker: ${target}`);
  for (const entry of entries) {
    markWorkerSessionAborted(stateDir(), entry.planDirectory, "abort");
    exiting(entry.planDirectory);
    registry.remove(entry.planDirectory);
    await disposeEntry(entry);
  }
  return {
    content: textBlocks(`已中止 ${target} 的 worker（会话作废：同 id / 同组再派会报错）。`),
    details: { count: entries.length },
  };
};

/** 待消费概况（从投影算）：条数、最老一条等了多久、是否久到该提醒（软提示，不杀）。 */
const stallOfProjection = (
  worker: ProjectedWorker,
  now: number,
  softStallMs: number,
): { pending: number; oldestMs?: number; stalled: boolean; lastProgressAt: number } => {
  const lastProgressAt = progressAtOf(worker);
  const oldest = worker.pending[0];
  const oldestMs = oldest === undefined ? undefined : Math.max(0, now - Date.parse(oldest.at));
  return {
    pending: worker.pending.length,
    ...(oldestMs === undefined ? {} : { oldestMs }),
    stalled: lastProgressAt > 0 && now - lastProgressAt >= softStallMs,
    lastProgressAt,
  };
};

/** 待消费的一句话展示：`待消费 2（最老 3 分钟）`；久无进展时追 `⚠ 疑似停滞`（不杀）。 */
const pendingLabelOf = (summary: {
  pending: number;
  oldestMs?: number;
  stalled: boolean;
}): string => {
  const wait = (waited: number): string =>
    waited < 60_000
      ? `${Math.max(1, Math.round(waited / 1000))} 秒`
      : `${Math.round(waited / 60_000)} 分钟`;
  const base =
    summary.pending === 0
      ? "待消费 0"
      : `待消费 ${summary.pending}（最老 ${wait(summary.oldestMs ?? 0)}）`;
  return `${base}${summary.stalled ? " ⚠ 疑似停滞" : ""}`;
};

/**
 * `orchestrator_state`：编排方拉摘要的唯一入口（模型不再被推送）。
 *
 * 内容全部来自账本投影：live worker（含待消费与最后 report）、未读 report、待确认 note
 * （`notes.json` 里 waiting 的）、`⚠` 卡死项与上次中断凭据。读一次就把未读 report 标成已读
 * （落一条 `state.pulled` 事件），所以“未读”跨重启仍然成立。
 */
const createStateTool = (
  runtime: ToolRuntime,
  registry: WorkerRegistry,
  deps: OrchestratorDeps,
  stateDir: () => string,
  ledgerOf: () => ReturnType<typeof openLedger>,
  projectionOf: () => Projection,
  /** op=resume 的实现：起新一代、复用 jsonl、落 `worker.resumed`。 */
  resumeOrphans: (
    target: string | undefined,
    workspace: string,
  ) => Promise<{ content: ReturnType<typeof textBlocks>; details: Record<string, unknown> }>,
): OrchestratorTool => ({
  name: "orchestrator_state",
  label: "State",
  description:
    "拉取编排摘要：live worker（含待消费输入、最后 report、worktree、超时与重试）、子 worker 层级、未读 report、待确认 note、⚠ 卡死项、可恢复的孤儿与上次中断凭据。读一次即把未读 report 标成已读（账本里的 state.pulled）。op=abort 中止一个 plan / temp worker（省略 plan 中止全部）；op=resume 恢复孤儿 worker（复用 jsonl，极短续跑消息）。",
  promptSnippet:
    "Pull the orchestrator state summary from the event ledger (workers, hierarchy, unread reports, stuck workers, resumable orphans); or abort / resume workers.",
  promptGuidelines: [
    "重要上报（needs_review / needs_answer / blocked / failed / 超时 / 放弃重试）会推给你；普通 done 只在账本里，需要时用这个工具拉。",
    "读一次就把未读 report 消费掉，所以按需调用，别为了心跳反复读。",
    "op=resume 先恢复父 worker；子 worker 的会话不落盘，由父重建，建不回来的会写明“子任务丢失”。",
  ],
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: {
        type: "string",
        enum: ["list", "abort", "resume"],
        description: "list（默认）| abort | resume（恢复孤儿 worker）",
      },
      plan: {
        type: "string",
        description: "op=abort 时的 plan 引用或 `temp:<id>`；op=resume 时只恢复这个 Plan 的孤儿",
      },
    },
    required: [],
  }),
  async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
    const args = asArguments(raw);
    const op = optionalString(args, "op") ?? "list";
    if (op === "abort") {
      return abortWorker(args, registry, stateDir, ledgerOf);
    }
    if (op === "resume") {
      return resumeOrphans(optionalString(args, "plan"), runtime.workspace(exec));
    }

    const state = projectionOf().state();
    const now = Date.now();
    const live = [...state.workers.values()]
      .filter((worker) => worker.status === "live")
      .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
    const unread = state.reports.filter((report) => !report.read);
    // 孤儿：账本上没有 exit、进程内也没有 session（重启 / 会话退出后就是这样）。
    const orphans = orphanWorkers(state, ledgerOf().events(), (key) => {
      return registry.get(key) !== undefined;
    });
    const orphanOf = new Map(orphans.map((orphan) => [orphan.worker, orphan]));
    const lines: string[] = [
      `账本：seq ${state.lastSeq} · live ${live.length} · 未读 report ${unread.length} · 放行 ${[...state.released.values()].reduce((sum, set) => sum + set.size, 0)} 条 note`,
    ];
    if (live.length === 0) {
      lines.push("当前没有 live worker。");
    } else {
      lines.push(`live worker（${live.length}）:`);
      for (const worker of orderByHierarchy(live)) {
        // 子 worker 缩进列在父下面：层级一眼看得出，而不是一堆平铺的 sub:1。
        const indent = worker.depth > 0 ? "  ↳ " : "";
        const shape = worker.depth > 0 ? "sub" : worker.kind === "temp" ? "temp" : "plan";
        const minutes = Math.max(0, Math.round((now - Date.parse(worker.startedAt)) / 60_000));
        const group = worker.notes.length === 0 ? "" : `notes: ${worker.notes.join(",")} · `;
        const report =
          worker.lastReport === undefined
            ? "尚无上报"
            : `${worker.lastReport.outcome} · note ${worker.lastReport.note}`;
        const lastInput =
          worker.lastInput === undefined
            ? "尚无输入"
            : `${formatAgo(Date.parse(worker.lastInput.at), now)} [${worker.lastInput.kind}/${worker.lastInput.delivery}] ${worker.lastInput.text}`;
        const worktreeMark =
          worker.worktree === undefined
            ? ""
            : ` · worktree ${worker.worktree.name}（${worker.worktree.branch}）`;
        // 合并结论：成功报 commit 前 8 位；失败用 ✗ 醒目地把现场路径带出来。
        const mergeMark =
          worker.mergeBlocked !== undefined
            ? ` · ✗ 未合并：${worker.mergeBlocked.reason}（现场 ${worker.mergeBlocked.directory}）`
            : worker.merged === undefined
              ? ""
              : worker.merged.commit === undefined
                ? " · 已合并"
                : ` · 已合并 ${worker.merged.commit.slice(0, 8)}`;
        const orphan = orphanOf.get(worker.worker);
        const orphanMark =
          orphan === undefined
            ? ""
            : ` · ⚠ 孤儿${orphan.suspendedReason === undefined ? "" : `（上次 ${orphan.suspendedReason}）`}`;
        const pending = stallOfProjection(worker, now, deps.settings().orchestrator.softStallMs);
        // 超时 / 诊断：一眼看出“它已经卡过一次、下一步还会不会再自动重试”。
        const timeoutMark = worker.timeouts === 0 ? "" : ` · 超时 ${worker.timeouts} 次`;
        const diagnosisMark =
          worker.lastDiagnosis === undefined
            ? ""
            : ` · 诊断 ${worker.lastDiagnosis.cause}${
                worker.lastDiagnosis.adjust.length === 0
                  ? ""
                  : `（${worker.lastDiagnosis.adjust.join("+")}）`
              }`;
        lines.push(
          `${indent}${worker.planRef} · ${group}${shape} · ${minutes} 分钟 · 输入 ${worker.inputs} 次 · ${pendingLabelOf(pending)} · ${report} · 最近输入 ${lastInput}${worktreeMark}${mergeMark}${orphanMark}${timeoutMark}${diagnosisMark}`,
        );
      }
    }
    if (orphans.length > 0) {
      lines.push(
        `可恢复 worker（${orphans.length}，op=resume 恢复）：${orphans
          .slice(0, 10)
          .map((orphan) =>
            orphan.depth > 0
              ? `${orphan.planRef}（子 worker，由父重建）`
              : `${orphan.planRef}（${orphan.worker}）`,
          )
          .join("、")}`,
      );
    }
    // 超时 / 重试记录：worker 已经不在 live 清单里时（放弃重试、等人工）仍然看得到。
    const retryLimit = deps.settings().orchestrator.retryLimit;
    const retried = [...state.retries.values()].filter(
      (retry) => retry.attempts > 0 || retry.exhausted !== undefined,
    );
    for (const retry of retried.slice(-10)) {
      const last =
        retry.lastCause === undefined
          ? ""
          : ` · 最近诊断 ${retry.lastCause}${
              retry.lastAdjust.length === 0 ? "" : `（${retry.lastAdjust.join("+")}）`
            }`;
      const next =
        retry.exhausted === undefined
          ? ` · 下次仍会自动重试（上限 ${retryLimit}）`
          : ` · ✗ 不再自动重试（${retry.exhausted.reason}）`;
      lines.push(
        `重试记录：${retry.retryKey} · 已自动重派 ${retry.attempts}/${retryLimit} 次${last}${next}`,
      );
    }
    for (const report of unread.slice(-10)) {
      const question = report.question === undefined ? "" : ` · 问题: ${report.question}`;
      lines.push(
        `未读 report：${report.planRef ?? report.worker} · note ${report.note} · ${report.outcome} · ${report.summary}${question}`,
      );
    }
    // 待确认的 note：真相仍在 notes.json，这里只做汇总（只读）。
    const waiting: string[] = [];
    try {
      for (const plan of activePlans(
        await listPlans(runtime.workspace(exec), runtime.domainRoot),
      )) {
        const document = await loadDocument(plan.directory, deps.settings().orchestrator);
        for (const note of document.notes) {
          if (note.status !== "waiting") continue;
          const needs = note.needs === undefined ? "" : `/${note.needs}`;
          waiting.push(`${planRefOf(plan)} · note ${note.id} [waiting${needs}] ${note.title}`);
        }
      }
    } catch {
      // 读不到 notes.json 时只给运行态摘要。
    }
    for (const line of waiting.slice(0, 10)) lines.push(`待确认：${line}`);
    if (state.interrupted !== undefined) {
      lines.push(`上次中断：${state.interrupted.at} · ${state.interrupted.reason}`);
      if (state.interrupted.notes.length > 0) {
        lines.push(`  可能悬空：${state.interrupted.notes.join(", ")}`);
      }
    }
    // 读过即已读：落一条 state.pulled，跨重启仍然成立。
    ledgerOf().append({
      type: "state.pulled",
      payload: { workers: live.length, reports: unread.length },
    });
    return {
      content: textBlocks(lines.join("\n")),
      details: {
        workers: live.length,
        unread: unread.length,
        waiting: waiting.length,
        seq: state.lastSeq,
        // 合并结论也进 details：汇报与测试不必去拆文本行。
        merged: live.flatMap((worker) =>
          worker.merged === undefined ? [] : [{ worker: worker.worker, ...worker.merged }],
        ),
        mergeBlocked: live.flatMap((worker) =>
          worker.mergeBlocked === undefined
            ? []
            : [{ worker: worker.worker, ...worker.mergeBlocked }],
        ),
        // 超时 / 重试也进 details：验收与测试不用拆文本。
        timeouts: live.flatMap((worker) =>
          worker.timeouts === 0
            ? []
            : [
                {
                  worker: worker.worker,
                  timeouts: worker.timeouts,
                  ...(worker.lastDiagnosis === undefined
                    ? {}
                    : {
                        cause: worker.lastDiagnosis.cause,
                        adjust: worker.lastDiagnosis.adjust,
                        confidence: worker.lastDiagnosis.confidence,
                      }),
                },
              ],
        ),
        retries: [...state.retries.values()],
      },
    };
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
   * 模式关闭时该恢复的活跃工具集合，三个来源取并集（全部排掉本插件的工具）：
   *
   * 1. 配置层默认集（`defaultTools` / `--tools` 语义）：唯一能救回**已经被收敛污染**的会话的
   *    来源 —— 那时运行时活跃集只剩六个，再快照毫无意义；
   * 2. 会话里的 `BASELINE_ENTRY`：保住启动时由别的开关打开的工具（`/toolkit` 的 web 工具），
   *    配置层看不到它们；
   * 3. 当前活跃集合：收敛期间被别的开关重新打开的工具不能丢。
   * @param ctx - 扩展上下文（读分支）。
   * @returns 待恢复的工具名，按上述顺序去重。
   */
  const restoreToolNames = (ctx: ExtensionContext): string[] => {
    const names: string[] = [];
    const push = (name: string): void => {
      if (ORCHESTRATOR_TOOL_SET.has(name) || names.includes(name)) return;
      names.push(name);
    };
    for (const name of configToolDefaults(pi)) push(name);
    for (const name of baselineEntryOf(branchOf(ctx)) ?? []) push(name);
    for (const name of pi.getActiveTools()) push(name);
    return names;
  };

  /**
   * 严格白名单：模式开 → 活跃工具就 `ORCHESTRATOR_TOOL_NAMES` 这六个（宿主的
   * `read` / `bash` / `edit` / `write` / web 全部收掉 —— 靠提示词自觉已被证伪）；
   * 模式关 → 恢复 `restoreToolNames`。
   *
   * 关模式只在**真收敛过**时动手：活跃集合里还有本插件的工具（它们注册时是
   * `defaultActive: false`，只有本插件会激活），或本进程收敛过。否则一律不动 —— 例如
   * `pi --tools grep` 起的新会话从没进过模式，不该被我们补上宿主默认工具。
   * @param ctx - 扩展上下文（读分支拿基线）。
   * @param enabled - 是否处于 Orchestrator 模式。
   */
  const setTools = (ctx: ExtensionContext, enabled: boolean): void => {
    const active = pi.getActiveTools();
    let next: string[];
    if (enabled) {
      next = [...ORCHESTRATOR_TOOL_NAMES];
    } else {
      if (!active.some((name) => ORCHESTRATOR_TOOL_SET.has(name))) return;
      next = restoreToolNames(ctx);
    }
    const unchanged =
      next.length === active.length && next.every((name, index) => name === active[index]);
    if (!unchanged) pi.setActiveTools(next);
  };

  const sync = (ctx: ExtensionContext): void => {
    const enabled = modeOn(ctx);
    setTools(ctx, enabled);
    // 侧边栏跟着模式走：开且是 tui → 挂 overlay 与 1s 刷新；否则清定时器与 overlay。
    sidebar.sync(ctx, enabled);
  };

  /** 状态目录：崩溃凭据与 worker 会话索引落在这里。 */
  const stateDir = (): string => deps.stateDir?.() ?? stateDirectory(getAgentDir());

  /**
   * 事件账本与投影（进程内共享）：账本是运行态唯一的真相，句柄表只是它的缓存。
   *
   * 懒建：状态目录由 `deps.stateDir` 决定，测试可以给临时目录；`openLedger` /
   * `openProjection` 按目录共享，所以同进程的 worker 写 ack、编排方读摘要都是同一份。
   */
  const ledgerOf = (): ReturnType<typeof openLedger> => openLedger(stateDir());
  const projectionOf = (): Projection => openProjection(ledgerOf());

  /** 崩溃凭据的读写口（账本重放出来的）；只给编排方，worker 拿不到。 */
  const interrupted: InterruptedAccess = createInterruptedAccess(ledgerOf(), projectionOf());

  /**
   * 上一次记进会话的“当前 Plan”目录；用来避免每次工具调用都往会话里塞一条 entry。
   * 进程重启后从分支里重读，所以这里只是缓存。
   */
  let recordedPlanDirectory: string | undefined;

  /**
   * 记住“当前 Plan”：轮转的种子必须指名它，而这个事实只存在于会话里。
   *
   * 只在目录变了时追加一条（同一次会话里反复命中同一个 Plan 不该长出一条条重复 entry）。
   * @param plan - 刚解析成功的 Plan。
   */
  const rememberPlan = (plan: PlanRef): void => {
    if (plan.directory === recordedPlanDirectory) return;
    recordedPlanDirectory = plan.directory;
    try {
      pi.appendEntry(CURRENT_PLAN_ENTRY, { directory: plan.directory });
    } catch {
      // 会话正在关闭之类：记不住只是降级到“唯一的 active Plan”，不影响本次调用。
    }
  };

  const runtime = createToolRuntime({
    limits: () => deps.settings().orchestrator,
    domainRoot: DEFAULT_DOMAIN_ROOT,
    interrupted,
    onPlan: rememberPlan,
  });

  /** 进程内的 worker 句柄表（**投影的缓存**：只放 session 与句柄，运行态看账本）。 */
  const registry: WorkerRegistry = createRegistry();

  /**
   * TUI 侧边栏（纯界面）：只读 `plan.ts` / `store.ts` 与句柄表，不注册工具、不发起回合。
   * 定时器 `unref` 过，且跟着 `sync` 开关，所以模式关 / 退出 / reload 都不会留下东西。
   * 账本一有变化就刷新（同进程毫秒级），保留的定时器只是跨进程兜底。
   */
  const sidebar = createSidebar({
    registry,
    limits: () => deps.settings().orchestrator,
    events: { subscribe: (listener) => projectionOf().subscribe(listener) },
  });

  /** 编排方是否正在跑一轮；只影响推送落到哪条投递分支。 */
  let busy = false;

  /** 推送合并窗口（毫秒）：5 秒内的多条重要报告并成一条 digest（测试可注入 0）。 */
  const digestWindowMs = deps.digestWindowMs ?? 5_000;
  let digestLines: string[] = [];
  let digestTimer: ReturnType<typeof setTimeout> | undefined;

  /** 把积累的 digest 推给编排方（`triggerTurn` 开一轮；忙时排队）。 */
  const flushDigest = (): void => {
    if (digestTimer !== undefined) {
      clearTimeout(digestTimer);
      digestTimer = undefined;
    }
    if (digestLines.length === 0) return;
    const content = digestLines.join("\n");
    digestLines = [];
    try {
      pi.sendMessage(
        { customType: "orchestrator-important", content, display: true },
        busy ? { deliverAs: "followUp" } : { triggerTurn: true, deliverAs: "steer" },
      );
    } catch {
      // 会话正在关闭之类：丢一条提醒不影响账本（账本才是真相）。
    }
  };

  /**
   * 推一条**需要人知晓 / 确认**的消息；普通进展（`done`）不进这里。
   *
   * 5 秒窗口内的多条合并成一条 digest：同一轮里 note 的 report + 超时 + 放弃重试
   * 应该是一句话，而不是三条打断。注入失败不重试（账本里都有）。
   * @param kind - 事件种类，仅用于行首标记。
   * @param text - 一行正文。
   */
  const notifyImportant = (kind: string, text: string): void => {
    digestLines.push(`[${kind}] ${text}`);
    if (digestWindowMs <= 0) {
      flushDigest();
      return;
    }
    if (digestTimer !== undefined) return;
    digestTimer = setTimeout(flushDigest, digestWindowMs);
    digestTimer.unref?.();
  };

  /**
   * 把投影同步进句柄表（句柄表降级为缓存）。
   *
   * 侧栏读的是 `WorkerEntry`；它的 `lastReport` / `lastInput` / `inputs` 都从投影来，
   * 所以账本一更新，界面就跟着更新，不再依赖 worker 顺手改 note 状态。
   */
  const syncRegistry = (): void => {
    const state = projectionOf().state();
    for (const entry of registry.list()) {
      const worker = state.workers.get(entry.planDirectory);
      if (worker === undefined) continue;
      if (worker.lastReport !== undefined) {
        entry.lastReport = {
          outcome: worker.lastReport.outcome,
          note: worker.lastReport.note,
          summary: worker.lastReport.summary,
          ...(worker.lastReport.question === undefined
            ? {}
            : { question: worker.lastReport.question }),
          ...(worker.lastReport.evidence === undefined
            ? {}
            : { evidence: worker.lastReport.evidence }),
          plan: entry.planDirectory,
          at: worker.lastReport.at,
        };
      }
      if (worker.lastInput !== undefined) {
        entry.lastInput = {
          kind: worker.lastInput.kind,
          delivery: worker.lastInput.delivery,
          text: worker.lastInput.text,
          at: Date.parse(worker.lastInput.at),
        };
      }
    }
  };
  projectionOf().subscribe(syncRegistry);

  /**
   * 一个 worker 的“最后进展”时刻：只认账本里的 ack（`input.consumed`）与 `report.filed`，
   * 派工时刻只当起点。判活与记里都得是同一个数，否则“为什么判它超时”说不清。
   */
  const lastProgressOf = (entry: WorkerEntry, worker: ProjectedWorker | undefined): number => {
    const started = entry.job?.startedAt ?? entry.startedAt;
    const fromLedger = worker === undefined ? 0 : progressAtOf(worker);
    return Math.max(started, fromLedger);
  };

  /**
   * 卡死检测（纯代码，扫投影）：中止 worker、摘句柄、落 `timeout` 与 `worker.exit`，
   * 然后把现场交给「诊断 → 重试」。
   *
   * 唯一判据：距最后进展超过 `workerTimeoutMs`。进展 = `input.consumed` / `report.filed`，
   * 所以“输入推给了它但一直没被消费”和“干到一半没了”都会纳进来：两者都同样意味着
   * 账本里久了没有任何属于它的活迹。`softStallMs` 只影响 `state` 的 ⚠ 标记，不杀。
   *
   * 不看模型回合：定时器自己扫。只对一个 job 生效一次（`job.notified`），**不代写 note 状态**。
   */
  const timeoutWorker = (entry: WorkerEntry, job: WorkerJob, elapsedMs: number): void => {
    if (entry.job !== job || job.notified) return;
    job.notified = true;
    const threshold = deps.settings().orchestrator.workerTimeoutMs;
    const key = entry.planDirectory;
    const projected = projectionOf().state().workers.get(key);
    const lastProgressAt = new Date(lastProgressOf(entry, projected)).toISOString();
    const lastReport = projected?.lastReport;
    /** 句柄摘掉后仍要用的现场（诊断证据包与重派都靠它）。 */
    const scene: Omit<TimedOutWorker, "timeoutSeq"> = {
      key,
      planRef: entry.planRef,
      kind: entry.kind ?? "plan",
      notes: entry.notes ?? [],
      ...(job.note === undefined ? {} : { note: job.note }),
      ...(entry.sessionPath === undefined ? {} : { sessionPath: entry.sessionPath }),
      cwd: entry.cwd ?? entry.worktree?.directory ?? entry.workspace ?? process.cwd(),
      workspace: entry.workspace ?? process.cwd(),
      ...(entry.plan === undefined ? {} : { plan: entry.plan }),
      ...(entry.worktree === undefined ? {} : { worktree: entry.worktree }),
      ...(lastReport === undefined
        ? {}
        : {
            lastReport: {
              note: lastReport.note,
              outcome: lastReport.outcome,
              summary: lastReport.summary,
            },
          }),
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      lastProgressAt,
    };
    void (async () => {
      try {
        await entry.session.abort();
      } catch {
        // 已经结束的 session 会拒绝 abort；收尾时忽略。
      }
      await disposeEntry(entry);
      registry.remove(key);
      // 中止即作废：这个键（plan/组或 temp id）不再复用那时的上下文，重启也不复活。
      markWorkerSessionAborted(stateDir(), key, "timeout");
      const timeoutEvent = ledgerOf().append({
        type: "timeout",
        payload: {
          worker: key,
          lastProgressAt,
          threshold,
          ...(lastReport === undefined
            ? {}
            : {
                lastReport: {
                  note: lastReport.note,
                  outcome: lastReport.outcome,
                  summary: lastReport.summary,
                },
              }),
          elapsedMs: scene.elapsedMs,
        },
      });
      ledgerOf().append({
        type: "worker.exit",
        payload: { worker: key, reason: "timeout" },
      });
      notifyImportant(
        "timeout",
        `[worker] 超时：${entry.planRef} ${Math.round(elapsedMs / 60_000)} 分钟没有进展，已中止（note 状态未改动）。`,
      );
      await diagnoseTimeout({ ...scene, timeoutSeq: timeoutEvent.seq });
    })();
  };

  /**
   * 扫一遍投影，把该超时的 worker 摘掉。
   *
   * 间隔跟着阈值缩放（小额阈值用于测试，真实 30 分钟阈值下就是 1s 一次），`unref` 过，
   * 不阻止进程退出。
   */
  const scanTimeouts = (): void => {
    if (registry.size() === 0) return;
    const settings = deps.settings().orchestrator;
    const state = projectionOf().state();
    const now = Date.now();
    for (const entry of registry.list()) {
      const job = entry.job;
      if (job === undefined) continue;
      const idleMs = now - lastProgressOf(entry, state.workers.get(entry.planDirectory));
      if (idleMs >= settings.workerTimeoutMs) timeoutWorker(entry, job, idleMs);
    }
    maybeCompact();
  };

  /** 压缩的节流：最多每分钟检查一次（`compactLedger` 自己看条数门槛）。 */
  let compacting = false;
  let lastCompactAt = 0;
  const maybeCompact = (): void => {
    if (compacting || Date.now() - lastCompactAt < 60_000) return;
    lastCompactAt = Date.now();
    if (ledgerOf().events().length <= COMPACT_THRESHOLD) return;
    compacting = true;
    void compactLedger(ledgerOf()).finally(() => {
      compacting = false;
    });
  };

  let scanTimer: ReturnType<typeof setInterval> | undefined;
  const startScan = (): void => {
    if (scanTimer !== undefined) return;
    const { workerTimeoutMs } = deps.settings().orchestrator;
    // 跟着阈值缩放：真实配置下就是 1s 一次，测试的小阈值下不会漏检。
    const interval = Math.max(5, Math.min(1_000, Math.floor(workerTimeoutMs / 8)));
    scanTimer = setInterval(scanTimeouts, interval);
    scanTimer.unref?.();
  };
  const stopScan = (): void => {
    if (scanTimer === undefined) return;
    clearInterval(scanTimer);
    scanTimer = undefined;
  };

  /**
   * worker 上报的落点：**只落账本**，不再注入编排方会话。
   *
   * 续期 watchdog 的语义保留：账本里出现一条 report 就算有进展，所以超时定时器重设。
   * report 只是通知，磁盘上的 notes 才是业务事实。
   */
  const onReport = (report: WorkerReport): void => {
    const directory = report.plan;
    let matched: WorkerEntry | undefined;
    if (directory !== undefined) {
      // 路由：先找包含该 note 的组，再退到 Plan 级条目，最后试临时 worker 的键。
      matched =
        (report.worker === undefined ? undefined : registry.get(report.worker)) ??
        findByNote(registry, directory, report.note) ??
        registry.get(entryKeyOf(directory)) ??
        registry.get(directory);
      if (matched !== undefined) matched.lastReport = report;
    }
    ledgerOf().append({
      type: "report.filed",
      payload: {
        worker: matched?.planDirectory ?? directory ?? report.note,
        note: report.note,
        outcome: report.outcome,
        summary: clipText(report.summary),
        ...(report.question === undefined ? {} : { question: clipText(report.question) }),
        ...(report.evidence === undefined ? {} : { evidence: [...report.evidence] }),
        // 超限时留“当时写了多长”，但不存全文：长内容应在 note 的 evidence 里。
        ...(report.summaryTruncated === true
          ? { summaryTruncated: true, summaryLength: report.summaryLength ?? report.summary.length }
          : {}),
      },
    });
    // 普通 done 不推送：它在账本里，需要时用 orchestrator_state 拉。
    if (IMPORTANT_OUTCOMES.has(report.outcome)) {
      const where = matched?.planRef ?? directory ?? report.note;
      const question = report.question === undefined ? "" : ` · 问题：${clipText(report.question)}`;
      notifyImportant(
        report.outcome,
        `${where} · note ${report.note}: ${clipText(report.summary)}${question}`,
      );
    }
  };

  /** 出事那条 note 的文档（诊断要用状态与正文摘要）；读不到就不带。 */
  const noteForDiagnosis = async (
    scene: TimedOutWorker,
  ): Promise<
    | {
        id: string;
        title: string;
        status: string;
        needs?: string;
        content: string;
      }
    | undefined
  > => {
    if (scene.plan === undefined || scene.note === undefined) return undefined;
    try {
      const document = await loadDocument(scene.plan.directory, deps.settings().orchestrator);
      return document.notes.find((note) => note.id === scene.note);
    } catch {
      return undefined;
    }
  };

  /**
   * 起一个只读诊断 worker，拿回它的 report。
   *
   * 它是 `depth 1` 的临时会话（只有 `orchestrator_read` + `orchestrator_report`，**没有**
   * `dispatch`），不落盘、跑完即弃；自己也有兑底超时，不给一个坏掉的诊断无限期占着。
   * @param pack - 代码组装的证据包。
   * @param cwd - 诊断会话的 cwd（与出事的 worker 一致）。
   * @returns report 与可能的错误。
   */
  const runDiagnosis = async (
    pack: TimeoutEvidencePack,
    cwd: string,
  ): Promise<{ reports: WorkerReport[]; error?: string }> => {
    const reports: WorkerReport[] = [];
    let spawned: SpawnedWorker;
    try {
      spawned = await (deps.spawn ?? spawnWorker)({
        temp: `diag-${Date.now().toString(36)}`,
        depth: 1,
        cwd,
        settings: deps.settings,
        report: (report) => {
          reports.push(report);
        },
        released: () => false,
      });
    } catch (error) {
      return {
        reports,
        error: `诊断会话起不来：${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const timeoutMs = Math.min(deps.settings().orchestrator.workerTimeoutMs, DIAGNOSIS_TIMEOUT_MS);
    let error: string | undefined;
    try {
      await Promise.race([
        spawned.session.prompt(diagnosisPrompt(pack)),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeoutMs);
          timer.unref?.();
        }),
      ]);
    } catch (cause) {
      error = `诊断会话失败：${cause instanceof Error ? cause.message : String(cause)}`;
    } finally {
      try {
        spawned.dispose();
      } catch {
        // 已经收掉：忽略。
      }
    }
    return { reports, ...(error === undefined ? {} : { error }) };
  };

  /**
   * 起一代 worker 并接上句柄、账本与看门狗。
   *
   * 三处需要它：正常派工之外的**重派**（超时诊断之后）与**恢复**（孤儿 resume）。正常派工走
   * `orchestrator_command` 的参数解析（要处理 worktree / 组 / 幂等），这两条路不需要 —— 现场
   * 已经在手里，参数只会多一处能和派工侧走偏的地方。
   * @param input - 这一代的全部现场与消息。
   */
  const startWorkerGeneration = async (input: {
    readonly key: string;
    readonly planRef: string;
    readonly plan?: PlanRef;
    readonly notes: readonly string[];
    readonly note?: string;
    readonly cwd: string;
    readonly workspace: string;
    readonly worktree?: {
      readonly name: string;
      readonly directory: string;
      readonly branch: string;
    };
    readonly sessionKey: string;
    readonly message: string;
    /** 额外写进 `worker.spawned` 的字段（`retryOf` / `resumedOf`）。 */
    readonly spawnedExtra?: Record<string, unknown>;
  }): Promise<void> => {
    const base = {
      cwd: input.cwd,
      settings: deps.settings,
      report: onReport,
      released: (noteId: string) =>
        input.plan === undefined ? false : projectionOf().isReleased(input.plan.directory, noteId),
      workerKey: input.key,
      sessionKey: input.sessionKey,
    };
    const spawned = await (deps.spawn ?? spawnWorker)(
      input.plan === undefined
        ? { ...base, temp: input.key.replace(/^temp:/u, "") }
        : { ...base, plan: input.plan },
    );
    rememberWorkerSession(stateDir(), input.sessionKey, spawned.sessionPath ?? "");
    const entry = registry.add({
      planDirectory: input.key,
      planRef: input.planRef,
      ...(input.plan === undefined ? { kind: "temp" as const } : {}),
      ...(input.notes.length === 0 ? {} : { notes: input.notes }),
      ...(spawned.sessionPath === undefined ? {} : { sessionPath: spawned.sessionPath }),
      cwd: input.cwd,
      workspace: input.workspace,
      ...(input.plan === undefined ? {} : { plan: input.plan }),
      ...(input.worktree === undefined ? {} : { worktree: input.worktree }),
      startedAt: Date.now(),
      session: spawned.session,
    });
    ledgerOf().append({
      type: "worker.spawned",
      payload: {
        worker: input.key,
        planRef: input.planRef,
        kind: input.plan === undefined ? "temp" : "plan",
        ...(input.notes.length === 0 ? {} : { notes: input.notes }),
        ...(spawned.sessionPath === undefined ? {} : { sessionPath: spawned.sessionPath }),
        sessionKey: input.sessionKey,
        resumed: spawned.resumed,
        startedAt: new Date().toISOString(),
        ...input.spawnedExtra,
        ...(input.worktree === undefined
          ? {}
          : {
              worktree: {
                name: input.worktree.name,
                branch: input.worktree.branch,
                directory: input.worktree.directory,
              },
            }),
      },
    });
    const delivery = deliver(entry, "message", input.message, input.note, "steer");
    const now = Date.now();
    const job: WorkerJob = {
      kind: "message",
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.notes.length === 0 ? {} : { notes: input.notes }),
      startedAt: now,
      progressAt: now,
      settled: delivery.settled,
      notified: false,
    };
    entry.job = job;
    ledgerOf().append({
      type: "input.sent",
      payload: {
        worker: input.key,
        planRef: input.planRef,
        kind: "message",
        delivery: "steer",
        delivered: delivery.delivered,
        text: clipText(input.message),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.notes.length === 0 ? {} : { notes: input.notes }),
      },
    });
    const done = (): void => {
      const harvested = harvest(entry, job);
      if (harvested && entry.job === undefined) {
        void mergeWorktreeOf({ entry, workspace: input.workspace, deps, ledgerOf });
      }
    };
    void delivery.settled.then(done, done);
  };

  /**
   * 重派下一代 worker：同一个键，新一代会话（不复用被中止的上下文）。
   * @param scene - 超时现场。
   * @param diagnosis - 诊断结论（重试消息的口径）。
   * @param attempt - 第几次重试（1 起）。
   * @param retryLimit - 上限（写进消息，模型看得见还剩几次）。
   */
  const redispatchWorker = async (
    scene: TimedOutWorker,
    diagnosis: Diagnosis,
    attempt: number,
    retryLimit: number,
  ): Promise<void> => {
    // 作废登记已经把旧一代标掉了：会话键带作废时刻，于是这次是**新开**一份 jsonl。
    const aborted = abortedWorkerSession(stateDir(), scene.key);
    const sessionKey = aborted === undefined ? scene.key : `${scene.key}#${aborted.at}`;
    const message = buildRetryMessage({
      diagnosis,
      attempt,
      retryLimit,
      ...(scene.lastReport === undefined ? {} : { lastReport: scene.lastReport }),
      elapsedMinutes: Math.max(1, Math.round(scene.elapsedMs / 60_000)),
    });
    await startWorkerGeneration({
      key: scene.key,
      planRef: scene.planRef,
      ...(scene.plan === undefined ? {} : { plan: scene.plan }),
      notes: scene.notes,
      ...(scene.note === undefined ? {} : { note: scene.note }),
      cwd: scene.cwd,
      workspace: scene.workspace,
      ...(scene.worktree === undefined ? {} : { worktree: scene.worktree }),
      sessionKey,
      message,
      spawnedExtra: { retryOf: scene.timeoutSeq },
    });
  };

  const resumeOrphans = async (
    target: string | undefined,
    workspace: string,
  ): Promise<{ content: ReturnType<typeof textBlocks>; details: Record<string, unknown> }> => {
    // target 可以是展示引用（`<domain>/<lifecycle>/<name>`）、目录或 worker 键。
    let targetDirectory: string | undefined;
    if (target !== undefined) {
      try {
        targetDirectory = (await resolvePlan(workspace, runtime.domainRoot, target)).directory;
      } catch {
        targetDirectory = undefined;
      }
    }
    const inScope = (worker: string, planRef: string): boolean => {
      if (target === undefined) return true;
      if (planRef === target || worker === target) return true;
      const directory = planDirectoryOf(worker);
      return directory === target || directory === targetDirectory;
    };
    const orphans = orphanWorkers(projectionOf().state(), ledgerOf().events(), (key) => {
      return registry.get(key) !== undefined;
    }).filter((orphan) => inScope(orphan.worker, orphan.planRef));
    if (orphans.length === 0) {
      return {
        content: textBlocks(
          "没有可恢复的孤儿 worker（进程内 session 都还在，或账本里没有未结束的派生）。",
        ),
        details: { resumed: [], lost: [] },
      };
    }
    const resumed: Array<{ worker: string; planRef: string; sessionPath?: string }> = [];
    const lost: Array<{ worker: string; planRef: string; reason: string }> = [];
    const lines: string[] = [];
    // 先父后子（orphanWorkers 按 depth 排过）：父恢复后子任务由父重建。
    for (const orphan of orphans) {
      if (orphan.depth > 0) {
        // 子 worker 的会话不落盘，代码没法替父重建它；落一条 exit 让 state 不再把它当活口。
        ledgerOf().append({
          type: "worker.exit",
          payload: {
            worker: orphan.worker,
            reason: "sub-lost: 子 worker 会话不落盘，父恢复后需重建",
            parent: orphan.worker.replace(/\/sub:\d+$/u, ""),
          },
        });
        lost.push({ worker: orphan.worker, planRef: orphan.planRef, reason: "子任务丢失" });
        continue;
      }
      const idem = `resume:${orphan.worker}:${orphan.anchor}`;
      if (ledgerOf().findByIdem(idem) !== undefined) {
        lines.push(`跳过（已恢复过这一代）：${orphan.planRef}`);
        continue;
      }
      let plan: PlanRef | undefined;
      if (orphan.kind === "plan") {
        try {
          plan = await resolvePlan(workspace, runtime.domainRoot, orphan.planRef);
        } catch (error) {
          lost.push({
            worker: orphan.worker,
            planRef: orphan.planRef,
            reason: `Plan 解析失败：${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
      }
      const sessionKey = orphan.sessionKey ?? orphan.worker;
      try {
        await startWorkerGeneration({
          key: orphan.worker,
          planRef: orphan.planRef,
          ...(plan === undefined ? {} : { plan }),
          notes: orphan.notes,
          // 有 worktree 就回到那个目录；否则回**主工作区**，不能是 plan 目录 ——
          // worker 的会话 cwd 就是 `runtime.workspace(exec)`，起在 plan 目录里会让它自己的
          // `orchestrator_read` / `write` / `check` 把 workspace 算成 plan 目录，认不出任何 Plan。
          cwd: orphan.worktree?.directory ?? workspace,
          workspace,
          ...(orphan.worktree === undefined ? {} : { worktree: orphan.worktree }),
          sessionKey,
          message:
            "继续上次未完成的工作。先 git status 核对工作区与 note 的执行检查点：能确定下一步就直接做，不确定就 blocked 上报。",
        });
      } catch (error) {
        lost.push({
          worker: orphan.worker,
          planRef: orphan.planRef,
          reason: `恢复失败：${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
      ledgerOf().append({
        type: "worker.resumed",
        idem,
        payload: {
          worker: orphan.worker,
          resumeOf: orphan.anchor,
          sessionKey,
          ...(orphan.sessionPath === undefined ? {} : { sessionPath: orphan.sessionPath }),
        },
      });
      resumed.push({
        worker: orphan.worker,
        planRef: orphan.planRef,
        ...(orphan.sessionPath === undefined ? {} : { sessionPath: orphan.sessionPath }),
      });
    }
    for (const item of resumed) lines.push(`已恢复：${item.planRef}（${item.worker}）`);
    for (const item of lost) lines.push(`未恢复：${item.planRef} · ${item.reason}`);
    lines.push("恢复用的是同一份 jsonl：接着上次的上下文跑，不重开一份会话。");
    return {
      content: textBlocks(lines.join("\n")),
      details: { resumed, lost, orphans: orphans.length },
    };
  };

  /**
   * 超时之后的自动化：组装证据 → 只读诊断 → 按建议重派（最多 `retryLimit` 次）。
   *
   * 三条路都不重试，而且都必须落账（`retry.exhausted`）：诊断不可解析、建议 `needs-human`、
   * 已到上限。临时 worker 没有 note，不诊断也不重派（不存在“同一条 note 重几次”）。
   * @param scene - 超时现场（含 timeout 事件 seq）。
   */
  const diagnoseTimeout = async (scene: TimedOutWorker): Promise<void> => {
    if (scene.kind === "temp") return;
    const retryLimit = deps.settings().orchestrator.retryLimit;
    const retryKey = scene.note ?? scene.notes[0] ?? scene.planRef;
    const attempts = projectionOf().state().retries.get(retryKey)?.attempts ?? 0;
    const note = await noteForDiagnosis(scene);
    const pack = buildTimeoutEvidence({
      worker: scene.key,
      planRef: scene.planRef,
      kind: scene.kind,
      ...(scene.note === undefined ? {} : { note: scene.note }),
      ...(scene.notes.length === 0 ? {} : { notes: scene.notes }),
      threshold: deps.settings().orchestrator.workerTimeoutMs,
      elapsedMs: scene.elapsedMs,
      lastProgressAt: scene.lastProgressAt,
      ...(scene.lastReport === undefined ? {} : { lastReport: scene.lastReport }),
      ...(note === undefined ? {} : { noteDocument: note }),
      events: ledgerOf().events(),
      ...(scene.sessionPath === undefined ? {} : { sessionPath: scene.sessionPath }),
      cwd: scene.cwd,
      ...(scene.worktree === undefined ? {} : { worktree: scene.worktree.name }),
    });
    const run = await runDiagnosis(pack, scene.cwd);
    const diagnosis = diagnosisFromReports(run.reports);
    ledgerOf().append({
      type: "timeout.diagnosed",
      payload: {
        worker: scene.key,
        retryKey,
        ...(scene.note === undefined ? {} : { note: scene.note }),
        cause: diagnosis?.cause ?? "诊断没有给出可解析的结论",
        adjust: diagnosis?.suggestion.adjust ?? [],
        ...(diagnosis === undefined || diagnosis.suggestion.retryMessage === ""
          ? {}
          : { retryMessage: diagnosis.suggestion.retryMessage }),
        confidence: diagnosis?.confidence ?? 0,
        parsed: diagnosis !== undefined,
        ...(run.error === undefined ? {} : { error: run.error }),
      },
    });
    const decision = decideRetry({ diagnosis, attempts, retryLimit });
    if (!decision.retry || diagnosis === undefined) {
      const reason = decision.retry ? "no-diagnosis" : decision.reason;
      ledgerOf().append({
        type: "retry.exhausted",
        payload: {
          worker: scene.key,
          retryKey,
          ...(scene.note === undefined ? {} : { note: scene.note }),
          attempts,
          reason,
        },
      });
      const why =
        reason === "needs-human"
          ? "诊断建议人工介入"
          : reason === "exhausted"
            ? `已自动重试 ${attempts} 次（上限 ${retryLimit}）`
            : "诊断没有给出可解析的结论";
      notifyImportant(
        "retry.exhausted",
        `${scene.planRef}${scene.note === undefined ? "" : ` · note ${scene.note}`}：${why}，不再自动重试。`,
      );
      return;
    }
    // 先记重派（幂等键 = retryKey + 第几次），再真的派：重放账本不会多派一代。
    ledgerOf().append({
      type: "retry.scheduled",
      idem: `retry:${retryKey}:${decision.attempt}`,
      payload: {
        worker: scene.key,
        retryKey,
        ...(scene.note === undefined ? {} : { note: scene.note }),
        attempt: decision.attempt,
        cause: diagnosis.cause,
        adjust: [...diagnosis.suggestion.adjust],
        timeoutSeq: scene.timeoutSeq,
      },
    });
    try {
      await redispatchWorker(scene, diagnosis, decision.attempt, retryLimit);
    } catch (error) {
      ledgerOf().append({
        type: "retry.exhausted",
        payload: {
          worker: scene.key,
          retryKey,
          ...(scene.note === undefined ? {} : { note: scene.note }),
          attempts: decision.attempt,
          reason: `spawn-failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
      notifyImportant(
        "retry.exhausted",
        `${scene.planRef}：自动重派失败（${error instanceof Error ? error.message : String(error)}），转人工。`,
      );
    }
  };

  for (const tool of [
    createReadTool(runtime),
    createWriteTool(runtime),
    createCheckTool(runtime),
    createAskQuestionsTool(),
    createCommandTool(runtime, registry, deps, stateDir, ledgerOf, projectionOf, onReport),
    createStateTool(runtime, registry, deps, stateDir, ledgerOf, projectionOf, resumeOrphans),
  ]) {
    pi.registerTool({ ...tool, defaultActive: false });
  }

  // 卡死检测是纯代码的定时器：注册即跑，空表时立刻返回（没有 worker 就没有工作）。
  startScan();

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
    // 首启迁移：账本还空着就把旧的运行态（notes 状态 / 未送达 report / 崩溃凭据）并进
    // 一条初始 snapshot，然后删掉旧文件。已有账本时它是空操作。
    void migrateLedger({
      stateDir: stateDir(),
      workspace: mainWorkspaceOf(ctx.cwd),
      domainRoot: DEFAULT_DOMAIN_ROOT,
      limits: deps.settings().orchestrator,
    });
    // 首次进入本会话就把启动活跃集记进分支：reload / 恢复会话会重现上次的装载（pi 把工具装载
    // 记进 transcript），收敛之后再取就只剩六个。已被污染且没有记录的老会话里，这里记下的虽然
    // 也是六个，但 `restoreToolNames` 会把它滤掉并用配置层默认集兜底。
    if (baselineEntryOf(branchOf(ctx)) === undefined) {
      pi.appendEntry(BASELINE_ENTRY, { names: pi.getActiveTools() });
    }
    if (
      deps.settings().tools.orchestrator &&
      pi.getFlag("orchestrator") === true &&
      sessionModeOf(branchOf(ctx)) === undefined
    ) {
      pi.appendEntry(MODE_ENTRY, { enabled: true });
    }
    sync(ctx);
  };

  /**
   * 会话结束 / 崩溃时把 worker 记成 `worker.suspended`（**不是** `worker.exit`）。
   *
   * 两者的区别就是能不能恢复：jsonl 还在盘上，`orchestrator_state op=resume` 能拿同一份会话
   * 接着跑；`worker.exit` 只留给 abort / 超时这种“会话已作废”的真结束。
   *
   * 同时把「哪条 note 会被留在 `in_progress`」记进凭据：worker 随会话退出而消失，note 却还停在
   * `in_progress`，没有这条记录下次只看到一条悬空的 note。这里**只记录不改状态**，改状态是人的
   * 决定；凭据由 `orchestrator_state` / `resume` 展示后被移除。
   * @param reason - 写进凭据的原因。
   */
  const recordInterruptedNotes = async (reason: string): Promise<void> => {
    const entries = registry.list();
    if (entries.length === 0) return;
    for (const entry of entries) {
      const notes: string[] = [];
      if (entry.kind !== "temp") {
        try {
          const document = await loadDocument(
            planDirectoryOf(entry.planDirectory),
            deps.settings().orchestrator,
          );
          for (const note of document.notes) {
            if (note.status !== "in_progress") continue;
            notes.push(`${entry.planRef} · note ${note.id}`);
          }
        } catch {
          // 读不到 notes.json 时只留 plan 记录；凭据本身不能因此不落盘。
        }
      }
      try {
        ledgerOf().append({
          type: "worker.suspended",
          payload: {
            worker: entry.planDirectory,
            reason,
            ...(notes.length === 0 ? {} : { notes }),
          },
        });
      } catch {
        // 会话正在退出，落盘失败没有更好的选择。
      }
    }
  };

  // 进程级兜底：把 live worker 记成 `worker.suspended`（崩溃也能靠 jsonl 恢复）后干净退出。
  installCrashGuard({
    record: (reason) => {
      for (const entry of registry.list()) {
        try {
          ledgerOf().append({
            type: "worker.suspended",
            payload: { worker: entry.planDirectory, reason },
          });
        } catch {
          // 崩溃路径上落不了盘也没有更好的选择。
        }
      }
    },
  });

  // 退出收尾：先留痕再把 worker 全摘掉，避免“worker 静默消失、note 悬空”。
  pi.on("session_shutdown", async () => {
    sidebar.dispose();
    stopScan();
    flushDigest();
    await recordInterruptedNotes(
      "session_shutdown: worker 随会话退出（jsonl 还在，可 resume），相关 note 可能停在 in_progress",
    );
    await disposeAll(registry);
    closeProjection(stateDir());
    closeLedger(stateDir());
  });

  pi.on("agent_start", () => {
    busy = true;
  });

  // 一轮结束就空闲了。
  pi.on("agent_settled", () => {
    busy = false;
  });

  pi.on("session_tree", (_event, ctx) => {
    sync(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    // 工具面在每次请求前按当前模式对齐一次：模式开 → 收敛，模式关 → 恢复。这一步放在
    // 早退之前，所以「关掉模式却还停在收敛集合」不会被 `before_agent_start` 的早退掩盖 ——
    // 任何没走到 `sync` 的路径（宿主不重放 `session_start` 的 reload、恢复会话等）都会在
    // 下一轮请求之前被这次对齐纠正。模式关时它同样幂等：没进过模式的会话原样不动。
    sync(ctx);
    busy = true;
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
    // 种子不按 active 数量猜：会话锁定值（本会话最后一次命中的 Plan）优先。
    const current = currentPlanOf(branchOf(ctx)) ?? recordedPlanDirectory;
    type Message = (typeof event.messages)[number];
    const kept = event.messages.filter((message) => {
      const timestamp = (message as { timestamp?: unknown }).timestamp;
      return typeof timestamp === "number" && timestamp >= at;
    });
    const seed = {
      role: "user",
      content: [
        {
          type: "text",
          text: await buildSeed(mainWorkspaceOf(ctx.cwd), DEFAULT_DOMAIN_ROOT, current),
        },
      ],
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
    const workspace = mainWorkspaceOf(ctx.cwd);
    const plans = activePlans(await listPlans(workspace, DEFAULT_DOMAIN_ROOT));
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
      if (crashed.notes.length > 0) {
        lines.push(`  可能悬空: ${crashed.notes.join(", ")}`);
      }
      interrupted.clear();
    }
    const unsent = projectionOf()
      .state()
      .reports.filter((report) => !report.read).length;
    const live = [...projectionOf().state().workers.values()].filter(
      (worker) => worker.status === "live",
    ).length;
    lines.push(
      `账本: seq ${projectionOf().state().lastSeq} · live ${live} · 未读 report ${unsent}（用 orchestrator_state 拉摘要）`,
    );
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
