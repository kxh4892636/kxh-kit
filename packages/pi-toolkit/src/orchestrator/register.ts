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
import { existsSync } from "node:fs";
import { join } from "node:path";
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
  groupKeyOf,
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
  type OrphanWorker,
  type ProjectedWorker,
  type ProjectedWorktree,
  type Projection,
} from "./projection.ts";
import { nextTempSeq, rememberWorkerSession } from "./worker-sessions.ts";
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
  worktreeDomainCopies,
  type PlanRef,
} from "./plan.ts";
import { pickMode } from "./selector.ts";
import { createSidebar } from "./sidebar.ts";
import {
  DEFAULT_WORKTREE_HOOKS,
  groupWorktreeName,
  listWorktrees,
  WORKTREE_ROOT,
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

/**
 * 现场行的状态文字：`created` 还要跟磁盘再核一次。
 *
 * 账本只是“发生过什么”，磁盘才是“现在有什么”：手工 `git worktree remove` / `rm -rf`
 * 不会留下 `worktree.removed`，只照账本说「存在」就是假象（真机 `note-49` / `note-50`
 * 就是这样）。所以：
 * - `created` + 目录在 → 「存在」（可复用）；
 * - `created` + 目录没了 → 「已消失（无事件）」：账本没有 `removed` 这条事实就不写它，
 *   也不为对齐补一条事件（事件只由真实动作产生），但该组现场**不复用**；
 * - `merged` / `removed` 照账本（磁盘残留另由 `leftover` 标 ✗）。
 * @param site - 账本投影出来的现场。
 * @param onDisk - 磁盘上现存的现场名字（`sitesOnDisk` 的结果）。
 * @returns 给人看的状态文字。
 */
const sitePhaseLabel = (site: ProjectedWorktree, onDisk: ReadonlySet<string>): string => {
  if (site.phase === "created") return onDisk.has(site.key) ? "存在" : "已消失（无事件）";
  if (site.phase === "merged") {
    return `已合并${site.commit === undefined ? "" : ` ${site.commit.slice(0, 8)}`}`;
  }
  return `已回收${site.reason === undefined ? "" : `（${site.reason}）`}`;
};

/**
 * `state` 的现场段：账本投影 + 磁盘校验。
 *
 * 账本里有的逐行渲染（`created` 再核磁盘）；磁盘上有、账本里没有的单独标「未登记现场」——
 * 手建 / 旧版本残留同样不能当某组的现场。
 * @param sites - 账本里的现场（调用方已按时间升序）。
 * @param onDisk - 磁盘上现存的现场名字（`sitesOnDisk` 的结果）。
 * @returns 渲染行；一个现场都没有时为空数组。
 */
const siteLines = (sites: readonly ProjectedWorktree[], onDisk: ReadonlySet<string>): string[] => {
  const registered = new Set(sites.map((site) => site.key));
  const unregistered = [...onDisk].filter((name) => !registered.has(name)).sort();
  if (sites.length === 0 && unregistered.length === 0) return [];
  const lines = [`现场（${sites.length + unregistered.length}，一个组一个）:`];
  for (const name of unregistered) lines.push(`${WORKTREE_ROOT}/${name} · 未登记现场（疑似手建）`);
  for (const site of sites.slice(-10)) {
    const install = site.installMs === undefined ? "" : ` · 依赖 ${site.installMs}ms`;
    const owner = site.worker === undefined ? "" : ` · ${site.worker}`;
    // 目录没删干净：不能当已回收（人工删之前同组再派会落回一个假现场）。
    const leftover =
      site.leftover === undefined
        ? ""
        : ` · ✗ 现场残留：${site.leftover.reason}（手动删 ${site.directory}）`;
    lines.push(
      `${site.key} · ${site.branch} · ${sitePhaseLabel(site, onDisk)}${install}${owner}${leftover}`,
    );
  }
  return lines;
};

/**
 * 磁盘上的现场（`.worktrees/` 下的目录名）。
 *
 * `state` 的现场行与派工的复用判断**共用这一份结论**：只有“账本说 `created` 且目录还在”
 * 才复用现场，否则按新建走（重新建目录 + 装依赖 + 落新的 `worktree.created`）。
 * @param deps - 工具依赖（`worktree` 可注入，默认真查盘）。
 * @param workspace - 主工作区根。
 * @returns 目录名集合。
 */
const sitesOnDisk = async (deps: OrchestratorDeps, workspace: string): Promise<Set<string>> => {
  const hooks = deps.worktree ?? DEFAULT_WORKTREE_HOOKS;
  const names =
    hooks.list === undefined ? await listWorktrees({ workspace }) : await hooks.list({ workspace });
  return new Set(names);
};

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
 * 推送并开回合的上报结果。
 *
 * `done` 也在里面：临时 worker 没有 Plan，唯一交付就是那份 `done` 报告，不推就等于让它
 * 的结论永远静默（note 48 实证：两个只读临时 worker 跑完而编排方没被叫醒）。批量派工
 * 的成本由 5 秒 digest 合并兼顾。
 */
const IMPORTANT_OUTCOMES: ReadonlySet<string> = new Set([
  "done",
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
 * 让一代 worker 收工：落 `worker.exit`、摘句柄、dispose。
 *
 * 两种情形用它：临时 worker 终态（`settled`），组完成后现场已回收（`merged`）——
 * 后者的 cwd 已经不在了，继续留着句柄只会让下一次投递落在死目录里。
 * @param input - 句柄表、账本、目标 worker 与原因。
 */
const retireWorker = (input: {
  readonly registry: WorkerRegistry;
  readonly ledgerOf: () => ReturnType<typeof openLedger>;
  readonly entry: WorkerEntry;
  readonly reason: string;
}): void => {
  const { entry } = input;
  if (input.registry.get(entry.planDirectory) !== entry) return;
  input.ledgerOf().append({
    type: "worker.exit",
    payload: { worker: entry.planDirectory, reason: input.reason },
  });
  input.registry.remove(entry.planDirectory);
  void disposeEntry(entry);
};

/**
 * 组内 note 是否全部 completed（真相在 `notes.json`）。
 *
 * 现场属于**组**：只有整组干完才回收，否则下一代 worker（rework / 追加 / 重派）还要用它。
 * @param input - 目标组：Plan 与组内 note。
 * @param deps - 设置读取器。
 * @returns 组内每条 note 都 completed 返回 true；读不到文档 / 没有组 / 有未完成的返回 false。
 */
const groupCompleted = async (
  input: { readonly plan: PlanRef; readonly notes: readonly string[] },
  deps: OrchestratorDeps,
): Promise<boolean> => {
  if (input.notes.length === 0) return false;
  try {
    const document = await loadDocument(input.plan.directory, deps.settings().orchestrator);
    return input.notes.every(
      (id) => document.notes.find((note) => note.id === id)?.status === "completed",
    );
  } catch {
    return false;
  }
};

/**
 * 这个孤儿所属的组是否已经收口（组内 note 全部 completed）。
 *
 * 收口的组现场已被 `recycleGroup` 删掉（`worktree.removed`），再恢复只会得到一个 cwd 指向
 * **不存在目录**的 worker（note 54 的真机现场）：不 spawn、不建现场、不落 `worker.resumed`。
 * `session_start` 自动恢复与显式 `op=resume` 共用这一判据（`state` 的可恢复清单同源），
 * 三处口径才不会走偏。临时 worker / 子 worker / 没有组的孤儿没有“组完成”这回事。
 * @param input - 孤儿、主工作区根、领域根与设置读取器。
 * @returns 组内每条 note 都 completed 返回 true；其余情况（含 Plan 解析失败）false。
 */
const orphanGroupClosed = async (input: {
  readonly orphan: OrphanWorker;
  readonly workspace: string;
  readonly domainRoot: string;
  readonly deps: OrchestratorDeps;
}): Promise<boolean> => {
  const { orphan } = input;
  if (orphan.depth > 0 || orphan.kind !== "plan" || orphan.notes.length === 0) return false;
  try {
    const plan = await resolvePlan(input.workspace, input.domainRoot, orphan.planRef);
    return await groupCompleted({ plan, notes: orphan.notes }, input.deps);
  } catch {
    // Plan 解析失败不在这里吞掉：照旧走恢复路径，让它落一条“Plan 解析失败”。
    return false;
  }
};

/** 一条 note 所属的组：成员、路由键与现场（`entry` 只在句柄还活着时给）。 */
interface GroupOfNote {
  readonly plan: PlanRef;
  readonly notes: readonly string[];
  readonly worker: string;
  readonly site: { readonly name: string; readonly branch: string; readonly directory: string };
  readonly entry?: WorkerEntry;
}

/** 一次回收的结论：跳过（不满足条件或已经回收过）/ 合并成功 / 现场残留 / 不能 ff-only。 */
type RecycleOutcome =
  | { readonly status: "skipped"; readonly reason: string }
  | { readonly status: "merged"; readonly commit?: string; readonly cleanup?: string }
  | {
      readonly status: "leftover";
      readonly reason: string;
      readonly directory: string;
      readonly commit?: string;
    }
  | { readonly status: "blocked"; readonly reason: string; readonly directory: string };

/**
 * 进程内正在回收的组（`<plan 目录>::<组键>`）。
 *
 * `complete` 与 worker settle 可能同时对同一组触发回收：互斥让第二次直接跳过，
 * 不会连着合并同一条分支、连着落两条 `worktree.merged`。
 */
const recycling = new Set<string>();

/**
 * 组内 note 全 completed 后回收现场：`--ff-only` 合并回主工作区（代码执行，不经模型）。
 *
 * 为什么不让编排方派一条“回收指令”：合并是收工信号的最后一跳，再排一个 LLM 回合去
 * 跑两条 git 命令既慢又容易忘。这里只在主分支能 fast-forward 时合并 —— 分叉的现场
 * （目录 + 分支）一律保留并落一条 error（`worker.merge_blocked`），等人工处理。
 *
 * **两个入口共用这一份实现**：worker settle（`finishGroupOf`）与编排方 `complete`
 * （`recycleAfterComplete`）—— 后者才是真机上唯一走过的那条（note 53）。
 *
 * 账本：成功 `worktree.merged` + `worktree.removed`，失败 `worker.merge_blocked`。
 * @param input - 组（Plan + notes + 现场）与主工作区、依赖、账本。
 * @returns 回收结论；调用方据此摘句柄、拼返回值。
 */
const recycleGroup = async (input: {
  readonly workspace: string;
  readonly deps: OrchestratorDeps;
  readonly ledgerOf: () => ReturnType<typeof openLedger>;
  readonly plan: PlanRef;
  readonly notes: readonly string[];
  /** 落账用的路由键（组的句柄键）。 */
  readonly worker: string;
  readonly site: { readonly name: string; readonly branch: string; readonly directory: string };
}): Promise<RecycleOutcome> => {
  const lock = `${input.plan.directory}::${input.site.name}`;
  if (recycling.has(lock)) return { status: "skipped", reason: "回收进行中" };
  recycling.add(lock);
  try {
    if (!(await groupCompleted({ plan: input.plan, notes: input.notes }, input.deps))) {
      return { status: "skipped", reason: "组内还有未完成的 note" };
    }
    const hooks = input.deps.worktree ?? DEFAULT_WORKTREE_HOOKS;
    let outcome: MergeOutcome;
    try {
      outcome = await hooks.merge({
        workspace: input.workspace,
        name: input.site.name,
        branch: input.site.branch,
      });
    } catch (error) {
      // 钩子自己抛错也要落账：合并失败不能变成一条未处理拒绕。
      outcome = {
        merged: false,
        branch: input.site.branch,
        directory: input.site.directory,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    if (!outcome.merged) {
      const reason = outcome.reason ?? "未知原因";
      input.ledgerOf().append({
        type: "worker.merge_blocked",
        payload: {
          worker: input.worker,
          worktree: input.site.name,
          branch: input.site.branch,
          directory: outcome.directory,
          reason,
        },
      });
      return { status: "blocked", reason, directory: outcome.directory };
    }
    input.ledgerOf().append({
      type: "worktree.merged",
      payload: {
        key: input.site.name,
        branch: input.site.branch,
        worker: input.worker,
        ...(outcome.commit === undefined ? {} : { commit: outcome.commit }),
        ...(outcome.cleanup === undefined ? {} : { cleanup: outcome.cleanup }),
      },
    });
    // 只有目录**真的**不存在才落 `worktree.removed`：`git worktree remove` 不删未跟踪文件
    // （`node_modules/`、空壳目录），账本谎报“已回收”会让“同组再派要不要重建”判错。
    const gone = outcome.removed ?? !existsSync(input.site.directory);
    if (!gone) {
      const reason = outcome.cleanup ?? "目录删不掉（未跟踪文件 / 锁文件 / 权限）";
      input.ledgerOf().append({
        type: "worktree.leftover",
        payload: {
          key: input.site.name,
          branch: input.site.branch,
          directory: input.site.directory,
          reason,
          worker: input.worker,
        },
      });
      return {
        status: "leftover",
        reason,
        directory: input.site.directory,
        ...(outcome.commit === undefined ? {} : { commit: outcome.commit }),
      };
    }
    input.ledgerOf().append({
      type: "worktree.removed",
      payload: {
        key: input.site.name,
        branch: input.site.branch,
        reason: "merged",
        worker: input.worker,
      },
    });
    return {
      status: "merged",
      ...(outcome.commit === undefined ? {} : { commit: outcome.commit }),
      ...(outcome.cleanup === undefined ? {} : { cleanup: outcome.cleanup }),
    };
  } finally {
    recycling.delete(lock);
  }
};

/**
 * worker 收工（settle）时的回收入口：现场记在句柄上，合并成功后摘掉它并让这一代收工。
 *
 * 现场已被回收过（`complete` 先触发过）就必须什么都不做：`entry.worktree` 已删，
 * 这里直接返回，不会再合并一次（幂等）。
 * @param input - 目标 worker、主工作区、依赖与账本。
 */
const finishGroupOf = async (input: {
  readonly entry: WorkerEntry;
  readonly workspace: string;
  readonly deps: OrchestratorDeps;
  readonly ledgerOf: () => ReturnType<typeof openLedger>;
  readonly onRetire: (entry: WorkerEntry, reason: string) => void;
}): Promise<void> => {
  const worktree = input.entry.worktree;
  const plan = input.entry.plan;
  const notes = input.entry.notes ?? [];
  if (worktree === undefined || plan === undefined || notes.length === 0) return;
  const outcome = await recycleGroup({
    workspace: input.workspace,
    deps: input.deps,
    ledgerOf: input.ledgerOf,
    plan,
    notes,
    worker: input.entry.planDirectory,
    site: worktree,
  });
  if (outcome.status === "skipped" || outcome.status === "blocked") return;
  // merged 与 leftover 都算这一代收工：分支已经没了，cwd 不能再当现场用。
  delete input.entry.worktree;
  input.onRetire(input.entry, outcome.status);
};

/**
 * 把回收结论折成一句给编排方看的话（拼进 `complete` 的返回值）。
 * @param outcome - 回收结论。
 * @param key - 组键（现场名）。
 * @returns 合并 / 现场残留 / 不能合并各一句；跳过时说 `undefined`（无事可报，不要噪声）。
 */
const recycleLine = (outcome: RecycleOutcome, key: string): string | undefined => {
  if (outcome.status === "skipped") return undefined;
  if (outcome.status === "merged") {
    const commit = outcome.commit === undefined ? "" : `（主分支 ${outcome.commit.slice(0, 8)}）`;
    return `已合并并回收现场 ${key}${commit}`;
  }
  if (outcome.status === "leftover") {
    return `⚠ 已合并，但现场没删干净（${outcome.reason}）：手动删 ${outcome.directory}`;
  }
  // 合并钩子的原因里往往已经写了“现场保留在 <path>”：不要再叠一遍同样的路径。
  const keep = outcome.reason.includes(outcome.directory) ? "" : `；现场保留 ${outcome.directory}`;
  return `✗ 未合并：${outcome.reason}${keep}`;
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
  /**
   * 让一代 worker 收工：落 `worker.exit`、摘句柄、dispose。
   *
   * 两种情形用它：临时 worker 终态（`settled`），组完成后现场已回收（`merged`）——
   * 后者的 cwd 已经不在了，继续留着句柄只会让下一次投递落在死目录里。
   * @param target - 目标 worker。
   * @param reason - 写进 `worker.exit` 的原因。
   */
  const onRetire = (target: WorkerEntry, reason: string): void => {
    retireWorker({ registry, ledgerOf, entry: target, reason });
  };

  return {
    name: "orchestrator_command",
    label: "Command",
    description:
      "编排方对 worker 的统一命令入口：op=dispatch（默认，派工或追加输入）/ pass / rework / answer / fact / abort。给了 plan + notes 就按组分派（一组无依赖 note 一个 worker），只给 plan 走 Plan 级派工，都没给则起临时 worker（无 Plan、只读 + report、跑完即弃）。**现场按组建**：一个组一个 `.worktrees/<组键>`（单 note 为 `note-<id>`，组为 `grp-<id-id>`，分支 `wt/<组键>`），第一次派工该组时建一次 + `pnpm install` 一次，之后同组所有代 worker（abort 后重派 / rework / resume / 追加）共用；组内 note 全 completed 且 `--ff-only` 合并成功才删现场与分支，合并失败保留现场并落一条 error。Plan 级派工与临时 worker 没有现场。delivery 为 steer（默认，插入当前运行）或 queue（排到 worker 当前轮之后）。每个命令都写进事件账本。",
    promptSnippet:
      "Send commands to workers (dispatch / pass / rework / answer / abort); every command is an event in the ledger.",
    promptGuidelines: [
      "一组无依赖 note 一个 worker：用 notes 显式给出这一组；组内不得互相 blocked_by。",
      "现场属于组：第一次派工该组时建 `.worktrees/<组键>`（单 note 为 note-<id>，组为 grp-<id-id>，分支 wt/<组键>）并装一次依赖，之后同组任何一代 worker 都落回同一个目录；Plan 级派工（无 notes）与临时 worker 没有现场。没有开关可改，要隔离就换组。",
      "组内 note 全 completed 后代码自动做 --ff-only 合并且成功即删现场（`complete` 落地那一刻就触发，不等 worker settle）；不能 ff-only 就不合并、保留现场并落一条 error（`orchestrator_state` 里带 ✗，`complete` 的返回值里也带 `✗ 未合并：…`）。不要派“回收现场”的指令。",
      "dispatch 只认**进程内的 live 句柄**：句柄不在就新建一个 worker（旧 jsonl 只当历史，不接管）。续跑落盘会话的唯一入口是 orchestrator_state 的 op=resume。",
      "pass / rework / answer 带 note 时路由到包含它的组；该 note 不属于任何组就自动以 [note] 单独成组投递。只有 note 本身不在 Plan 里才报错。",
      "默认 delivery=steer：追加口径在本轮生效；批量派活或不希望打断时显式 delivery=queue。硬停整个 worker 用 op=abort（abort 不动现场）。",
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
      if (op === "abort") return abortWorker(args, registry, ledgerOf);
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
      // 会话键：dispatch **只认进程内的 live 句柄**，句柄不在就新建一个 worker。
      // 同一键的上一代 jsonl 只当历史（不接管）—— 续跑落盘会话的唯一入口是 `op=resume`，
      // 所以这里给每次新建一个不重名的键（`<键>` / `<键>#2` / `<键>#3`…，代数从账本数）。
      const spawnsBefore = ledgerOf()
        .events()
        .filter((event) => {
          return event.type === "worker.spawned" && event.payload["worker"] === key;
        }).length;
      const sessionKey = spawnsBefore === 0 ? key : `${key}#${spawnsBefore + 1}`;

      if (plan !== undefined && groupNotes.length > 0) {
        await assertParallelGroup(plan, groupNotes, runtime);
      }

      // 现场属于**组**：组键即目录名与分支名（`note-<id>` / `grp-<id-id>`），
      // 第一次派工该组时建一次 + 装一次依赖，之后同组所有代 worker 共用；
      // Plan 级派工（无 notes）与临时 worker 没有现场。没有开关，看有没有组键就够了。
      let entry = registry.get(key);
      const started = entry === undefined;
      let worktree: WorktreeInfo | undefined;
      /** 本次是否新建（复用已有现场时不再装依赖）。 */
      let worktreeCreated = false;
      let worktreeInstall: InstallOutcome | undefined;
      // **现场只在新起 worker 时绑定**：`steer` / `queue` / `rework` / `answer` / `pass` /
      // `fact` 命中 live 句柄时一律不 ensure、不 install、不碰 cwd —— 追加输入把 worker 的
      // cwd 从主工作区切走、把它未提交的在制品留在原地，是实测过的病。组键对应的现场与
      // worker 当前 cwd 不一致时**静默以 cwd 为准**：不提示、不报错、不拉回。
      if (entry === undefined) {
        const siteName = groupWorktreeName(targetNotes);
        if (siteName !== undefined) {
          const hooks = deps.worktree ?? DEFAULT_WORKTREE_HOOKS;
          // 能不能复用**只认磁盘**（与 `state` 的现场行同一份校验结果）：账本说 `created`
          // 不等于目录还在，手工 `git worktree remove` / `rm -rf` 不会留下 `removed` 事件。
          const record = projectionOf().state().worktrees.get(siteName);
          const present = (await sitesOnDisk(deps, workspace)).has(siteName);
          if (present && record?.phase !== "created") {
            // 目录在但不属于这个组：手建 / 上一轮回收残留。接管它等于把别人的东西当自己的现场。
            throw new Error(
              (record === undefined
                ? `现场 ${siteName} 在磁盘上存在但账本没有创建记录（未登记现场，疑似手建）`
                : `现场 ${siteName} 的账本状态是 ${record.phase}（已合并 / 已回收）但目录还在`) +
                `：已中止派工，避免复用来历不明的目录。确认后手工删掉 ${join(workspace, WORKTREE_ROOT, siteName)} 再重派。`,
            );
          }
          // 目录不在（合并回收过 / 手工删了）→ 重新建 + 装一次，并落新的 `worktree.created`。
          const ensured = await hooks.ensure({ workspace, name: siteName });
          worktreeCreated = !present;
          worktree = ensured;
          if (worktreeCreated) {
            worktreeInstall = await hooks.install(ensured.directory);
            if (!worktreeInstall.ok) {
              throw new Error(
                `worktree ${siteName} 的依赖安装失败（${worktreeInstall.command}，${worktreeInstall.durationMs}ms）：${worktreeInstall.reason ?? "未知原因"}。` +
                  `worker 在那里跑不了测试，已中止派工；工作区保留在 ${ensured.directory}，可手工修后重派或删掉。`,
              );
            }
            ledgerOf().append({
              type: "worktree.created",
              payload: {
                key: siteName,
                branch: ensured.branch,
                directory: ensured.directory,
                worker: key,
                created: true,
                installMs: worktreeInstall.durationMs,
              },
            });
          }
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
            // cwd 落账：`state` 里看得见，追加输入不改它（note 50）。
            cwd: worktree?.directory ?? workspace,
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
        // 组完成才回收现场（只算“正常终态”）：
        // - 已有更新的一代 job 排着（`target.job !== undefined`）：等它的终态，否则会把别人还没改完的分支合掉；
        // - abort / 超时已经提前收割了 job（`harvest` 返回 false）：半成品不合入主分支，现场保留。
        if (harvested && target.job === undefined) {
          void finishGroupOf({
            entry: target,
            workspace,
            deps,
            ledgerOf,
            onRetire,
          });
        }
        if (target.kind === "temp") {
          onRetire(target, "settled");
        }
      };
      void delivery.settled.then(done, done);

      const head = started
        ? plan === undefined
          ? `已起临时 worker ${planRef}（无 Plan，跑完即弃；同一个 id 再派会新建一个 worker）`
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
      // 现场行只描述**这一次派工**做了什么：新起 worker 时才谈「建 / 复用现场」，
      // 命中 live 句柄的追加输入只投递：cwd 一句交代，不 ensure、不改 cwd（note 50）。
      const siteLine = !started
        ? `cwd 未变：${target.cwd}（追加输入只投递，不 ensure、不 install）`
        : target.worktree === undefined
          ? undefined
          : `worktree: ${target.worktree.name}（${target.worktree.branch}）· ${worktreeCreated ? `新建 · 依赖 ${worktreeInstall?.durationMs ?? 0}ms` : "复用现有现场"}`;
      return {
        content: textBlocks(
          [
            head,
            `kind: ${kind}${note === undefined ? "" : ` · note ${note}`}`,
            `delivery: ${deliveryMode} → ${delivery.delivered}`,
            deliverLine,
            ...(sessionLine === undefined ? [] : [sessionLine]),
            ...(siteLine === undefined ? [] : [siteLine]),
            ...(started && target.worktree !== undefined
              ? [
                  `worker 的 cwd 是 ${target.cwd}；Plan 仍锚定主工作区。完成前先 rebase 到主分支最新提交，再 report 里写“可 --ff-only 合并”（合并由代码自动做，不需派回收指令）。`,
                ]
              : []),
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
          cwd: target.cwd,
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

/**
 * `abort` 命令：按**句柄 / 组 / Plan** 粒度中止，并落 `worker.exit`（现场一律不动）。
 *
 * 粒度的来由：现场属于组，abort 的粒度必须跟着它 —— 带 `notes` 只摘那一组，别组的 worker
 * 与现场原样跑；`plan` 不带 `notes` 才摘该 Plan 的全部组；都不给才摘全部。
 * 摘句柄只有一条路径：按路由键从表里删掉（组键就在键里），**不碰目录**。
 * @param args - `worker`（精确键）/ `plan` / `notes`（组）。
 * @param registry - 句柄表。
 * @param ledgerOf - 账本访问器。
 */
const abortWorker = async (
  args: Record<string, unknown>,
  registry: WorkerRegistry,
  ledgerOf: () => ReturnType<typeof openLedger>,
): Promise<{ content: ReturnType<typeof textBlocks>; details: Record<string, unknown> }> => {
  const worker = optionalString(args, "worker");
  const plan = optionalString(args, "plan");
  const notes = optionalStringArray(args, "notes") ?? [];
  const group = groupKeyOf(notes);
  /** 精确给 `worker` 就只认它；否则按 Plan（+ 组）筛。 */
  const matches = (entry: WorkerEntry): boolean => {
    if (worker !== undefined) return entry.planDirectory === worker || entry.planRef === worker;
    const samePlan =
      plan === undefined ||
      entry.planRef === plan ||
      entry.planDirectory === plan ||
      planDirectoryOf(entry.planDirectory) === plan;
    if (!samePlan) return false;
    // 给了 notes 就只摘那一组：组标识是 note id 排序拼接，与句柄键里那段一致。
    return notes.length === 0 || groupKeyOf(entry.notes ?? []) === group;
  };
  const label =
    worker ?? (notes.length === 0 ? (plan ?? "全部") : `${plan ?? ""} 的组 [${notes.join(", ")}]`);
  const entries = registry.list().filter(matches);
  if (entries.length === 0) {
    if (worker === undefined && plan === undefined && notes.length === 0) {
      return { content: textBlocks("当前没有 live worker。"), details: { count: 0 } };
    }
    throw new Error(`没有在跑的 worker: ${label}`);
  }
  for (const entry of entries) {
    ledgerOf().append({
      type: "worker.exit",
      payload: { worker: entry.planDirectory, reason: "abort" },
    });
    registry.remove(entry.planDirectory);
    await disposeEntry(entry);
  }
  return {
    content: textBlocks(
      `已中止 ${label} 的 worker（${entries.length} 个）。现场不动：现场由组持有，同组再派会落回同一个目录、不再装依赖。`,
    ),
    details: { count: entries.length, workers: entries.map((entry) => entry.planDirectory) },
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
    "拉取编排摘要：live worker（含待消费输入、最后 report、worktree、超时与重试）、子 worker 层级、未读 report、待确认 note、⚠ 卡死项、可恢复的孤儿与上次中断凭据。读一次即把未读 report 标成已读（账本里的 state.pulled）。op=abort 按句柄 / 组 / Plan 粒度中止：给 notes 只摘该组（现场不动），给 plan 摘该 Plan 的全部组，都不给才摘全部；op=resume 恢复孤儿 worker（复用 jsonl，极短续跑消息）。",
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
      notes: {
        type: "array",
        items: { type: "string" },
        description:
          "op=abort 时只摘这一组（note id 列表，与派工时的组一致）；不给则摘该 plan 的全部组，连 plan 都不给才摘全部",
      },
    },
    required: [],
  }),
  async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
    const args = asArguments(raw);
    const op = optionalString(args, "op") ?? "list";
    if (op === "abort") {
      return abortWorker(args, registry, ledgerOf);
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
    // worktree 内的领域副本不参与解析；亮出来是为了让“为什么看不到那份改动”有答案。
    const workspace = runtime.workspace(exec);
    // 可恢复清单去掉**已经收口**的组（组内 note 全 completed、现场已被回收）：拿它们去
    // `op=resume` 只会得到一个 cwd 不存在的 worker（note 54 的真机现场）。与 resume 共用判据。
    const closedOrphans: OrphanWorker[] = [];
    for (const orphan of orphans) {
      if (await orphanGroupClosed({ orphan, workspace, domainRoot: runtime.domainRoot, deps })) {
        closedOrphans.push(orphan);
      }
    }
    const closedKeys = new Set(closedOrphans.map((orphan) => orphan.worker));
    const resumable = orphans.filter((orphan) => !closedKeys.has(orphan.worker));
    const copies = worktreeDomainCopies(workspace);
    // 磁盘上的现场：账本说 `created` 不等于目录还在（手工 `git worktree remove` /
    // `rm -rf` 不留事件），所以现场行与复用判断都按这一份校验结果说。
    const onDisk = await sitesOnDisk(deps, workspace);
    if (copies.length > 0) {
      lines.push(`worktree 内有副本，已忽略: ${copies.join("、")}`);
    }
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
        // 组键 + 现场：一行里就能看出“这个 worker 属于哪个组、对应哪个目录”，
        // 组级 abort 前确认没误杀、没杀错组靠的就是它们。
        const siteKey = groupWorktreeName(worker.notes);
        const site = siteKey === undefined ? undefined : state.worktrees.get(siteKey);
        // cwd：派工时定的那个。组现场与它不一致时以 cwd 为准（追加输入不 ensure、不拉回）。
        const cwdMark = worker.cwd === undefined ? "" : ` · cwd ${worker.cwd}`;
        const siteMark =
          siteKey === undefined
            ? " · 无现场（无组）"
            : site === undefined
              ? onDisk.has(siteKey)
                ? ` · 组键 ${siteKey} · 现场 未登记现场（疑似手建）`
                : ` · 组键 ${siteKey} · 现场 无记录`
              : ` · 组键 ${siteKey} · 现场 ${site.directory === "" ? site.branch : site.directory}（${sitePhaseLabel(
                  site,
                  onDisk,
                )}）`;
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
          `${indent}${worker.planRef} · ${group}${shape} · ${minutes} 分钟 · 输入 ${worker.inputs} 次 · ${pendingLabelOf(pending)} · ${report} · 最近输入 ${lastInput}${cwdMark}${siteMark}${mergeMark}${orphanMark}${timeoutMark}${diagnosisMark}`,
        );
      }
    }
    // 现场：一个组一个（`.worktrees/<组键>`）。从账本投影出来，所以“旧现场”与
    // “当前 live worker”是两行事实，不会糊成一件事；`created` 的行再跟磁盘对一次。
    const sites = [...state.worktrees.values()].sort(
      (left, right) => Date.parse(left.at) - Date.parse(right.at),
    );
    const unregisteredSites = [...onDisk].filter((name) => !state.worktrees.has(name)).sort();
    lines.push(...siteLines(sites, onDisk));
    if (resumable.length > 0) {
      lines.push(
        `可恢复 worker（${resumable.length}，op=resume 恢复）：${resumable
          .slice(0, 10)
          .map((orphan) =>
            orphan.depth > 0
              ? `${orphan.planRef}（子 worker，由父重建）`
              : `${orphan.planRef}（${orphan.worker}）`,
          )
          .join("、")}`,
      );
    }
    // 已收口不恢复的孤儿单独一行：不静默丢掉，但也不进可恢复清单。
    if (closedOrphans.length > 0) {
      lines.push(
        `已收口，不恢复（组内 note 全部 completed，现场已回收）：${closedOrphans
          .slice(0, 10)
          .map((orphan) => orphan.planRef)
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
        // 现场（组键 → 存在 / 已消失（无事件） / 已合并 / 已回收）也进 details：
        // 验收与测试不用拆文本；`present` 是磁盘校验的结果（不是账本）。
        worktrees: sites.map((site) => ({ ...site, present: onDisk.has(site.key) })),
        /** 目录在但账本无记录（疑似手建）：同样不复用。 */
        unregisteredSites,
        /** 可恢复的孤儿（已收口的组不在其中）。 */
        resumable: resumable.map((orphan) => orphan.worker),
        /** 跳过恢复的已收口组（组内 note 全部 completed）。 */
        closedOrphans: closedOrphans.map((orphan) => ({
          worker: orphan.worker,
          planRef: orphan.planRef,
          notes: [...orphan.notes],
        })),
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
    // 口径 A：`complete` 落库后立刻回收（与 worker settle 共用 `recycleGroup`）。
    onNoteCompleted: (input) => recycleAfterComplete(input),
  });

  /** 进程内的 worker 句柄表（**投影的缓存**：只放 session 与句柄，运行态看账本）。 */
  const registry: WorkerRegistry = createRegistry();

  /**
   * 认回一条 note 所属的组（成员 + 现场）。
   *
   * 现场属于**组**，而编排方的 `complete` 往往发生在句柄已经收工（settle / abort）之后：
   * 那时只有账本投影还记得这个组的成员与它的现场，不能只看句柄表。
   * @param plan - 目标 Plan。
   * @param note - 刚 `complete` 的 note。
   * @returns 组；现场已经回收过（`phase` 不是 created）/ 不属于任何组时 undefined。
   */
  const groupOfNote = (plan: PlanRef, note: string): GroupOfNote | undefined => {
    const live = findByNote(registry, plan.directory, note);
    const liveNotes = live?.notes ?? [];
    if (
      live !== undefined &&
      live.plan !== undefined &&
      live.worktree !== undefined &&
      liveNotes.length > 0
    ) {
      return {
        plan: live.plan,
        notes: liveNotes,
        worker: live.planDirectory,
        site: live.worktree,
        entry: live,
      };
    }
    const state = projectionOf().state();
    const ref = planRefOf(plan);
    for (const worker of state.workers.values()) {
      if (worker.planRef !== ref || !worker.notes.includes(note)) continue;
      const name = groupWorktreeName(worker.notes);
      const site = name === undefined ? undefined : state.worktrees.get(name);
      // 已经 merged / removed 的现场不再碰（幂等的那一半）；同一 note 换过组时继续找那个还活着的。
      if (name === undefined || site === undefined || site.phase !== "created") continue;
      return {
        plan,
        notes: worker.notes,
        worker: worker.worker,
        site: { name, branch: site.branch, directory: site.directory },
      };
    }
    return undefined;
  };

  /**
   * 编排方 `orchestrator_write complete` 之后的回收（口径 A：`complete` 即触发）。
   *
   * 复用 settle 路径同一个 `recycleGroup`，不另写一套：组内全 completed → ff-only 合并 →
   * `worktree.merged` + `worktree.removed`；失败落 `worker.merge_blocked` 并保留现场。
   * 回收后该组句柄**收工**（`worker.exit` + 摘句柄）：它的 cwd 已经不存在，同组再派是
   * 干净的新 worker + 重建的新现场（`worktree.created` 再落一条）。
   * @param input - 刚 `complete` 的 note、Plan 与工作区。
   * @returns 拼进 `complete` 返回值的一句话；无事可做时 undefined。
   */
  const recycleAfterComplete = async (input: {
    readonly plan: PlanRef;
    readonly workspace: string;
    readonly note: string;
  }): Promise<string | undefined> => {
    const group = groupOfNote(input.plan, input.note);
    if (group === undefined) return undefined;
    const outcome = await recycleGroup({
      workspace: input.workspace,
      deps,
      ledgerOf,
      plan: group.plan,
      notes: group.notes,
      worker: group.worker,
      site: group.site,
    });
    if (
      (outcome.status === "merged" || outcome.status === "leftover") &&
      group.entry !== undefined
    ) {
      // 现场已经没了（或分支已删、目录残留）：句柄留着只会让下一次投递落进死目录/脏目录。
      delete group.entry.worktree;
      retireWorker({ registry, ledgerOf, entry: group.entry, reason: outcome.status });
    }
    return recycleLine(outcome, group.site.name);
  };

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
   * 推一条**要编排方看到的**消息：含 `done`（临时 worker 的结论只有这一条）。
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
      // 现场不动：现场属于组，不属于这一代 worker（同组重派会落回同一个目录）。
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
    // 所有 done 也推送（临时 worker 的结论只有这一条）；批量时靠 digest 窗口合并。
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
        cwd: input.cwd,
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
        void finishGroupOf({
          entry,
          workspace: input.workspace,
          deps,
          ledgerOf,
          onRetire: (target, reason) => retireWorker({ registry, ledgerOf, entry: target, reason }),
        });
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
    // 上一代已中止：这次**新开**一份 jsonl（dispatch 不接管旧会话），
    // 现场仍是同一个（现场属于组）。
    const spawnsBefore = ledgerOf()
      .events()
      .filter((event) => {
        return event.type === "worker.spawned" && event.payload["worker"] === scene.key;
      }).length;
    const sessionKey = spawnsBefore === 0 ? scene.key : `${scene.key}#${spawnsBefore + 1}`;
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
        details: { resumed: [], lost: [], closed: [] },
      };
    }
    const resumed: Array<{ worker: string; planRef: string; sessionPath?: string }> = [];
    const lost: Array<{ worker: string; planRef: string; reason: string }> = [];
    const closed: Array<{ worker: string; planRef: string; notes: readonly string[] }> = [];
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
      // 组已收口（全 completed + 现场已回收）：拉起它只会得到一个 cwd 不存在的 worker。
      if (await orphanGroupClosed({ orphan, workspace, domainRoot: runtime.domainRoot, deps })) {
        closed.push({ worker: orphan.worker, planRef: orphan.planRef, notes: orphan.notes });
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
    for (const item of closed) {
      lines.push(
        `跳过（组内 note 全部 completed，现场已回收）：${item.planRef} · notes ${item.notes.join(",")}`,
      );
    }
    for (const item of lost) lines.push(`未恢复：${item.planRef} · ${item.reason}`);
    if (resumed.length > 0) {
      lines.push("恢复用的是同一份 jsonl：接着上次的上下文跑，不重开一份会话。");
    }
    return {
      content: textBlocks(lines.join("\n")),
      details: { resumed, lost, closed, orphans: orphans.length },
    };
  };

  /**
   * reload / 重启后把本会话当前 Plan 的孤儿 worker 拉回来。
   *
   * 与 `orchestrator_state op=resume` 是**同一个实现**，只是不需要人手点一次：宿主 reload 确实会
   * 发 `session_start`，而以前那次恢复没有任何触发点，于是「`worker.suspended` + 待消费输入」
   * 一直悬着。范围只限会话记录过的**当前 Plan** —— 没有记录就什么都不做（不猜 Plan、不做全局
   * 对账，保住“启动不自动对账”的定案）。幂等靠两条：已有 live 句柄的 worker 不算孤儿，账本里
   * 恢复过的那一代带幂等键。
   * @param ctx - 宿主上下文（只读会话分支与 cwd）。
   */
  const autoResumeOrphans = async (ctx: ExtensionContext): Promise<void> => {
    if (!modeOn(ctx)) return;
    const current = currentPlanOf(branchOf(ctx)) ?? recordedPlanDirectory;
    if (current === undefined) return;
    try {
      const result = await resumeOrphans(current, mainWorkspaceOf(ctx.cwd));
      const details = result.details as { resumed?: readonly unknown[] };
      const count = details.resumed?.length ?? 0;
      if (count > 0) {
        ctx.ui.notify(
          `Orchestrator：reload 后自动恢复 ${count} 个 worker（同一份 jsonl；先 git status 核对）。`,
          "info",
        );
      }
    } catch {
      // 恢复失败不挡启动：state 里仍列着可恢复项，可手动 op=resume。
    }
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
    createStateTool(runtime, registry, deps, ledgerOf, projectionOf, resumeOrphans),
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
    // reload / 重启：把当前 Plan 的孤儿接回来（与 op=resume 同一实现；没有当前 Plan 就不动）。
    void autoResumeOrphans(ctx);
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
