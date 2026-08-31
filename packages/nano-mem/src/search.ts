/**
 * nano-mem 检索排序与遗忘状态机（issue 04）。
 *
 * 检索评分（spec「检索评分」）：
 * - score = w_rel × rel + w_strength × R，默认 0.65/0.35，--score-weights 覆盖；
 * - rel = 1 / (1 + exp(bm25))，bm25 来自 FTS5（命中值 ≤ 0，越负越特异 → rel ∈ (0.5, 1)）；
 *   未命中项 rel = 0（不排序、不进结果——搜索只返回 FTS 命中项，避免无相关性的
 *   记忆因 R 高而上榜）；
 * - R = retrievability(card, now)（FSRS 即时计算，时间注入贯穿）。
 *
 * 遗忘状态机（惰性，ADR-0002）：
 * - 持久化 state 只表达显式转移（delete → trashed）；
 * - 查询时计算有效状态：trashed（持久化）→ dormant（R < 0.35）→ active；
 * - search 默认隐藏 dormant（--include-dormant 可见），trashed 恒排除；
 * - gc：R < 0.10，或 R < 0.35 且距 last_review 超过 180 天 → 标 trashed；
 *   已 trashed 且 trashed_at 超过保留期（默认 30 天）→ 物理清除。
 */

import { cardToRow, recordUse, retrievability, rowToCard, type MemoryRow } from "./fsrs";
import { cjkTokenize } from "./split";
import type { Memory, MemoryStore } from "./store";

/** R 低于该值视为休眠（有效状态 dormant）。 */
export const DORMANT_R_THRESHOLD = 0.35;
/** R 低于该值由 gc 直接标记删除。 */
export const FORGET_R_THRESHOLD = 0.1;
/** R < 0.35 且距 last_review 超过该天数 → gc 标记删除。 */
export const GC_DORMANCY_DAYS = 180;
/** trashed 记录物理清除的默认保留天数。 */
export const GC_RETENTION_DAYS_DEFAULT = 30;
/** search 默认返回条数上限。 */
export const SEARCH_LIMIT_DEFAULT = 10;
/** search 默认最小分数阈值。 */
export const SEARCH_MIN_SCORE_DEFAULT = 0.35;
export const W_REL_DEFAULT = 0.65;
export const W_STRENGTH_DEFAULT = 0.35;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 惰性判定的有效状态（ADR-0002 三态）。 */
export type EffectiveState = "active" | "dormant" | "trashed";

/** search 结果中出现的有效状态（trashed 恒排除）。 */
export type SearchState = Exclude<EffectiveState, "trashed">;

/** 融合权重：w_rel + w_strength = 1。 */
export interface ScoreWeights {
  readonly rel: number;
  readonly strength: number;
}

/** 默认权重。 */
export const DEFAULT_WEIGHTS: ScoreWeights = { rel: W_REL_DEFAULT, strength: W_STRENGTH_DEFAULT };

/** bm25（≤ 0，越负越特异）→ 相关性 rel ∈ (0.5, 1]；bm25 = 0 → 0.5。 */
export function relFromBm25(bm25: number): number {
  return 1 / (1 + Math.exp(bm25));
}

/** 融合分数：score = w_rel × rel + w_strength × R。 */
export function scoreOf(rel: number, r: number, weights: ScoreWeights): number {
  return weights.rel * rel + weights.strength * r;
}

/** 解析 --score-weights "rel=0.8,strength=0.2"；校验值域 [0,1] 与权重和 = 1。 */
export function parseScoreWeights(raw: string): ScoreWeights {
  const parsed: Partial<Record<"rel" | "strength", number>> = {};
  for (const part of raw.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      throw new Error(`--score-weights 项 "${part}" 缺少 =`);
    }
    const key = part.slice(0, eq).trim();
    if (key !== "rel" && key !== "strength") {
      throw new Error(`--score-weights 未知键 "${key}"（应为 rel/strength）`);
    }
    const value = Number(part.slice(eq + 1).trim());
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`--score-weights 键 ${key} 的值应在 [0,1]`);
    }
    if (parsed[key] !== undefined) {
      throw new Error(`--score-weights 键 ${key} 重复`);
    }
    parsed[key] = value;
  }
  const rel = parsed.rel;
  const strength = parsed.strength;
  if (rel === undefined || strength === undefined) {
    throw new Error("--score-weights 需要 rel 与 strength 两个键");
  }
  if (Math.abs(rel + strength - 1) > 1e-9) {
    throw new Error("--score-weights 权重和应为 1");
  }
  return { rel, strength };
}

/** Memory → fsrs.MemoryRow；due 为空（未初始化 New 卡）返回 null。 */
function memoryToFsrsRow(memory: Memory): MemoryRow | null {
  if (memory.due === null) return null;
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

/** 记忆当前可检索性 R ∈ [0,1]；未初始化（New/due 空）为 0。 */
export function memoryRetrievability(memory: Memory, now: Date): number {
  const row = memoryToFsrsRow(memory);
  return row === null ? 0 : retrievability(rowToCard(row), now);
}

/** 惰性有效状态：trashed（持久化）→ dormant（R < 0.35）→ active。 */
export function effectiveStateOf(memory: Memory, now: Date): EffectiveState {
  if (memory.state === "trashed") return "trashed";
  return memoryRetrievability(memory, now) < DORMANT_R_THRESHOLD ? "dormant" : "active";
}

/**
 * 查询 → FTS5 MATCH 检索式：与写入同构（cjkTokenize）后，每个 token 以短语引用，
 * 空格隐式 AND。引号内字符按字面处理，避免用户输入中的 FTS5 特殊语法（引号/括号/
 * 运算符/前缀符）导致 MATCH 语法错误或语义劫持。
 */
export function buildMatchQuery(query: string): string {
  const tokens = cjkTokenize(query)
    .split(/\s+/)
    .filter((token) => token !== "");
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" ");
}

/** search 参数；now 为时间注入点。 */
export interface SearchParams {
  readonly query: string;
  readonly now: Date;
  readonly limit: number;
  readonly minScore: number;
  readonly weights: ScoreWeights;
  /** 默认隐藏 dormant（R < 0.35）的记忆。 */
  readonly includeDormant: boolean;
  /** 命中项自动弱使用（每次 recordUse Hard）；false 时零 FSRS 写入。 */
  readonly touch: boolean;
  readonly agent?: string;
  readonly run?: string;
  readonly tags?: readonly string[];
}

/** search 命中项：分数/相关性/强度均为触摸前语义（自动弱使用是返回后的副作用）。 */
export interface SearchHit {
  readonly memory: Memory;
  readonly state: SearchState;
  readonly score: number;
  readonly relevance: number;
  readonly strength: number;
}

/**
 * 检索：只返回 FTS 命中项（未命中项 rel = 0，不进结果），按 score 降序（同分 id 降序，
 * 新记忆优先），应用 min-score 与 dormant 过滤后截取 limit；
 * touch = true 时对返回项各记一次 Hard（recordUse）。
 */
export function searchMemories(store: MemoryStore, params: SearchParams): SearchHit[] {
  const match = buildMatchQuery(params.query);
  if (match === "") return [];
  const candidates = new Map<number, Memory>();
  for (const memory of store.list({ state: "active", ...candidateFilters(params) })) {
    candidates.set(memory.id, memory);
  }
  const hits: SearchHit[] = [];
  for (const fts of store.searchFts(match)) {
    const memory = candidates.get(fts.id);
    if (memory === undefined) continue; // 防御：FTS 行与记忆行不一致（如硬删后残留）
    const relevance = relFromBm25(fts.bm25);
    const strength = memoryRetrievability(memory, params.now);
    const score = scoreOf(relevance, strength, params.weights);
    const state: SearchState = strength < DORMANT_R_THRESHOLD ? "dormant" : "active";
    if (!params.includeDormant && state === "dormant") continue;
    if (score < params.minScore) continue;
    hits.push({ memory, state, score, relevance, strength });
  }
  hits.sort((a, b) => b.score - a.score || b.memory.id - a.memory.id);
  const top = hits.slice(0, params.limit);
  if (params.touch) {
    // 自动弱使用：返回的记忆各记一次 Hard（--no-touch 关闭）。
    for (const hit of top) {
      const row = memoryToFsrsRow(hit.memory);
      if (row === null) continue;
      store.updateFsrs(hit.memory.id, cardToRow(recordUse(rowToCard(row), "hard", params.now)));
    }
  }
  return top;
}

function candidateFilters(params: SearchParams): Pick<SearchParams, "agent" | "run" | "tags"> {
  return {
    ...(params.agent === undefined ? {} : { agent: params.agent }),
    ...(params.run === undefined ? {} : { run: params.run }),
    ...(params.tags === undefined ? {} : { tags: params.tags }),
  };
}

/** gc 参数；now 为时间注入点。 */
export interface GcOptions {
  readonly now: Date;
  /** trashed 记录物理清除的保留期（天，默认 30）。 */
  readonly retentionDays: number;
}

/** gc 扫描报告（dry-run 与执行共用同一结构）。 */
export interface GcReport {
  /** 扫描的记忆总数（含已 trashed）。 */
  readonly scanned: number;
  /** 待标删 id：R < 0.10，或（R < 0.35 且距 last_review > 180 天）。 */
  readonly toTrash: readonly number[];
  /** 待物理清除 id：state=trashed 且 trashed_at 超保留期。 */
  readonly toPurge: readonly number[];
}

/**
 * gc 扫描（纯只读）：按上述判定公式产出 { toTrash, toPurge }。
 * - 标删公式：R < 0.10 直接标删；R < 0.35 且 (now - last_review) > 180 天 → 标删
 *   （dormant 持续时长以 last_review 近似：R 自 last_review 后单调衰减，
 *   超出 180 天 ≈ 休眠已持续较久，可复核）；
 * - 清除公式：state=trashed 且 (now - trashed_at) > retentionDays → 物理删除。
 */
export function gcPlan(store: MemoryStore, options: GcOptions): GcReport {
  const now = options.now.getTime();
  const dormancyCutoff = now - GC_DORMANCY_DAYS * DAY_MS;
  const purgeCutoff = now - options.retentionDays * DAY_MS;
  const memories = store.list();
  const toTrash: number[] = [];
  const toPurge: number[] = [];
  for (const memory of memories) {
    if (memory.state !== "trashed") {
      const r = memoryRetrievability(memory, options.now);
      const longDormant =
        memory.lastReview !== null && new Date(memory.lastReview).getTime() < dormancyCutoff;
      if (r < FORGET_R_THRESHOLD || (r < DORMANT_R_THRESHOLD && longDormant)) {
        toTrash.push(memory.id);
      }
    } else if (memory.trashedAt !== null) {
      const trashedAt = new Date(memory.trashedAt).getTime();
      if (Number.isFinite(trashedAt) && trashedAt < purgeCutoff) {
        toPurge.push(memory.id);
      }
    }
  }
  return { scanned: memories.length, toTrash, toPurge };
}

/** gc 执行：标删（setState → trashed + FTS 移除）→ 物理清除（purge）。 */
export function gcExecute(store: MemoryStore, options: GcOptions): GcReport {
  const report = gcPlan(store, options);
  for (const id of report.toTrash) {
    store.setState(id, "trashed", options.now);
  }
  for (const id of report.toPurge) {
    store.purge(id);
  }
  return report;
}
