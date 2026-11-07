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
import { join } from "node:path";
import { Type } from "typebox";
import type { ToolkitSettings } from "../settings.ts";
import {
  clearInterrupted,
  forgetInterruptedPlan,
  installCrashGuard,
  readInterrupted,
  stateDirectory,
  writeInterrupted,
} from "./errors.ts";
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
  renew,
  type DeliveryMode,
  type WorkerEntry,
  type WorkerJob,
  type WorkerRegistry,
} from "./handles.ts";
import { spawnWorker, type SpawnWorkerOptions, type SpawnedWorker } from "./spawn.ts";
import { createOutbox, fileOutboxStore, PENDING_REPORTS_FILE, type Outbox } from "./outbox.ts";
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
 * `orchestrator_dispatch`：起一个 worker 或向它投递输入。
 *
 * 三种形态：给了 `plan` + `notes` 就派**组 worker**（一组无依赖 note 一个 worker，同一组
 * 复用句柄）；只给 `plan` 走 Plan 级派工（老路径）；`plan` 与 `lockedPlan` 都没有则是
 * **临时 worker**（不解析 Plan、键 `temp:<id>`、跑完即弃）。`kind=pass` 先把 note 记进
 * 放行集合，worker 才能写 `completed`。
 *
 * **入队即返回**：`deliver` 只给出那条输入的终态 promise，不等整轮；终态由
 * `settled` 收割，超时交给后台 watchdog。`delivery` 与 `kind` 正交：默认 `queue`
 * （排到当前轮之后），`steer` 插入当前运行；空闲时 `steer` 退化为直接开新一轮。
 */
const createDispatchTool = (
  runtime: ToolRuntime,
  registry: WorkerRegistry,
  deps: OrchestratorDeps,
  stateDir: () => string,
  onReport: (report: WorkerReport) => void,
  sendTimeout: (entry: WorkerEntry, job: WorkerJob, timeoutMs: number) => void,
): OrchestratorTool => {
  return {
    name: "orchestrator_dispatch",
    label: "Dispatch",
    description:
      "把一项工作交给 worker：给了 plan + notes 就按组分派（一组无依赖 note 一个 worker），只给 plan 走 Plan 级派工，都没给则起临时 worker（无 Plan、只读 + report、跑完即弃）。worktree 为 true（自动命名）或一个名字时，先把 worker 放进 .worktrees/<名字>（分支 wt/<名字>）并在那里 pnpm install，隔离并行改动。kind 为 message（默认，派活或追加）、pass（放行某条 note 置 completed）、rework、answer、fact。delivery 为 queue（默认，排到 worker 当前轮之后）或 steer（插入当前运行，下一次 LLM 调用前生效）。",
    promptSnippet:
      "Dispatch work to a plan's worker group, a plan-wide worker, a temporary worker, optionally inside a git worktree.",
    promptGuidelines: [
      "一组无依赖 note 一个 worker：用 notes 显式给出这一组；组内不得互相 blocked_by。",
      "需要真隔离（两个 worker 可能改同一批文件）时给 worktree: true 或一个名字；worker 的 cwd 就是 .worktrees/<名字>，Plan 仍锚定主工作区。",
      "worktree 的 worker 完成前必须自己 rebase 到主分支最新提交，并在 report 里写明可以 --ff-only 合并；rebase 冲突就报 blocked 并保留现场。合并成功后派一条回收指令（git merge --ff-only + 删 worktree 与分支）。",
      "pass / rework / answer 带 note 时路由到包含它的组；找不到就报错，不要自己猜。",
      "默认 delivery=queue，不打断 worker 当前这轮；只有方向错了或要叫停某步才用 steer（插话），硬停整个 worker 用 orchestrator_workers 的 abort。",
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
        delivery: {
          type: "string",
          enum: [...DELIVERY_MODES],
          description:
            "投递方式：queue（默认，追加到当前轮之后，不打断）| steer（插入当前运行，下一次 LLM 调用前生效；worker 空闲时退化为直接开新一轮）",
        },
        note: { type: "string", description: "kind=pass / rework / answer 时针对的 note id" },
        notes: {
          type: "array",
          items: { type: "string" },
          description:
            "组派工：这一组 note（互相不得有 blocked_by 依赖）；省略则走 Plan 级派工（老行为）",
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
      },
      required: [],
    }),
    async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
      const args = asArguments(raw);
      const kind = (optionalString(args, "kind") ?? "message") as InputKind;
      if (!(INPUT_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`kind 必须是 ${INPUT_KINDS.join(" | ")}`);
      }
      const deliveryMode = (optionalString(args, "delivery") ?? "queue") as DeliveryMode;
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
      const autoGroup = noteRouting && groupedByNote === undefined;
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
            ? autoWorktreeName(groupNotes)
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
        const released = new Set<string>();
        const base = {
          // 有 worktree 时 worker 的 cwd 就是隔离目录；Plan 仍用主工作区的绝对路径（`lockedPlan`）。
          cwd: worktree?.directory ?? workspace,
          settings: deps.settings,
          report: onReport,
          released,
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
          released,
          session: spawned.session,
          inputs: 0,
        });
      }
      if (kind === "pass" && note !== undefined) entry.released.add(note);
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
      // 终态到了就收割：清定时器、摘 job。reject 也走到这里，不让它变成未处理拒绝。
      // 临时 worker 是一次性的：终态即摘除句柄并 dispose，会话文件留在盘上等同 id 再派。
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
            "完成后会有 report 推回；用 orchestrator_workers 查 live 清单。",
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

/** `orchestrator_workers`：列 live worker 或中止它们（不设并发上限，但要能刹车）。 */
const createWorkersTool = (
  registry: WorkerRegistry,
  stateDir: () => string,
  outbox: Outbox,
): OrchestratorTool => ({
  name: "orchestrator_workers",
  label: "Workers",
  description:
    "列出当前 live worker（plan 或 temp:<id>、形态、起始时刻、最近上报、最近一次输入），或中止其中一个 / 全部。",
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
        for (const entry of registry.list()) {
          markWorkerSessionAborted(stateDir(), entry.planDirectory, "abort");
        }
        const count = await disposeAll(registry);
        return { content: textBlocks(`已中止 ${count} 个 worker。`), details: { count } };
      }
      const entries = registry.list().filter((entry) => entry.planRef === plan);
      if (entries.length === 0) throw new Error(`没有在跑的 worker: ${plan}`);
      for (const entry of entries) {
        markWorkerSessionAborted(stateDir(), entry.planDirectory, "abort");
        registry.remove(entry.planDirectory);
        await disposeEntry(entry);
      }
      return {
        content: textBlocks(`已中止 ${plan} 的 worker（会话作废：同 id / 同组再派会报错）。`),
        details: { count: entries.length },
      };
    }
    const entries = registry.list();
    if (entries.length === 0) {
      return { content: textBlocks("当前没有 live worker。"), details: { count: 0 } };
    }
    const lines = [`live worker（${entries.length}）:`];
    for (const entry of entries) {
      const now = Date.now();
      const minutes = Math.round((now - entry.startedAt) / 60_000);
      const report =
        entry.lastReport === undefined
          ? "尚无上报"
          : `${entry.lastReport.outcome} · note ${entry.lastReport.note}`;
      const group = entry.notes === undefined ? "" : `notes: ${entry.notes.join(",")} · `;
      const lastInput =
        entry.lastInput === undefined
          ? "尚无输入"
          : `${formatAgo(entry.lastInput.at, now)} [${entry.lastInput.kind}/${entry.lastInput.delivery}] ${entry.lastInput.text}`;
      const unsent = outbox.countFor(entry.planRef);
      const unsentMark = unsent === 0 ? "" : ` · 未送达 ${unsent} 条`;
      const worktreeMark =
        entry.worktree === undefined
          ? ""
          : ` · worktree ${entry.worktree.name}（${entry.worktree.branch}）`;
      lines.push(
        `  ${entry.planRef} · ${group}${entry.kind === "temp" ? "temp" : "plan"} · ${minutes} 分钟 · 输入 ${entry.inputs} 次 · ${report} · 最近输入 ${lastInput}${worktreeMark}${unsentMark}`,
      );
    }
    const unsent = outbox.count();
    if (unsent > 0) {
      const reason = outbox.lastError();
      lines.push(
        `未送达的通知: ${unsent} 条${reason === undefined ? "" : `（最近失败: ${reason}）`}；下一次 agent_settled / before_agent_start / input 会重试。`,
      );
    }
    return { content: textBlocks(lines.join("\n")), details: { count: entries.length, unsent } };
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
   * TUI 侧边栏（纯界面）：只读 `plan.ts` / `store.ts` 与句柄表，不注册工具、不发起回合。
   * 定时器 `unref` 过，且跟着 `sync` 开关，所以模式关 / 退出 / reload 都不会留下东西。
   */
  const sidebar = createSidebar({
    registry,
    limits: () => deps.settings().orchestrator,
  });

  /**
   * 编排方会话的通知队列（report / 超时）。pi 的 `sendMessage` 是即发即忘的，失败不会
   * 抛给我们，所以必须自己留账：失败入队（并落盘到 `reports-pending.json`，跨重启仍在）、
   * 下一次可注入的时机重试、积压可见。
   */
  const outbox: Outbox = createOutbox(
    (message, options) => pi.sendMessage(message, options),
    fileOutboxStore(join(stateDir(), PENDING_REPORTS_FILE)),
  );

  /** 编排方是否正在跑一轮：注入方式据此选 `followUp`（忙）/ `steer` + `triggerTurn`（闲）。 */
  let busy = false;

  /**
   * 投递一条通知：立即尝试，失败入队；不抛错、不阻塞、不改任何 note 状态。
   * @param input - 通知内容与归到哪个 worker。
   */
  const notify = (input: Parameters<Outbox["submit"]>[0]): void => {
    outbox.submit(input, busy);
  };

  /** 重试积压的通知（`agent_settled` / `before_agent_start` / `input` 都会调）。 */
  const flushNotices = (): void => {
    outbox.retry(busy);
  };

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
      // 中止即作废：这个键（plan/组或 temp id）不再复用那时的上下文，重启也不复活。
      markWorkerSessionAborted(stateDir(), entry.planDirectory, "timeout");
      notify({
        customType: "orchestrator-worker-timeout",
        content: [
          `[worker] 超时：${planRef} 的 worker 超过 ${minutes} 分钟没有进展，已中止并摘除句柄（kind: ${job.kind}${group}${target}）。`,
          "下次派工会起新 worker。note 状态未改动：按磁盘上的 notes 决定重新派工还是改派。",
          "用 orchestrator_workers 查 live 清单。",
        ].join("\n"),
        planRef,
        details: {
          plan: planRef,
          kind: job.kind,
          timedOut: true,
          ...(job.note === undefined ? {} : { note: job.note }),
          ...(job.notes === undefined ? {} : { notes: job.notes }),
        },
      });
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
    let matched: WorkerEntry | undefined;
    if (directory !== undefined) {
      // 路由：先找包含该 note 的组，再退到 Plan 级条目（老路径），最后试临时 worker 的键。
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
    const lines = [`[worker] ${report.outcome} · note ${report.note}: ${report.summary}`];
    if (report.question !== undefined) lines.push(`问题: ${report.question}`);
    if (report.plan !== undefined) lines.push(`plan: ${report.plan}`);
    notify({
      customType: "orchestrator-report",
      content: lines.join("\n"),
      ...(matched === undefined ? {} : { planRef: matched.planRef }),
      details: { ...report },
    });
  };

  for (const tool of [
    createReadTool(runtime),
    createWriteTool(runtime),
    createCheckTool(runtime),
    createAskQuestionsTool(),
    createDispatchTool(runtime, registry, deps, stateDir, onReport, sendTimeout),
    createWorkersTool(registry, stateDir, outbox),
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
   * 摘掉 worker 之前，先把「哪条 note 会被留在 `in_progress`」记进中断凭据。
   *
   * worker 随会话退出而消失，note 却还停在 `in_progress`：没有这条记录，人下次只看到一条悬空的
   * note，看不出它是被中断的。这里**只记录不改状态**（`status=blocked` 会改业务域文档），
   * 改状态是人的决定；凭据由 `/orchestrator status` 展示后清除。
   * @param reason - 写进凭据的原因。
   */
  const recordInterruptedNotes = async (reason: string): Promise<void> => {
    const entries = registry.list();
    if (entries.length === 0) return;
    const plans: string[] = [];
    const notes: string[] = [];
    for (const entry of entries) {
      if (!plans.includes(entry.planRef)) plans.push(entry.planRef);
      if (entry.kind === "temp") continue;
      try {
        const document = await loadDocument(
          planDirectoryOf(entry.planDirectory),
          deps.settings().orchestrator,
        );
        for (const note of document.notes) {
          if (note.status !== "in_progress") continue;
          const label = `${entry.planRef} · note ${note.id}`;
          if (!notes.includes(label)) notes.push(label);
        }
      } catch {
        // 读不到 notes.json 时只留 plan 记录；凭据本身不能因此不落盘。
      }
    }
    try {
      writeInterrupted(stateDir(), {
        at: new Date().toISOString(),
        reason,
        plans,
        ...(notes.length === 0 ? {} : { notes }),
      });
    } catch {
      // 会话正在退出，落盘失败没有更好的选择。
    }
  };

  // 进程级兜底：记录中断凭据后干净退出；凭据等人显式查询时才展示并被移除。
  installCrashGuard({
    directory: stateDir,
    plans: () => registry.list().map((entry) => entry.planRef),
  });

  // 退出收尾：先留痕再把 worker 全摘掉，避免“worker 静默消失、note 悬空”。
  pi.on("session_shutdown", async () => {
    sidebar.dispose();
    await recordInterruptedNotes(
      "session_shutdown: worker 随会话退出，相关 note 可能停在 in_progress",
    );
    await disposeAll(registry);
  });

  pi.on("agent_start", () => {
    busy = true;
  });

  // 一轮结束就空闲了：先翻状态，再重试积压的通知（失败会留在队里，不静默丢）。
  pi.on("agent_settled", () => {
    busy = false;
    flushNotices();
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
    flushNotices();
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
    flushNotices();
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
    const unsent = outbox.count();
    if (unsent > 0) {
      const reason = outbox.lastError();
      lines.push(
        `未送达通知: ${unsent} 条${reason === undefined ? "" : `（最近失败: ${reason}）`}`,
      );
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
