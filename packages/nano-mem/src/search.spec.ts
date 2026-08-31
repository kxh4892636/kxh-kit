import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  cardToRow,
  initReview,
  initialCard,
  recordUse,
  rowToCard,
  type Grade,
  type MemoryRow,
} from "./fsrs";
import {
  buildMatchQuery,
  DEFAULT_WEIGHTS,
  DORMANT_R_THRESHOLD,
  effectiveStateOf,
  FORGET_R_THRESHOLD,
  gcExecute,
  gcPlan,
  memoryRetrievability,
  parseScoreWeights,
  relFromBm25,
  scoreOf,
  searchMemories,
  type SearchParams,
  type ScoreWeights,
} from "./search";
import { MemoryStore, type Memory } from "./store";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (days: number): Date => new Date(T0.getTime() + days * DAY);

/** 与 cli.ts memoryToRow 一致（Memory → fsrs 行）。 */
const toRow = (memory: Memory): MemoryRow => {
  if (memory.due === null) throw new Error("fixture: memory has no FSRS due");
  return {
    due: memory.due,
    last_review: memory.lastReview,
    stability: memory.stability,
    difficulty: memory.difficulty,
    reps: memory.reps,
    lapses: memory.lapses,
    fsrs_state: memory.fsrsState,
  };
};

/** add + 首次 Good 初始化（与 CLI addCommand 语义一致）。 */
const addFresh = (
  store: MemoryStore,
  text: string,
  options: { agent?: string; run?: string; tags?: readonly string[] } = {},
): number => {
  const added = store.add({
    text,
    agent: options.agent ?? "agent-1",
    ...(options.run === undefined ? {} : { run: options.run }),
    ...(options.tags === undefined ? {} : { tags: options.tags }),
  });
  store.updateFsrs(added.id, cardToRow(initReview(initialCard(T0), T0)));
  return added.id;
};

/** 追加一次使用（recordUse + 持久化）。 */
const useMemory = (store: MemoryStore, id: number, grade: Grade, now: Date): void => {
  const memory = store.get(id);
  if (memory === null) throw new Error(`fixture: memory ${id} missing`);
  const card = recordUse(rowToCard(toRow(memory)), grade, now);
  if (store.updateFsrs(id, cardToRow(card)) === null)
    throw new Error(`fixture: updateFsrs ${id} failed`);
};

/** 连续 6 次 Again（每 30 天）压平 stability（S ≈ 0.13，R 衰减更快）；startDay 偏移链起点。 */
const degradeSixAgain = (store: MemoryStore, id: number, startDay = 0): void => {
  for (let i = 1; i <= 6; i++) useMemory(store, id, "again", at(startDay + 30 * i));
};

/** 直接改写 FSRS 列（构造任意 R 的测试夹具；fsrsState=0 时 R 恒为 0）。 */
const setFsrsColumns = (
  db: DatabaseSync,
  id: number,
  fields: { stability: number; lastReview: string; due: string },
  fsrsState = 2,
): void => {
  db.prepare(
    "UPDATE memories SET stability = ?, difficulty = ?, due = ?, last_review = ?, " +
      "reps = ?, lapses = ?, fsrs_state = ? WHERE id = ?",
  ).run(fields.stability, 2.1, fields.due, fields.lastReview, 5, 0, fsrsState, id);
};

/** 建库辅助：外部 DatabaseSync（可供测试直接改行）+ MemoryStore。 */
const makeStore = (): { readonly db: DatabaseSync; readonly store: MemoryStore } => {
  const db = new DatabaseSync(":memory:");
  const store = new MemoryStore(db);
  return { db, store };
};

/** 默认 search 参数（一次只改动关心的项）。 */
const params = (overrides: Partial<SearchParams> = {}): SearchParams => ({
  query: "窗口",
  now: T0,
  limit: 10,
  minScore: 0.35,
  weights: DEFAULT_WEIGHTS,
  includeDormant: false,
  touch: false,
  ...overrides,
});

describe("relFromBm25（bm25 归一）", () => {
  it("bm25=0 → 0.5；越负越接近 1；单调下降", () => {
    expect(relFromBm25(0)).toBe(0.5);
    expect(relFromBm25(-1)).toBeCloseTo(1 / (1 + Math.exp(-1)), 10);
    expect(relFromBm25(-3)).toBeCloseTo(1 / (1 + Math.exp(-3)), 10);
    expect(relFromBm25(1)).toBeCloseTo(1 / (1 + Math.exp(1)), 10);
    expect(relFromBm25(-3)).toBeGreaterThan(relFromBm25(-1));
    expect(relFromBm25(-1)).toBeGreaterThan(relFromBm25(0));
    expect(relFromBm25(0)).toBeGreaterThan(relFromBm25(1));
    expect(relFromBm25(-100)).toBeCloseTo(1, 10);
    expect(relFromBm25(100)).toBeCloseTo(0, 10);
  });
});

describe("scoreOf / parseScoreWeights（融合公式与权重覆盖）", () => {
  it("score = w_rel×rel + w_strength×R，默认 0.65/0.35", () => {
    expect(scoreOf(0.8, 0.5, DEFAULT_WEIGHTS)).toBeCloseTo(0.65 * 0.8 + 0.35 * 0.5, 10);
    expect(DEFAULT_WEIGHTS).toEqual({ rel: 0.65, strength: 0.35 });
  });

  it("--score-weights rel=0.8,strength=0.2 覆盖默认权重", () => {
    const weights = parseScoreWeights("rel=0.8,strength=0.2");
    expect(weights).toEqual({ rel: 0.8, strength: 0.2 });
    expect(scoreOf(0.8, 0.5, weights)).toBeCloseTo(0.8 * 0.8 + 0.2 * 0.5, 10);
    expect(parseScoreWeights("rel=0.8, strength=0.2")).toEqual({ rel: 0.8, strength: 0.2 });
  });

  it("非法权重：缺键 / 和≠1 / 越界 / 未知键 / 重复 → 抛错", () => {
    expect(() => parseScoreWeights("rel=0.8")).toThrow(/strength/);
    expect(() => parseScoreWeights("strength=0.2")).toThrow(/rel/);
    expect(() => parseScoreWeights("rel=0.8,strength=0.3")).toThrow(/和应为 1/);
    expect(() => parseScoreWeights("rel=1.5,strength=-0.5")).toThrow(/\[0,1\]/);
    expect(() => parseScoreWeights("rel=a,strength=1")).toThrow(/\[0,1\]/);
    expect(() => parseScoreWeights("foo=1,strength=0")).toThrow(/未知键/);
    expect(() => parseScoreWeights("rel=0.5,strength=0.5,rel=0.2")).toThrow(/重复/);
    expect(() => parseScoreWeights("rel=0.5")).toThrow();
    expect(() => parseScoreWeights("rel=0.8,strength=0.2,extra=0")).toThrow();
  });
});

describe("memoryRetrievability / effectiveStateOf（惰性状态）", () => {
  it("刚初始化的记忆 R=1 → active；时间推进后 R 下降但仍 active", () => {
    const { store } = makeStore();
    const id = addFresh(store, "记忆信息很关键");
    const memory = store.get(id) as Memory;
    expect(memoryRetrievability(memory, T0)).toBe(1);
    expect(effectiveStateOf(memory, T0)).toBe("active");
    const r500 = memoryRetrievability(memory, at(500));
    expect(r500).toBeLessThan(1);
    expect(r500).toBeGreaterThan(DORMANT_R_THRESHOLD);
    expect(effectiveStateOf(memory, at(500))).toBe("active");
  });

  it("R < 0.35 → dormant；持久化 trashed 恒为 trashed", () => {
    const { db, store } = makeStore();
    const id = addFresh(store, "记忆信息很关键");
    degradeSixAgain(store, id); // last_review = t0+180d
    let memory = store.get(id) as Memory;
    // 推进 200 天：R ≈ 0.32 < 0.35（仍 > 0.10）
    const r = memoryRetrievability(memory, at(380));
    expect(r).toBeLessThan(DORMANT_R_THRESHOLD);
    expect(r).toBeGreaterThan(FORGET_R_THRESHOLD);
    expect(effectiveStateOf(memory, at(380))).toBe("dormant");

    // 持久化 trashed 不受 R 影响
    store.delete(id, at(380));
    memory = store.get(id) as Memory;
    expect(effectiveStateOf(memory, at(380))).toBe("trashed");

    // 未初始化（due 为空）→ R=0 → dormant（不抛错）
    const id2 = addFresh(store, "另一条");
    setFsrsColumns(db, id2, { stability: 0, lastReview: T0.toISOString(), due: T0.toISOString() });
    db.prepare("UPDATE memories SET due = NULL WHERE id = ?").run(id2);
    const raw = store.get(id2) as Memory;
    expect(memoryRetrievability(raw, T0)).toBe(0);
    expect(effectiveStateOf(raw, T0)).toBe("dormant");
  });
});

describe("buildMatchQuery（CJK 归一与特殊字符安全）", () => {
  it("汉字两侧空格 + lowercase + 逐 token 短语引用（空格隐式 AND）", () => {
    expect(buildMatchQuery("记忆")).toBe('"记" "忆"');
    expect(buildMatchQuery("记忆 信息")).toBe('"记" "忆" "信" "息"');
    expect(buildMatchQuery("PNPM Check")).toBe('"pnpm" "check"');
  });

  it("引号/括号/运算符等特殊字符被短语化，不产生 FTS5 语法", () => {
    expect(buildMatchQuery('记忆 "重要"')).toContain('"记" "忆"');
    const parens = buildMatchQuery("记忆(重要)");
    expect(parens).toContain('"("');
    expect(parens).toContain('")"');
    const escaped = buildMatchQuery('a"b c');
    expect(escaped).toBe('"a""b" "c"');
  });
});

/** 语料：6 条互不重叠的关键词（用于 bm25 判别与未命中语义锁定）。 */
const CORPUS = [
  "窗口管理指南",
  "窗口装饰技巧与更多长文本词汇填充内容以增加文档长度并拉低相关性",
  "记忆信息很关键",
  "pnpm 构建错误排查",
  "vitest 覆盖率检查",
  "数据库索引设计",
] as const;

const seedCorpus = (store: MemoryStore, options: { agent?: string } = {}): number[] =>
  CORPUS.map((text) => addFresh(store, text, options));

describe("searchMemories（检索排序）", () => {
  it("中文 2 字词命中：仅 FTS 命中项返回（未命中项 rel=0 不进结果），score 融合公式可复核", () => {
    const { store } = makeStore();
    const ids = seedCorpus(store);
    const results = searchMemories(store, params({ query: "窗口", now: T0 }));

    // 6 条中仅 2 条含「窗口」；其余 4 条 R=1（score=0.35 恰达默认阈值）也不会出现
    expect(results.map((hit) => hit.memory.id).sort((a, b) => a - b)).toEqual([
      ids[0],
      ids[1],
    ] as number[]);

    // 分数 = 0.65×rel + 0.35×R（R=1），rel 来自真实 bm25 归一
    const hits = store.searchFts(buildMatchQuery("窗口"));
    const bm25ById = new Map(hits.map((hit) => [hit.id, hit.bm25]));
    for (const result of results) {
      const bm25 = bm25ById.get(result.memory.id);
      expect(bm25).toBeLessThan(0);
      const expectedRel = relFromBm25(bm25 as number);
      expect(result.relevance).toBeCloseTo(expectedRel, 10);
      expect(result.strength).toBe(1);
      expect(result.score).toBeCloseTo(0.65 * expectedRel + 0.35, 10);
      expect(result.score).toBeGreaterThanOrEqual(0.35);
      expect(result.state).toBe("active");
    }
  });

  it("bm25 判别：短文档（tf 因子大）rel 高于长文档；未命中查询返回空", () => {
    const { store } = makeStore();
    const ids = seedCorpus(store);
    const results = searchMemories(store, params({ query: "窗口", now: T0, limit: 2 }));
    const byId = (id: number) => results.find((hit) => hit.memory.id === id);
    const short = byId(ids[0] as number);
    const long = byId(ids[1] as number);
    expect(short).not.toBeUndefined();
    expect(long).not.toBeUndefined();
    expect(short?.relevance).toBeGreaterThan(long?.relevance as number);
    expect(short?.relevance).toBeGreaterThan(0.5);
    expect(short?.relevance).toBeLessThan(1);
    // 无关查询：空结果，不抛错
    expect(searchMemories(store, params({ query: "不存在词", now: T0 }))).toEqual([]);
  });

  it("按 score 降序；同分按 id 降序（新记忆优先）", () => {
    const { store } = makeStore();
    seedCorpus(store);
    const results = searchMemories(store, params({ query: "窗口", now: T0 }));
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1] as (typeof results)[number];
      const curr = results[i] as (typeof results)[number];
      expect(prev.score).toBeGreaterThanOrEqual(curr.score);
      if (prev.score === curr.score) {
        expect(prev.memory.id).toBeGreaterThan(curr.memory.id);
      }
    }
  });

  it("min-score 过滤：降低 R 至阈值以下的命中项被过滤（权重=纯 R 时）", () => {
    const { db, store } = makeStore();
    const ids = seedCorpus(store);
    // A: R ≈ 0.4-0.6（active）；X: R = 1；weights = {rel:0,strength:1} → score = R
    setFsrsColumns(db, ids[0] as number, {
      stability: 1,
      lastReview: at(-30).toISOString(),
      due: at(3).toISOString(),
    });
    const rA = memoryRetrievability(store.get(ids[0] as number) as Memory, T0);
    expect(rA).toBeGreaterThan(DORMANT_R_THRESHOLD);
    const weights: ScoreWeights = { rel: 0, strength: 1 };
    const all = searchMemories(store, params({ query: "窗口", now: T0, minScore: 0.35, weights }));
    expect(all.map((hit) => hit.memory.id).sort((a, b) => a - b)).toEqual([ids[0], ids[1]]);
    const filtered = searchMemories(
      store,
      params({ query: "窗口", now: T0, minScore: (rA + 1) / 2, weights }),
    );
    expect(filtered.map((hit) => hit.memory.id).sort((a, b) => a - b)).toEqual([ids[1]]);
  });

  it("权重覆盖改变排序：默认（更重视 R）X 在 A 前；rel=0.9,strength=0.1 时 A 反超", () => {
    const { db, store } = makeStore();
    const ids = seedCorpus(store);
    const [aId, xId] = [ids[0] as number, ids[1] as number];
    // A 已使用（R≈0.4-0.6 仍 active），X 全新（R=1）
    setFsrsColumns(db, aId, {
      stability: 1,
      lastReview: at(-30).toISOString(),
      due: at(3).toISOString(),
    });
    const rA = memoryRetrievability(store.get(aId) as Memory, T0);
    expect(rA).toBeGreaterThan(DORMANT_R_THRESHOLD); // active
    expect(rA).toBeLessThan(0.727); // 保证默认权重下 X 排名更前（0.35×ΔR 不敌 0.65×Δrel 的互补）

    const byDefault = searchMemories(store, params({ query: "窗口", now: T0, limit: 2 }));
    expect(byDefault.map((hit) => hit.memory.id)).toEqual([xId, aId]);

    const byRel = searchMemories(
      store,
      params({
        query: "窗口",
        now: T0,
        limit: 2,
        weights: { rel: 0.9, strength: 0.1 },
      }),
    );
    expect(byRel.map((hit) => hit.memory.id)).toEqual([aId, xId]);

    // 分数与覆盖公式一致
    const hitA = byRel.find((hit) => hit.memory.id === aId);
    expect(hitA?.score).toBeCloseTo(0.9 * (hitA?.relevance as number) + 0.1 * rA, 10);
  });

  it("连续 use(good) 后同查询 rank 上升或不降（R 提升 → score 上升）", () => {
    const { db, store } = makeStore();
    const ids = seedCorpus(store);
    const [aId, xId] = [ids[0] as number, ids[1] as number];
    setFsrsColumns(db, aId, {
      stability: 1,
      lastReview: at(-30).toISOString(),
      due: at(3).toISOString(),
    });
    const before = searchMemories(store, params({ query: "窗口", now: T0, limit: 2 }));
    expect(before.map((hit) => hit.memory.id)).toEqual([xId, aId]);
    const rankBefore = before.findIndex((hit) => hit.memory.id === aId);

    // 同一时刻使用 good：R 回满 → 稳定值上升，score 超过 X
    useMemory(store, aId, "good", T0);
    const after = searchMemories(store, params({ query: "窗口", now: T0, limit: 2 }));
    const rankAfter = after.findIndex((hit) => hit.memory.id === aId);
    expect(rankAfter).toBeLessThanOrEqual(rankBefore);
    expect(rankAfter).toBe(0);
  });

  it("自动弱使用：命中项各记一次 Hard（--no-touch 关闭）；limit 只触摸前 N", () => {
    const { store } = makeStore();
    const ids = seedCorpus(store);
    const before = store.get(ids[3] as number) as Memory; // pnpm 构建错误排查
    expect(before.reps).toBe(1);

    const touched = searchMemories(store, params({ query: "pnpm", now: T0, touch: true }));
    expect(touched.map((hit) => hit.memory.id)).toEqual([ids[3]]);
    const after = store.get(ids[3] as number) as Memory;
    expect(after.reps).toBe(2);
    expect(after.lastReview).toBe(T0.toISOString());
    // 分数/强度为触摸前语义
    expect(touched[0]?.strength).toBe(1);
    expect(touched[0]?.score).toBeCloseTo(0.65 * (touched[0]?.relevance as number) + 0.35, 10);

    // --no-touch：零 FSRS 写入
    searchMemories(store, params({ query: "pnpm", now: at(1), touch: false }));
    expect((store.get(ids[3] as number) as Memory).reps).toBe(2);

    // limit=1 时只有最高分命中项被触摸（再建 6 条，id 递增）
    seedCorpus(store);
    const one = searchMemories(store, params({ query: "窗口", now: T0, limit: 1, touch: true }));
    expect(one).toHaveLength(1);
    const topId = (one[0] as (typeof one)[number]).memory.id;
    const [shortId, longId] = [ids[0] as number, ids[1] as number];
    const notTopId = topId === shortId ? longId : shortId;
    const notTop = store.get(notTopId) as Memory;
    expect(notTop.reps).toBe(1); // 未被触摸
  });

  it("dormant：R < 0.35 默认隐藏；includeDormant 可见且 state=dormant（仍受 min-score 约束）", () => {
    const { store } = makeStore();
    const ids = seedCorpus(store);
    degradeSixAgain(store, ids[0] as number); // last_review = t0+180d
    const r = memoryRetrievability(store.get(ids[0] as number) as Memory, at(380));
    expect(r).toBeLessThan(DORMANT_R_THRESHOLD);

    const hidden = searchMemories(store, params({ query: "窗口", now: at(380) }));
    expect(hidden.map((hit) => hit.memory.id)).not.toContain(ids[0]);

    const shown = searchMemories(
      store,
      params({ query: "窗口", now: at(380), includeDormant: true, limit: 2 }),
    );
    const dormant = shown.find((hit) => hit.memory.id === ids[0]);
    expect(dormant).not.toBeUndefined();
    expect(dormant?.state).toBe("dormant");
    expect(dormant?.strength).toBeLessThan(DORMANT_R_THRESHOLD);
    // min-score 仍然生效：分数高于阈值才可见
    expect(dormant?.score).toBeGreaterThanOrEqual(0.35);

    const tooStrict = searchMemories(
      store,
      params({ query: "窗口", now: at(380), includeDormant: true, minScore: 0.99 }),
    );
    expect(tooStrict).toEqual([]);
  });

  it("agent/run/tag 过滤作用于命中项；FTS 命中但非当前 agent 的记录被跳过", () => {
    const { store } = makeStore();
    seedCorpus(store);
    const other = store.add({
      text: "窗口记忆归属 other",
      agent: "other-agent",
    });
    store.updateFsrs(other.id, cardToRow(initReview(initialCard(T0), T0)));

    const onlyMine = searchMemories(store, params({ query: "窗口", agent: "agent-1" }));
    expect(onlyMine.map((hit) => hit.memory.id)).not.toContain(other.id);
    const onlyOther = searchMemories(store, params({ query: "窗口", agent: "other-agent" }));
    expect(onlyOther.map((hit) => hit.memory.id)).toEqual([other.id]);

    const byTag = searchMemories(store, params({ query: "记忆", tags: ["mem"] }));
    expect(byTag.length).toBe(0); // 「记忆」在无 tag 的种子语料中

    const { store: s2 } = makeStore();
    const tagged = addFresh(s2, "记忆信息很关键", { tags: ["mem"] });
    addFresh(s2, "记忆备份策略", { tags: ["ops"] });
    const byTag2 = searchMemories(s2, params({ query: "记忆", tags: ["mem"] }));
    expect(byTag2.map((hit) => hit.memory.id)).toEqual([tagged]);
  });

  it("特殊字符查询不抛错（引号/括号/通配符/运算符）且结果确定", () => {
    const { store } = makeStore();
    seedCorpus(store);
    for (const query of ['记忆 "重要"', "记忆(重要)", "a*b", "c++", "x-记忆", "!!!"]) {
      const results = searchMemories(store, params({ query }));
      expect(Array.isArray(results)).toBe(true);
    }
  });
});

describe("gcPlan / gcExecute（遗忘状态机）", () => {
  it("标删公式：R<0.10 直接标删；R<0.35 且距 last_review>180 天标删；刚休眠的不标删", () => {
    const { db, store } = makeStore();
    const ids = seedCorpus(store);
    const [flourishing, lowR, longDormant, briefDormant] = [
      ids[0] as number,
      ids[1] as number,
      ids[2] as number,
      ids[3] as number,
    ];
    // F1: 正常使用（R 高）→ 不删
    // F2: R < 0.10（New 态卡 R 恒为 0）→ 标删
    setFsrsColumns(
      db,
      lowR,
      {
        stability: 0.001,
        lastReview: at(-100).toISOString(),
        due: at(-1).toISOString(),
      },
      0,
    );
    expect(memoryRetrievability(store.get(lowR) as Memory, T0)).toBeLessThan(FORGET_R_THRESHOLD);
    // F3: R < 0.35 且 200 天未使用 → 标删（>= 180 天边界之上）
    degradeSixAgain(store, longDormant); // last_review = t0+180d
    expect(memoryRetrievability(store.get(longDormant) as Memory, at(380))).toBeLessThan(0.35);
    // F4: R < 0.35 但 150 天（< 180）→ 不标删（链起点偏移，最后复习在 t0+230d）
    degradeSixAgain(store, briefDormant, 50); // last_review = t0+230d
    const briefR = memoryRetrievability(store.get(briefDormant) as Memory, at(380));
    expect(briefR).toBeLessThan(0.35);
    expect(briefR).toBeGreaterThan(FORGET_R_THRESHOLD);

    const now = at(380);
    const report = gcPlan(store, { now, retentionDays: 30 });
    expect(report.scanned).toBe(6);
    expect([...report.toTrash].sort((a, b) => a - b)).toEqual(
      [lowR, longDormant].sort((a, b) => a - b),
    );
    expect(report.toTrash).not.toContain(flourishing);
    expect(report.toTrash).not.toContain(briefDormant);
  });

  it("清除公式：state=trashed 且 trashed_at 超保留期 → 物理清除；未超期保留；--retention-days 可调", () => {
    const { store } = makeStore();
    const ids = seedCorpus(store);
    const [old, fresh] = [ids[0] as number, ids[1] as number];
    store.delete(old, at(-40)); // 40 天前删除
    store.delete(fresh, at(-10)); // 10 天前删除
    expect(store.get(old)?.state).toBe("trashed");
    expect(store.get(fresh)?.state).toBe("trashed");

    const report = gcPlan(store, { now: T0, retentionDays: 30 });
    expect(report.toPurge).toEqual([old]);

    // 保留期调大 → 不清除
    const lenient = gcPlan(store, { now: T0, retentionDays: 45 });
    expect(lenient.toPurge).toEqual([]);

    // 执行模式：清除 old（get 为 null），fresh 仍在
    gcExecute(store, { now: T0, retentionDays: 30 });
    expect(store.get(old)).toBeNull();
    expect(store.get(fresh)?.state).toBe("trashed");
  });

  it("执行模式：标删后 state=trashed、FTS 移除、trashed_at=now；已删记录之外零副作用", () => {
    const { db, store } = makeStore();
    const ids = seedCorpus(store);
    const [victim, keeper] = [ids[0] as number, ids[1] as number];
    setFsrsColumns(
      db,
      victim,
      {
        stability: 0.001,
        lastReview: at(-100).toISOString(),
        due: at(-1).toISOString(),
      },
      0,
    );

    // 执行前的查询可用：victim 与 keeper 都在「记忆」语料（victim 的窗口行将移除）
    expect(store.searchFts(buildMatchQuery("窗口")).map((hit) => hit.id)).toContain(victim);

    const before = store.get(keeper) as Memory;
    gcExecute(store, { now: T0, retentionDays: 30 });
    const trashed = store.get(victim);
    expect(trashed?.state).toBe("trashed");
    expect(trashed?.trashedAt).toBe(T0.toISOString());
    // FTS 同步移除：victim 不再命中（keeper 仍在）
    expect(store.searchFts(buildMatchQuery("窗口")).map((hit) => hit.id)).toContain(keeper);
    expect(store.searchFts(buildMatchQuery("窗口")).map((hit) => hit.id)).not.toContain(victim);
    // keeper 完全不变
    const after = store.get(keeper) as Memory;
    expect(after).toEqual(before);
    expect(after.state).toBe("active");

    // 已 trashed 列删除后 id 不再命中 FTS（其 rowid 已移除）
    const raw = db.prepare("SELECT state FROM memories WHERE id = ?").get(victim);
    expect(raw?.["state"]).toBe("trashed");
  });

  it("purge 幂等；trashed_at 缺失/非法时不物理清除", () => {
    const { db, store } = makeStore();
    const ids = seedCorpus(store);
    const [idA, idB, idC] = [ids[0] as number, ids[1] as number, ids[2] as number];
    store.delete(idA, at(-40));
    store.delete(idB, at(-40));
    store.delete(idC, at(-40));
    // 缺失 / 非法 trashed_at 的异常行不触发清除
    db.prepare("UPDATE memories SET trashed_at = NULL WHERE id = ?").run(idB);
    db.prepare("UPDATE memories SET trashed_at = 'not-a-date' WHERE id = ?").run(idC);

    const report = gcPlan(store, { now: T0, retentionDays: 30 });
    expect(report.toPurge).toEqual([idA]);
    gcExecute(store, { now: T0, retentionDays: 30 });
    expect(store.get(idA)).toBeNull();
    expect(store.get(idB)?.state).toBe("trashed");
    expect(store.get(idC)?.state).toBe("trashed");
  });
});
