/**
 * nano-mem CLI：参数解析（node:util parseArgs）、命令分派、输出渲染与退出码。
 *
 * 纯逻辑 + 环境注入：`runCli(argv, env)` 返回 `{ exitCode, stdout, stderr }`，
 * 不直接接触 process/文件系统（db 路径解析与目录创建除外，走 env 注入的 cwd/env/homeDir）。
 * `main.ts` 是薄壳，仅负责把进程环境注入并写出结果。
 *
 * 契约（spec「CLI 契约」）：
 * - 退出码：0 成功 / 1 运行时错误 / 2 用法错误；
 * - `--json`：成功 JSON → stdout，错误 JSON → stderr，错误形如
 *   `{"error":{"code":"usage"|"runtime","message":"...","hint":"..."}}`；
 * - 错误输出含 hint 时优先展示 hint；
 * - `--db`：参数 → `$NANO_MEM_DB` → `~/.nano-mem/mem.db`（目录自动创建）；
 * - `--agent`：默认当前工作目录 basename；`--dry-run`：写命令预演，不打开数据库、无副作用。
 */

import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  cardToRow,
  initReview,
  initialCard,
  parseGrade,
  recordUse,
  retrievability,
  rowToCard,
  type Grade,
  type MemoryRow,
} from "./fsrs";
import { MemoryStore, type Memory, type MemoryState } from "./store";
import {
  DEFAULT_WEIGHTS,
  effectiveStateOf,
  gcExecute,
  gcPlan,
  parseScoreWeights,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_MIN_SCORE_DEFAULT,
  searchMemories,
  GC_RETENTION_DAYS_DEFAULT,
  type EffectiveState,
  type GcReport,
  type SearchHit,
} from "./search";
import {
  renderSelfJson,
  renderSelfText,
  runSelfCommand,
  SelfUsageError,
  type SelfPayload,
} from "./self";

/** 可注入的进程环境；测试传假值，nodeEnv() 提供真实默认。 */
export interface CliEnv {
  /** 当前工作目录（--agent 默认值来源，默认 process.cwd()）。 */
  readonly cwd: string;
  /** 进程环境（NANO_MEM_DB 默认值来源，默认 process.env）。 */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** 用户主目录（默认 db 路径，默认 os.homedir()）。 */
  readonly homeDir: string;
  /** 时间注入（默认 new Date()）。 */
  readonly now: () => Date;
  /** 读取 stdin 全文（add - 时使用）。 */
  readonly readStdin: () => Promise<string>;
  /** 包版本（默认读 package.json）。 */
  readonly version: string;
}

/** CLI 执行结果：exitCode + 待写入 stdout/stderr 的文本。 */
export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CliErrorCode = "usage" | "runtime";

/** CLI 错误：usage → 退出码 2；runtime → 退出码 1；可携带 hint。 */
export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly hint: string | undefined;

  constructor(code: CliErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
  }
}

/** 记忆命令（self 在 issue 06，v1 不在此处）。 */
export const COMMANDS = ["add", "get", "list", "use", "delete", "stats", "search", "gc"] as const;
export type CommandName = (typeof COMMANDS)[number];

export const GRADES_HINT = "again, hard, good, easy";
export const STATES_HINT = "active, dormant, trashed, all";

/** list --state 合法取值（惰性状态语义，issue 04）。 */
export const LIST_STATES = ["active", "dormant", "trashed", "all"] as const;

const isCommand = (value: string): value is CommandName =>
  (COMMANDS as readonly string[]).includes(value);

/** 各命令专属选项（--agent/--run/--tag/--limit/--state 与全局同名选项在此声明）。 */
const COMMAND_OPTIONS: Readonly<Record<CommandName, readonly string[]>> = {
  add: ["tag", "meta"],
  get: [],
  list: ["tag", "limit", "state"],
  use: ["grade"],
  delete: [],
  stats: [],
  search: ["tag", "limit", "min-score", "no-touch", "include-dormant", "score-weights"],
  gc: ["retention-days"],
};

const GLOBAL_OPTIONS = ["json", "db", "agent", "run", "dry-run", "help", "version"] as const;

const OPTION_DEFS = {
  json: { type: "boolean" },
  db: { type: "string" },
  agent: { type: "string" },
  run: { type: "string" },
  "dry-run": { type: "boolean" },
  help: { type: "boolean" },
  version: { type: "boolean" },
  tag: { type: "string", multiple: true },
  meta: { type: "string", multiple: true },
  limit: { type: "string" },
  state: { type: "string", multiple: true },
  grade: { type: "string" },
  "min-score": { type: "string" },
  "no-touch": { type: "boolean" },
  "include-dormant": { type: "boolean" },
  "score-weights": { type: "string" },
  "retention-days": { type: "string" },
  // self skill 命令组专属选项（仅 self 命令接受；记忆命令经 assertCommandOptions 拒绝）
  name: { type: "string" },
  target: { type: "string" },
  force: { type: "boolean" },
  all: { type: "boolean" },
} as const;

type RawValues = Readonly<Record<string, string | boolean | readonly string[] | undefined>>;

interface ParsedInvocation {
  readonly command: string | undefined;
  /** 命令名之后的全部位置参数。 */
  readonly args: readonly string[];
  readonly values: RawValues;
}

interface CommandContext {
  readonly env: CliEnv;
  readonly dryRun: boolean;
  /** 已归一：--agent ?? basename(cwd)。 */
  readonly agent: string;
  /** 已归一：--run ?? ""。 */
  readonly run: string;
  readonly dbPath: string;
  readonly args: readonly string[];
  readonly values: RawValues;
  /** 打开数据库执行操作并负责关闭；dry-run 路径不调用，保证无副作用。 */
  readonly withStore: <R>(fn: (store: MemoryStore) => R) => R;
}

/** dry-run 预演的操作描述。 */
export type Plan =
  | {
      readonly op: "add";
      readonly text: string;
      readonly agent: string;
      readonly run: string;
      readonly tags: readonly string[];
      readonly meta: Readonly<Record<string, string>>;
    }
  | { readonly op: "use"; readonly id: number; readonly grade: Grade }
  | { readonly op: "delete"; readonly id: number };

export interface FsrsStats {
  readonly averageStability: number;
  readonly averageDifficulty: number;
  readonly totalReps: number;
  readonly totalLapses: number;
  readonly averageRetrievability: number;
}

/** list/search 输出中的记忆视图：state 为惰性判定的有效状态。 */
export interface MemoryView extends Omit<Memory, "state"> {
  readonly state: EffectiveState;
}

/** search 结果视图：记忆字段 + 分数/相关性/强度（触摸前语义）。 */
export interface SearchResultView extends MemoryView {
  readonly score: number;
  readonly relevance: number;
  readonly strength: number;
}

type Payload =
  | { readonly kind: "added"; readonly id: number; readonly duplicate: boolean }
  | { readonly kind: "memory"; readonly memory: Memory }
  | { readonly kind: "list"; readonly memories: readonly MemoryView[] }
  | { readonly kind: "used"; readonly memory: Memory; readonly grade: Grade }
  | { readonly kind: "deleted"; readonly id: number }
  | {
      readonly kind: "stats";
      readonly total: number;
      readonly byState: Readonly<Record<MemoryState, number>>;
      readonly fsrs: FsrsStats;
    }
  | { readonly kind: "plan"; readonly plans: readonly Plan[] }
  | { readonly kind: "search"; readonly results: readonly SearchResultView[] }
  | { readonly kind: "gc"; readonly dryRun: boolean; readonly report: GcReport }
  | SelfPayload;

const strValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const strList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const fmtNum = (n: number): string => n.toFixed(2);

const joinTags = (tags: readonly string[]): string => (tags.length === 0 ? "-" : tags.join(", "));

/** 解析 --db 参数 → $NANO_MEM_DB → ~/.nano-mem/mem.db。 */
export function resolveDbPath(options: {
  readonly argvPath: string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly homeDir: string;
}): string {
  if (options.argvPath !== undefined) return options.argvPath;
  const fromEnv = options.env["NANO_MEM_DB"];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  return join(options.homeDir, ".nano-mem", "mem.db");
}

/** db 目录自动创建；`:memory:` 跳过。 */
function ensureDbDir(dbPath: string): void {
  if (dbPath === ":memory:") return;
  mkdirSync(dirname(dbPath), { recursive: true });
}

const parseId = (raw: string, label: string): number => {
  if (!/^\d+$/.test(raw)) {
    throw new CliError("usage", `${label} "${raw}" 不是合法的 id`, "id 应为正整数");
  }
  return Number(raw);
};

function requireOneId(ctx: CommandContext, command: string): number {
  if (ctx.args.length === 0) {
    throw new CliError("usage", `${command} 需要 <id> 参数`, `nm ${command} <id>`);
  }
  if (ctx.args.length > 1) {
    throw new CliError("usage", `${command} 只接受一个 <id>`);
  }
  const raw = ctx.args[0];
  if (raw === undefined) {
    throw new CliError("usage", `${command} 需要 <id> 参数`, `nm ${command} <id>`);
  }
  return parseId(raw, "id");
}

function parseInvocation(argv: readonly string[]): ParsedInvocation {
  let parsed: { values: RawValues; positionals: string[] };
  try {
    parsed = parseArgs({
      args: [...argv],
      options: OPTION_DEFS,
      allowPositionals: true,
      strict: true,
    }) as unknown as { values: RawValues; positionals: string[] };
  } catch (error) {
    throw new CliError("usage", error instanceof Error ? error.message : String(error));
  }
  const [command, ...args] = parsed.positionals;
  return { command, args, values: parsed.values };
}

/** 校验命令专属选项：全局选项 + 该命令声明的选项之外一律拒绝。 */
function assertCommandOptions(command: CommandName, values: RawValues): void {
  const allowed = new Set<string>([...GLOBAL_OPTIONS, ...COMMAND_OPTIONS[command]]);
  for (const name of Object.keys(values)) {
    if (!allowed.has(name)) {
      throw new CliError(
        "usage",
        `选项 --${name} 不适用于命令 ${command}`,
        `可用选项: ${[...allowed].map((item) => `--${item}`).join(" ")}`,
      );
    }
  }
}

async function resolveAddText(ctx: CommandContext): Promise<string> {
  const text = ctx.args.join(" ");
  if (text === "") {
    throw new CliError(
      "usage",
      "add 需要文本参数",
      'nm add "要记住的内容"（或 nm add - 从 stdin 读取）',
    );
  }
  if (text === "-") {
    const raw = await ctx.env.readStdin();
    const stdinText = raw.replace(/\r?\n$/, "");
    if (stdinText === "") {
      throw new CliError("usage", "stdin 为空，没有可添加的文本", "npm 管道输入内容后重试");
    }
    return stdinText;
  }
  return text;
}

function parseTags(ctx: CommandContext): readonly string[] {
  const tags = strList(ctx.values["tag"]).map((tag) => tag.trim());
  for (const tag of tags) {
    if (tag === "") {
      throw new CliError("usage", "--tag 的值不能为空", "--tag <name> 可重复传入");
    }
  }
  return tags;
}

function parseMeta(ctx: CommandContext): Readonly<Record<string, string>> {
  const meta: Record<string, string> = {};
  for (const raw of strList(ctx.values["meta"])) {
    const eq = raw.indexOf("=");
    if (eq <= 0) {
      throw new CliError(
        "usage",
        `--meta 需要 k=v 形式，收到 "${raw}"`,
        "示例：--meta importance=high",
      );
    }
    const key = raw.slice(0, eq).trim();
    if (key === "") {
      throw new CliError("usage", `--meta 的键不能为空: "${raw}"`);
    }
    meta[key] = raw.slice(eq + 1);
  }
  return meta;
}

async function addCommand(ctx: CommandContext): Promise<Payload> {
  const text = await resolveAddText(ctx);
  const tags = parseTags(ctx);
  const meta = parseMeta(ctx);
  if (ctx.dryRun) {
    return {
      kind: "plan",
      plans: [{ op: "add", text, agent: ctx.agent, run: ctx.run, tags, meta }],
    };
  }
  return ctx.withStore((store) => {
    const added = store.add({ text, agent: ctx.agent, run: ctx.run, tags, meta });
    if (!added.duplicate) {
      // 首次写入即按 Good 初始化 FSRS（New → Review），issue 02 语义。
      const now = ctx.env.now();
      const card = initReview(initialCard(now), now);
      if (store.updateFsrs(added.id, cardToRow(card)) === null) {
        throw new CliError("runtime", `FSRS 初始化持久化失败（id=${added.id}）`);
      }
    }
    return { kind: "added", id: added.id, duplicate: added.duplicate };
  });
}

function getCommand(ctx: CommandContext): Payload {
  const id = requireOneId(ctx, "get");
  const memory = ctx.withStore((store) => store.get(id));
  if (memory === null) {
    throw new CliError("runtime", `记忆 ${id} 不存在`, "nm list --state all 查看现有记忆");
  }
  return { kind: "memory", memory };
}

/** 解析正整数选项（--limit/--retention-days 通用）；非法值抛用法错误。 */
function parsePositiveInt(raw: string, label: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) === 0) {
    throw new CliError("usage", `${label} "${raw}" 非法`, `${label} 应为正整数`);
  }
  return Number(raw);
}

function listCommand(ctx: CommandContext): Payload {
  const limitRaw = strValue(ctx.values["limit"]);
  const limit = limitRaw === undefined ? undefined : parsePositiveInt(limitRaw, "--limit");
  const requested = new Set<string>();
  for (const state of strList(ctx.values["state"])) {
    if (!(LIST_STATES as readonly string[]).includes(state)) {
      throw new CliError("usage", `--state "${state}" 非法`, `合法的 state: ${STATES_HINT}`);
    }
    requested.add(state);
  }
  // 默认只显示有效 active（软删除/休眠默认隐藏）；--agent/--run 仅在显式给出时过滤。
  // state 语义为惰性判定（issue 04）：active=非 trashed 且 R≥0.35；dormant=非 trashed 且
  // R<0.35；trashed=state=trashed；all=全部。
  const agent = strValue(ctx.values["agent"]);
  const run = strValue(ctx.values["run"]);
  return ctx.withStore((store) => {
    const now = ctx.env.now();
    const memories: MemoryView[] = [];
    for (const memory of store.list({
      ...(agent === undefined ? {} : { agent }),
      ...(run === undefined ? {} : { run }),
      tags: strList(ctx.values["tag"]),
    })) {
      const effective = effectiveStateOf(memory, now);
      const matches =
        requested.size === 0
          ? effective === "active"
          : requested.has("all") || requested.has(effective);
      if (!matches) continue;
      memories.push({ ...memory, state: effective });
    }
    return { kind: "list", memories: limit === undefined ? memories : memories.slice(0, limit) };
  });
}

/** Memory → fsrs.MemoryRow；未初始化（due 为空）应已由调用方分支处理。 */
function memoryToRow(memory: Memory): MemoryRow {
  if (memory.due === null) {
    throw new CliError("runtime", `记忆 ${memory.id} 缺少 FSRS 调度字段`, "该记录无法进行复习调度");
  }
  return {
    due: memory.due,
    last_review: memory.lastReview,
    stability: memory.stability,
    difficulty: memory.difficulty,
    reps: memory.reps,
    lapses: memory.lapses,
    fsrs_state: memory.fsrsState,
  };
}

function useCommand(ctx: CommandContext): Payload {
  const id = requireOneId(ctx, "use");
  const gradeRaw = strValue(ctx.values["grade"]) ?? "good";
  let grade: Grade;
  try {
    grade = parseGrade(gradeRaw);
  } catch (error) {
    throw new CliError(
      "usage",
      error instanceof Error ? error.message : String(error),
      `合法评级: ${GRADES_HINT}`,
    );
  }
  if (ctx.dryRun) {
    return { kind: "plan", plans: [{ op: "use", id, grade }] };
  }
  return ctx.withStore((store) => {
    const memory = store.get(id);
    if (memory === null) {
      throw new CliError("runtime", `记忆 ${id} 不存在`, "nm list 查看现有记忆");
    }
    const now = ctx.env.now();
    const base = memory.due === null ? initialCard(now) : rowToCard(memoryToRow(memory));
    const card = recordUse(base, grade, now);
    const updated = store.updateFsrs(id, cardToRow(card));
    if (updated === null) {
      throw new CliError("runtime", `记录使用失败（id=${id}）`);
    }
    return { kind: "used", memory: updated, grade };
  });
}

function deleteCommand(ctx: CommandContext): Payload {
  const id = requireOneId(ctx, "delete");
  if (ctx.dryRun) {
    return { kind: "plan", plans: [{ op: "delete", id }] };
  }
  const deleted = ctx.withStore((store) => store.delete(id, ctx.env.now()));
  if (!deleted) {
    throw new CliError("runtime", `记忆 ${id} 不存在`, "nm list --state all 查看现有记忆");
  }
  return { kind: "deleted", id };
}

const average = (nums: readonly number[]): number =>
  nums.length === 0 ? 0 : nums.reduce((sum, value) => sum + value, 0) / nums.length;

function statsCommand(ctx: CommandContext): Payload {
  return ctx.withStore((store) => {
    const memories = store.list();
    const byState: Record<MemoryState, number> = { active: 0, trashed: 0 };
    for (const memory of memories) {
      byState[memory.state] += 1;
    }
    const reviewed = memories.filter((memory) => memory.due !== null && memory.lastReview !== null);
    const now = ctx.env.now();
    const fsrs: FsrsStats = {
      averageStability: average(reviewed.map((memory) => memory.stability)),
      averageDifficulty: average(reviewed.map((memory) => memory.difficulty)),
      totalReps: memories.reduce((sum, memory) => sum + memory.reps, 0),
      totalLapses: memories.reduce((sum, memory) => sum + memory.lapses, 0),
      averageRetrievability: average(
        reviewed.map((memory) => retrievability(rowToCard(memoryToRow(memory)), now)),
      ),
    };
    return { kind: "stats", total: memories.length, byState, fsrs };
  });
}

function searchCommand(ctx: CommandContext): Payload {
  const query = ctx.args.join(" ").trim();
  if (query === "") {
    throw new CliError("usage", "search 需要 <query>", 'nm search "关键词"');
  }
  const limitRaw = strValue(ctx.values["limit"]);
  const limit =
    limitRaw === undefined ? SEARCH_LIMIT_DEFAULT : parsePositiveInt(limitRaw, "--limit");
  const minScoreRaw = strValue(ctx.values["min-score"]);
  let minScore = SEARCH_MIN_SCORE_DEFAULT;
  if (minScoreRaw !== undefined) {
    const parsed = Number(minScoreRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new CliError(
        "usage",
        `--min-score "${minScoreRaw}" 非法`,
        "--min-score 应取 [0,1] 区间，如 --min-score 0.5",
      );
    }
    minScore = parsed;
  }
  let weights = DEFAULT_WEIGHTS;
  const weightsRaw = strValue(ctx.values["score-weights"]);
  if (weightsRaw !== undefined) {
    try {
      weights = parseScoreWeights(weightsRaw);
    } catch (error) {
      throw new CliError(
        "usage",
        `--score-weights "${weightsRaw}" 非法`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  const noTouch = ctx.values["no-touch"] === true;
  const includeDormant = ctx.values["include-dormant"] === true;
  const agent = strValue(ctx.values["agent"]);
  const run = strValue(ctx.values["run"]);
  const results = ctx.withStore((store) =>
    searchMemories(store, {
      query,
      now: ctx.env.now(),
      limit,
      minScore,
      weights,
      includeDormant,
      // 自动弱使用默认开启（每次命中记一次 Hard）；--no-touch/--dry-run 关闭。
      touch: !ctx.dryRun && !noTouch,
      ...(agent === undefined ? {} : { agent }),
      ...(run === undefined ? {} : { run }),
      tags: strList(ctx.values["tag"]),
    }),
  );
  const views: SearchResultView[] = results.map((hit: SearchHit) => ({
    ...hit.memory,
    state: hit.state,
    score: hit.score,
    relevance: hit.relevance,
    strength: hit.strength,
  }));
  return { kind: "search", results: views };
}

function gcCommand(ctx: CommandContext): Payload {
  const retentionRaw = strValue(ctx.values["retention-days"]) ?? String(GC_RETENTION_DAYS_DEFAULT);
  const retentionDays = parsePositiveInt(retentionRaw, "--retention-days");
  return ctx.withStore((store) => {
    const options = { now: ctx.env.now(), retentionDays };
    return {
      kind: "gc",
      dryRun: ctx.dryRun,
      report: ctx.dryRun ? gcPlan(store, options) : gcExecute(store, options),
    } as const;
  });
}

async function execute(command: CommandName, ctx: CommandContext): Promise<Payload> {
  switch (command) {
    case "add": {
      return addCommand(ctx);
    }
    case "get": {
      return getCommand(ctx);
    }
    case "list": {
      return listCommand(ctx);
    }
    case "use": {
      return useCommand(ctx);
    }
    case "delete": {
      return deleteCommand(ctx);
    }
    case "stats": {
      return statsCommand(ctx);
    }
    case "search": {
      return searchCommand(ctx);
    }
    case "gc": {
      return gcCommand(ctx);
    }
  }
}

/* ------------------------------- 输出渲染 ------------------------------- */

const ISO_OR_DASH = (value: string | null): string => value ?? "-";

function memoryText(memory: Memory): string {
  const lines = [
    `#${memory.id} [${memory.state}]`,
    `文本: ${memory.text}`,
    `标签: ${joinTags(memory.tags)}`,
    `元数据: ${JSON.stringify(memory.meta)}`,
    `agent: ${memory.agent} · run: ${memory.runKey === "" ? "-" : memory.runKey}`,
    `创建: ${memory.createdAt}`,
    `更新: ${memory.updatedAt}`,
    `last_review: ${ISO_OR_DASH(memory.lastReview)}`,
    `due: ${ISO_OR_DASH(memory.due)}`,
    `stability: ${fmtNum(memory.stability)} · difficulty: ${fmtNum(memory.difficulty)} · ` +
      `reps: ${memory.reps} · lapses: ${memory.lapses} · fsrs_state: ${memory.fsrsState}`,
    `trashed_at: ${ISO_OR_DASH(memory.trashedAt)}`,
  ];
  return `${lines.join("\n")}\n`;
}

function listLine(memory: MemoryView): string {
  const run = memory.runKey === "" ? "-" : memory.runKey;
  return (
    `#${memory.id} [${memory.state}] tags=${joinTags(memory.tags)} · ${memory.text} ` +
    `(agent=${memory.agent}, run=${run})\n`
  );
}

function planText(plan: Plan): string {
  switch (plan.op) {
    case "add": {
      const tags = plan.tags.length === 0 ? "-" : `[${plan.tags.join(", ")}]`;
      return (
        `[dry-run] add 文本="${plan.text}" agent="${plan.agent}" run="${plan.run}" tags=${tags} ` +
        `meta=${JSON.stringify(plan.meta)}\n`
      );
    }
    case "use": {
      return `[dry-run] use #${plan.id} grade=${plan.grade}\n`;
    }
    case "delete": {
      return `[dry-run] delete #${plan.id}（state → trashed）\n`;
    }
  }
}

function renderText(payload: Payload): string {
  switch (payload.kind) {
    case "added": {
      return payload.duplicate
        ? `记忆 #${payload.id} 已存在（重复添加，未新增记录）\n`
        : `已添加记忆 #${payload.id}\n`;
    }
    case "memory": {
      return memoryText(payload.memory);
    }
    case "list": {
      return payload.memories.length === 0
        ? "（无记忆）\n"
        : payload.memories.map(listLine).join("");
    }
    case "used": {
      return (
        `已记录使用 #${payload.memory.id} (${payload.grade}): ` +
        `stability ${fmtNum(payload.memory.stability)} → due ${payload.memory.due ?? "-"}\n`
      );
    }
    case "deleted": {
      return `已删除记忆 #${payload.id}（state=trashed）\n`;
    }
    case "stats": {
      const fsrs = payload.fsrs;
      const byState =
        payload.byState.active > 0 || payload.byState.trashed > 0
          ? `active ${payload.byState.active} · trashed ${payload.byState.trashed}`
          : "（无）";
      return [
        "记忆统计",
        `总数: ${payload.total}`,
        `按状态: ${byState}`,
        `FSRS 概览: 平均 stability ${fmtNum(fsrs.averageStability)} · ` +
          `平均 difficulty ${fmtNum(fsrs.averageDifficulty)} · ` +
          `总复习 ${fsrs.totalReps} 次 · 平均可检索性 ${fmtNum(fsrs.averageRetrievability)}`,
        "",
      ].join("\n");
    }
    case "search": {
      return payload.results.length === 0
        ? "（无结果）\n"
        : payload.results.map(searchLine).join("");
    }
    case "gc": {
      const report = payload.report;
      const toTrash = report.toTrash.length === 0 ? "无" : `#${report.toTrash.join(", #")}`;
      const toPurge = report.toPurge.length === 0 ? "无" : `#${report.toPurge.join(", #")}`;
      const prefix = payload.dryRun ? "[dry-run] " : "";
      return (
        `${prefix}gc 扫描 ${report.scanned} 条记忆；标删 ${report.toTrash.length} 条: ${toTrash}；` +
        `物理清除 ${report.toPurge.length} 条: ${toPurge}\n`
      );
    }
    case "plan": {
      return payload.plans.map(planText).join("");
    }
    case "selfList":
    case "selfCheck":
    case "selfChange": {
      return renderSelfText(payload);
    }
  }
}

function searchLine(result: SearchResultView): string {
  const run = result.runKey === "" ? "-" : result.runKey;
  return (
    `#${result.id} [${result.state}] score=${fmtNum(result.score)} · ${result.text} ` +
    `(agent=${result.agent}, run=${run})\n`
  );
}

function planJson(plan: Plan): Record<string, unknown> {
  switch (plan.op) {
    case "add": {
      return {
        op: "add",
        text: plan.text,
        agent: plan.agent,
        run: plan.run,
        tags: plan.tags,
        meta: plan.meta,
      };
    }
    case "use": {
      return { op: "use", id: plan.id, grade: plan.grade };
    }
    case "delete": {
      return { op: "delete", id: plan.id };
    }
  }
}

function renderJson(payload: Payload): string {
  switch (payload.kind) {
    case "added": {
      return `${JSON.stringify({ id: payload.id })}\n`;
    }
    case "memory": {
      return `${JSON.stringify({ memory: payload.memory })}\n`;
    }
    case "list": {
      return `${JSON.stringify({ memories: payload.memories })}\n`;
    }
    case "used": {
      return `${JSON.stringify({ memory: payload.memory })}\n`;
    }
    case "deleted": {
      return `${JSON.stringify({ id: payload.id })}\n`;
    }
    case "stats": {
      return `${JSON.stringify({
        total: payload.total,
        byState: payload.byState,
        fsrs: payload.fsrs,
      })}\n`;
    }
    case "search": {
      return `${JSON.stringify({ results: payload.results })}\n`;
    }
    case "gc": {
      return `${JSON.stringify({ dryRun: payload.dryRun, report: payload.report })}\n`;
    }
    case "plan": {
      return `${JSON.stringify({ dryRun: true, operations: payload.plans.map(planJson) })}\n`;
    }
    case "selfList":
    case "selfCheck":
    case "selfChange": {
      return renderSelfJson(payload);
    }
  }
}

function renderResult(payload: Payload, json: boolean): CliResult {
  return { exitCode: 0, stdout: json ? renderJson(payload) : renderText(payload), stderr: "" };
}

function errorText(hint: string | undefined, message: string): string {
  const lines: string[] = [];
  if (hint !== undefined) lines.push(`提示: ${hint}`);
  lines.push(`错误: ${message}`);
  return `${lines.join("\n")}\n`;
}

function toErrorResult(error: unknown, json: boolean): CliResult {
  const code: CliErrorCode =
    error instanceof CliError
      ? error.code
      : error instanceof SelfUsageError
        ? error.code
        : "runtime";
  const message = error instanceof Error ? error.message : String(error);
  const hint =
    error instanceof CliError || error instanceof SelfUsageError ? error.hint : undefined;
  const payload = { error: { code, message, ...(hint === undefined ? {} : { hint }) } };
  return {
    exitCode: code === "usage" ? 2 : 1,
    stdout: "",
    stderr: json ? `${JSON.stringify(payload)}\n` : errorText(hint, message),
  };
}

/** 是否请求 --json（供解析失败的错误输出兜底判断）。 */
const wantsJson = (argv: readonly string[]): boolean =>
  argv.includes("--json") || argv.some((arg) => arg.startsWith("--json="));

/* --------------------------------- 入口 --------------------------------- */

/**
 * CLI 主入口：解析 argv → 分派命令 → 渲染输出。
 * 任何异常统一收敛为 {exitCode, stdout, stderr}，不向外抛。
 */
export async function runCli(argv: readonly string[], env: CliEnv): Promise<CliResult> {
  try {
    return await handle(argv, env);
  } catch (error) {
    return toErrorResult(error, wantsJson(argv));
  }
}

async function handle(argv: readonly string[], env: CliEnv): Promise<CliResult> {
  const { command, args, values } = parseInvocation(argv);

  if (values["version"] === true) {
    return { exitCode: 0, stdout: `${env.version}\n`, stderr: "" };
  }
  if (values["help"] === true) {
    return { exitCode: 0, stdout: helpText(env.version), stderr: "" };
  }
  if (command === undefined) {
    throw new CliError("usage", "缺少命令", "运行 nm --help 查看可用命令");
  }
  if (command === "self") {
    // self 命令组不触碰数据库（--db/--agent/--run 不适用），校验与分派在 self.ts。
    const payload = await runSelfCommand({
      args,
      values,
      cwd: env.cwd,
      version: env.version,
    });
    return renderResult(payload, values["json"] === true);
  }
  if (!isCommand(command)) {
    throw new CliError(
      "usage",
      `未知命令 "${command}"`,
      `可用命令: ${COMMANDS.join(", ")}, self（nm --help 查看）`,
    );
  }
  assertCommandOptions(command, values);

  const dryRun = values["dry-run"] === true;
  const agent = strValue(values["agent"]) ?? basename(env.cwd);
  const run = strValue(values["run"]) ?? "";
  const dbPath = resolveDbPath({
    argvPath: strValue(values["db"]),
    env: env.env,
    homeDir: env.homeDir,
  });

  const ctx: CommandContext = {
    env,
    dryRun,
    agent,
    run,
    dbPath,
    args,
    values,
    withStore: (fn) => {
      ensureDbDir(dbPath);
      const store = new MemoryStore(dbPath);
      try {
        return fn(store);
      } finally {
        store.close();
      }
    },
  };

  const payload = await execute(command, ctx);
  return renderResult(payload, values["json"] === true);
}

/* --------------------------------- 帮助 --------------------------------- */

export function helpText(version: string): string {
  return [
    `nano-mem ${version} — agent 记忆管理 CLI`,
    "",
    "用法:",
    "  nm add <text> [--tag <t> ...] [--meta <k=v> ...]",
    "  nm get <id>",
    "  nm list [--agent <a>] [--run <r>] [--tag <t> ...] [--state <s> ...] [--limit <n>]",
    "  nm use <id> [--grade again|hard|good|easy]",
    "  nm delete <id>",
    "  nm stats",
    "  nm search <query> [--limit <n>] [--min-score <m>] [--no-touch] [--include-dormant]",
    "        [--score-weights rel=0.8,strength=0.2] [--agent <a>] [--run <r>] [--tag <t> ...]",
    "  nm gc [--dry-run] [--retention-days <n>]",
    "  nm self skill <list|check|install|update|uninstall> [--name <n>|--all]",
    "        [--target <root>] [--force] [--dry-run]",
    "  nm [--help] [--version]",
    "",
    "命令:",
    "  add <text>    添加记忆；文本为 - 时从 stdin 读取；同文本去重",
    "  get <id>      读取记忆全文（含标签/元数据/FSRS 字段）",
    "  list          列出记忆（默认仅有效 active；--state 支持惰性状态 active/dormant/trashed/all）",
    "  use <id>      记录一次使用并按评级走 FSRS 复习（默认 good）",
    "  delete <id>   软删除：state=trashed + trashed_at，FTS 同步移除",
    "  stats         总数 / 状态分布 / FSRS 概览",
    "  search <q>    全文检索并按 0.65×rel + 0.35×R 排序（--no-touch 关闭自动弱使用）",
    "  gc            标删遗忘记忆（R<0.10 或休眠>180 天）并清除超期已删记录",
    "  self skill    管理随包受管技能（安装到 .agents/skills；状态判定见 nm self skill check）",
    "",
    "全局选项:",
    "  --json        成功输出 JSON 到 stdout，错误输出 JSON 到 stderr",
    "  --db <path>   数据库路径（默认 $NANO_MEM_DB → ~/.nano-mem/mem.db）",
    "  --agent <a>   记忆归属 agent（默认当前目录名）",
    "  --run <key>   运行键",
    "  --dry-run     写命令预演，无副作用",
    "  --help        显示本帮助",
    "  --version     显示版本",
    "",
    "退出码: 0 成功 / 1 运行时错误 / 2 用法错误",
    "",
  ].join("\n");
}

/* ------------------------- 真实进程环境（main.ts 用） ------------------------- */

async function readStdinImpl(): Promise<string> {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}

function readPackageVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { readonly version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

/** 构造真实进程环境（main.ts 薄壳注入）。 */
export function nodeEnv(): CliEnv {
  return {
    cwd: process.cwd(),
    env: process.env,
    homeDir: homedir(),
    now: () => new Date(),
    readStdin: readStdinImpl,
    version: readPackageVersion(),
  };
}
