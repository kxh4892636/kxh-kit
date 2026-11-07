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
  INPUT_STUCK_MS,
  keyBelongsToPlan,
  planDirectoryOf,
  renew,
  type DeliveryMode,
  type WorkerEntry,
  type WorkerJob,
  type WorkerRegistry,
} from "./handles.ts";
import { spawnWorker, type SpawnWorkerOptions, type SpawnedWorker } from "./spawn.ts";
import { clipText } from "./events.ts";
import { closeLedger, openLedger } from "./ledger.ts";
import {
  closeProjection,
  openProjection,
  type ProjectedWorker,
  type Projection,
} from "./projection.ts";
import {
  abortedWorkerSession,
  markWorkerSessionAborted,
  nextTempSeq,
  rememberWorkerSession,
} from "./worker-sessions.ts";
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
import { createSidebar } from "./sidebar.ts";
import {
  autoWorktreeName,
  DEFAULT_WORKTREE_HOOKS,
  sanitizeWorktreeName,
  type InstallOutcome,
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

/** 相对时刻：清单里只需要“多久之前”，不需要绝对时间。 */
const formatAgo = (at: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
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
  sendTimeout: (entry: WorkerEntry, job: WorkerJob, timeoutMs: number) => void,
): OrchestratorTool => {
  return {
    name: "orchestrator_command",
    label: "Command",
    description:
      "编排方对 worker 的统一命令入口：op=dispatch（默认，派工或追加输入）/ pass / rework / answer / fact / abort。给了 plan + notes 就按组分派（一组无依赖 note 一个 worker），只给 plan 走 Plan 级派工，都没给则起临时 worker（无 Plan、只读 + report、跑完即弃）。worktree 为 true（自动命名）或一个名字时，先把 worker 放进 .worktrees/<名字>（分支 wt/<名字>）并在那里 pnpm install，隔离并行改动。delivery 为 steer（默认，插入当前运行）或 queue（排到 worker 当前轮之后）。每个命令都写进事件账本。",
    promptSnippet:
      "Send commands to workers (dispatch / pass / rework / answer / abort); every command is an event in the ledger.",
    promptGuidelines: [
      "一组无依赖 note 一个 worker：用 notes 显式给出这一组；组内不得互相 blocked_by。",
      "需要真隔离（两个 worker 可能改同一批文件）时给 worktree: true 或一个名字；worker 的 cwd 就是 .worktrees/<名字>，Plan 仍锚定主工作区。",
      "worktree 的 worker 完成前必须自己 rebase 到主分支最新提交，并在 report 里写明可以 --ff-only 合并；rebase 冲突就报 blocked 并保留现场。合并成功后派一条回收指令（git merge --ff-only + 删 worktree 与分支）。",
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
            "true → 自动命名（单 note 为 note-<id>，组为 grp-<id-id>，Plan 级为 plan）；给名字 → 复用或新建 .worktrees/<名字>（分支 wt/<名字>，基线 HEAD），并先在该目录 pnpm install。仅 Plan 派工可用。",
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
      let worktree: WorktreeInfo | undefined;
      /** 本次是否新建（复用已有 worktree 时不再装依赖）。 */
      let worktreeCreated = false;
      let worktreeInstall: InstallOutcome | undefined;
      if (requestedWorktree !== undefined && requestedWorktree !== false) {
        if (plan === undefined) {
          throw new Error(
            "worktree 只用于 Plan 派工：临时 worker 不绑 Plan，没有可锚定的 Plan 目录",
          );
        }
        const hooks = deps.worktree ?? DEFAULT_WORKTREE_HOOKS;
        const name =
          requestedWorktree === true
            ? autoWorktreeName(targetNotes)
            : sanitizeWorktreeName(requestedWorktree);
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
      }

      let entry = registry.get(key);
      const started = entry === undefined;
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
          inputs: 0,
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
      const timeoutMs = deps.settings().orchestrator.workerTimeoutMs;
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
      renew(target, job, timeoutMs, () => sendTimeout(target, job, timeoutMs));
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
        harvest(target, job);
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
                  `worker 的 cwd 是 ${target.worktree.directory}；Plan 仍锚定主工作区。完成前先 rebase 到主分支最新提交，再 report 里写“可 --ff-only 合并”。`,
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

/** 待消费概况（从投影算）：条数、最老一条等了多久、是否久到可疑。 */
const pendingOfProjection = (
  worker: ProjectedWorker,
  now: number,
): { pending: number; oldestMs?: number; stuck: boolean } => {
  const oldest = worker.pending[0];
  if (oldest === undefined) return { pending: 0, stuck: false };
  const oldestMs = Math.max(0, now - Date.parse(oldest.at));
  return { pending: worker.pending.length, oldestMs, stuck: oldestMs >= INPUT_STUCK_MS };
};

/** 待消费的一句话展示：`待消费 2（最老 3 分钟）`，可疑时追加 `⚠ 可能卡住`。 */
const pendingLabelOf = (summary: {
  pending: number;
  oldestMs?: number;
  stuck: boolean;
}): string => {
  if (summary.pending === 0) return "待消费 0";
  const waited = summary.oldestMs ?? 0;
  const oldest =
    waited < 60_000
      ? `${Math.max(1, Math.round(waited / 1000))} 秒`
      : `${Math.round(waited / 60_000)} 分钟`;
  return `待消费 ${summary.pending}（最老 ${oldest}）${summary.stuck ? " ⚠ 可能卡住" : ""}`;
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
): OrchestratorTool => ({
  name: "orchestrator_state",
  label: "State",
  description:
    "拉取编排摘要：live worker（含待消费输入、最后 report、worktree）、未读 report、待确认 note、⚠ 卡死项与上次中断凭据。读一次即把未读 report 标成已读（账本里的 state.pulled）。op=abort 时中止一个 plan / temp worker，省略 plan 则中止全部。",
  promptSnippet:
    "Pull the orchestrator state summary from the event ledger (workers, pending input, unread reports, stuck workers); or abort workers.",
  promptGuidelines: [
    "worker 的 report 不再自动注入你的会话：需要时调它拉摘要。",
    "读一次就把未读 report 消费掉，所以按需调用，别为了心跳反复读。",
  ],
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: { type: "string", enum: ["list", "abort"], description: "list（默认）| abort" },
      plan: {
        type: "string",
        description: "op=abort 时的 plan 引用或 `temp:<id>`；省略表示中止全部",
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
    const state = projectionOf().state();
    const now = Date.now();
    const live = [...state.workers.values()]
      .filter((worker) => worker.status === "live")
      .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
    const unread = state.reports.filter((report) => !report.read);
    const lines: string[] = [
      `账本：seq ${state.lastSeq} · live ${live.length} · 未读 report ${unread.length} · 放行 ${[...state.released.values()].reduce((sum, set) => sum + set.size, 0)} 条 note`,
    ];
    if (live.length === 0) {
      lines.push("当前没有 live worker。");
    } else {
      lines.push(`live worker（${live.length}）:`);
      for (const worker of live) {
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
        const pending = pendingOfProjection(worker, now);
        lines.push(
          `  ${worker.planRef} · ${group}${worker.kind === "temp" ? "temp" : "plan"} · ${minutes} 分钟 · 输入 ${worker.inputs} 次 · ${pendingLabelOf(pending)} · ${report} · 最近输入 ${lastInput}${worktreeMark}`,
        );
      }
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
  const interrupted: InterruptedAccess = {
    read: () => {
      const view = projectionOf().state().interrupted;
      if (view === undefined) return undefined;
      return {
        at: view.at,
        reason: view.reason,
        plans: [...view.plans],
        ...(view.notes.length === 0 ? {} : { notes: [...view.notes] }),
      };
    },
    forget: (planRef) => {
      ledgerOf().append({ type: "interrupted.forgotten", payload: { planRef } });
    },
    clear: () => {
      ledgerOf().append({ type: "interrupted.cleared", payload: {} });
    },
  };

  const runtime = createToolRuntime({
    limits: () => deps.settings().orchestrator,
    domainRoot: DEFAULT_DOMAIN_ROOT,
    interrupted,
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

  /** 编排方是否正在跑一轮；只用于可选的“叫醒”注入（默认关闭）。 */
  let busy = false;

  /**
   * 可选的“叫醒”注入：默认关闭。账本上线后模型**不再被推送**，需要摘要时自己调
   * `orchestrator_state`；这里只给“希望被叫醒”的用法留一个开关，失败也不重试（账本是真相）。
   * @param text - 一行摘要。
   */
  const wake = (text: string): void => {
    if (!deps.settings().orchestrator.wakeOnReport) return;
    try {
      pi.sendMessage(
        { customType: "orchestrator-wake", content: text, display: true },
        busy ? { deliverAs: "followUp" } : { triggerTurn: true, deliverAs: "steer" },
      );
    } catch {
      // 会话正在关闭之类：丢一条提醒不影响账本。
    }
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
      entry.inputs = worker.inputs;
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
   * 卡死到点：中止 worker、摘句柄、落 `timeout` 与 `worker.exit` 事件。
   *
   * 只对同一次派工生效一次（`job.notified`），**不代写 note 状态** —— 重新派工还是改派由人决定。
   * 摘除句柄是必需的：被 abort 的 session 不能复用，留着会让 `orchestrator_state` 的 live 清单说谎。
   */
  const sendTimeout = (entry: WorkerEntry, job: WorkerJob, timeoutMs: number): void => {
    if (entry.job !== job || job.notified) return;
    job.notified = true;
    const minutes = Math.round(timeoutMs / 60_000);
    // 触发它的那条输入（最老未消费）带上 seq，便于在账本里对上号。
    const oldest = projectionOf().oldestPendingOf(entry.planDirectory);
    void (async () => {
      try {
        await entry.session.abort();
      } catch {
        // 已经结束的 session 会拒绝 abort；收尾时忽略。
      }
      await disposeEntry(entry);
      registry.remove(entry.planDirectory);
      // 中止即作废：这个键（plan/组或 temp id）不再复用那时的上下文，重启也不复活。
      markWorkerSessionAborted(stateDir(), entry.planDirectory, "timeout");
      ledgerOf().append({
        type: "timeout",
        payload: {
          worker: entry.planDirectory,
          cause: "idle",
          ...(oldest === undefined ? {} : { oldestUnconsumedSeq: oldest.seq }),
          elapsedMs: Math.max(0, Date.now() - job.progressAt),
        },
      });
      ledgerOf().append({
        type: "worker.exit",
        payload: { worker: entry.planDirectory, reason: "timeout" },
      });
      wake(
        `[worker] 超时：${entry.planRef} 超过 ${minutes} 分钟没有进展，已中止（note 状态未改动）。`,
      );
    })();
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
        findByNote(registry, directory, report.note) ??
        registry.get(entryKeyOf(directory)) ??
        registry.get(directory);
      if (matched !== undefined) {
        const entry = matched;
        entry.lastReport = report;
        const job = entry.job;
        if (job !== undefined) {
          const timeoutMs = deps.settings().orchestrator.workerTimeoutMs;
          renew(entry, job, timeoutMs, () => sendTimeout(entry, job, timeoutMs));
        }
      }
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
      },
    });
    wake(`[worker] ${report.outcome} · note ${report.note}: ${clipText(report.summary)}`);
  };

  for (const tool of [
    createReadTool(runtime),
    createWriteTool(runtime),
    createCheckTool(runtime),
    createAskQuestionsTool(),
    createCommandTool(
      runtime,
      registry,
      deps,
      stateDir,
      ledgerOf,
      projectionOf,
      onReport,
      sendTimeout,
    ),
    createStateTool(runtime, registry, deps, stateDir, ledgerOf, projectionOf),
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
   * 摘掉 worker 之前，先把「哪条 note 会被留在 `in_progress`」记进账本。
   *
   * worker 随会话退出而消失，note 却还停在 `in_progress`：没有这条记录，人下次只看到一条悬空的
   * note，看不出它是被中断的。这里**只记录不改状态**（`status=blocked` 会改业务域文档），
   * 改状态是人的决定；凭据由 `orchestrator_state` / `resume` 展示后被移除。
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
          type: "worker.exit",
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

  // 进程级兜底：把 live worker 记成 `worker.exit`（崩溃）后干净退出。
  installCrashGuard({
    record: (reason) => {
      for (const entry of registry.list()) {
        try {
          ledgerOf().append({
            type: "worker.exit",
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
    await recordInterruptedNotes(
      "session_shutdown: worker 随会话退出，相关 note 可能停在 in_progress",
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
      if (crashed.notes !== undefined && crashed.notes.length > 0) {
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
