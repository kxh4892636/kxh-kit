import type { JsonValue } from "../../../cli/types";
import { computeDistribution, deckScopeQuery } from "./deck-metrics";
import { AnkiOperationError } from "../errors";
import type { AnkiPort } from "../port";
import { numberArray, objectRecord } from "../responses";

interface DeckStatsResponse {
  readonly learn_count?: number;
  readonly new_count?: number;
  readonly review_count?: number;
  readonly total_in_deck?: number;
}

interface DeckSubtree {
  readonly deckId: number;
  readonly ids: Record<string, number>;
  readonly subtree: string[];
}

const countCards = async (port: AnkiPort, query: string): Promise<number> =>
  numberArray(await port.invoke<unknown>("findCards", { query }), "findCards").length;

const stateCounts = async (port: AnkiPort, scope: string): Promise<JsonValue> => {
  const filters = {
    new: "is:new -is:suspended -is:buried",
    learning: "is:learn -is:suspended -is:buried",
    review: "is:review -is:learn -is:suspended -is:buried",
    suspended: "is:suspended",
    buried: "is:buried",
  } as const;
  const result: Record<string, number> = {};
  for (const [name, filter] of Object.entries(filters)) {
    result[name] = await countCards(port, `${scope} ${filter}`);
  }
  return result;
};

// 只保留数值型条目: 上游可能给出 null 之类占位值, 它们既不能比较也不能参与求和。
const requireDeckSubtree = async (port: AnkiPort, deck: string): Promise<DeckSubtree> => {
  const rawIds = objectRecord(await port.invoke<unknown>("deckNamesAndIds", {}), "deckNamesAndIds");
  const ids: Record<string, number> = Object.fromEntries(
    Object.entries(rawIds).filter(
      (entry: [string, unknown]): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
  const deckId = ids[deck];
  if (deckId === undefined) throw new Error(`Deck "${deck}" not found`);
  return {
    deckId,
    ids,
    subtree: Object.keys(ids).filter(
      (name: string): boolean => name === deck || name.startsWith(`${deck}::`),
    ),
  };
};

// 上游 getDeckStats 按字符串 ID 返回对象; 字段缺失记 0, 类型异常说明响应已不可信。
const createStatsReader = (
  rawStats: Readonly<Record<string, unknown>>,
): ((id: number) => DeckStatsResponse | undefined) => {
  return (id: number): DeckStatsResponse | undefined => {
    const value = rawStats[String(id)];
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    const numeric = (name: string): number => {
      const field = source[name];
      if (field === undefined) return 0;
      if (typeof field !== "number" || !Number.isFinite(field)) {
        throw new AnkiOperationError(`Invalid getDeckStats field: ${name}`, "getDeckStats");
      }
      return field;
    };
    return {
      new_count: numeric("new_count"),
      learn_count: numeric("learn_count"),
      review_count: numeric("review_count"),
      total_in_deck: numeric("total_in_deck"),
    };
  };
};

// 子牌组只贡献卡片总数, 明细(new/learning/review)只来自顶层牌组。
const collectCounts = (
  subtree: readonly string[],
  ids: Readonly<Record<string, number>>,
  readStats: (id: number) => DeckStatsResponse | undefined,
  root: DeckStatsResponse,
): Record<string, number> => {
  const total = subtree.reduce((sum: number, name: string): number => {
    const id = ids[name];
    return sum + (id === undefined ? 0 : (readStats(id)?.total_in_deck ?? 0));
  }, 0);
  return {
    total,
    new: root.new_count ?? 0,
    learning: root.learn_count ?? 0,
    review: root.review_count ?? 0,
    other: Math.max(
      0,
      total - (root.new_count ?? 0) - (root.learn_count ?? 0) - (root.review_count ?? 0),
    ),
  };
};

// 牌组为空时跳过状态与分布查询: 结果同样是全零分布, 却省下 5 次状态 findCards 与 2 次分布查询。
const emptyDeckMetrics = (
  deck: string,
  counts: Record<string, number>,
  easeBuckets: readonly number[],
  intervalBuckets: readonly number[],
): JsonValue => ({
  success: true,
  deck,
  counts,
  states: { new: 0, learning: 0, review: 0, suspended: 0, buried: 0 },
  ease: computeDistribution([], easeBuckets),
  intervals: computeDistribution([], intervalBuckets, "d"),
});

// 缓存的取值为正才算有效: 上游用 0 表示「未安排」, 计入分布会压低中位数。
const collectCardMetrics = async (
  port: AnkiPort,
  cards: readonly number[],
  scope: string,
): Promise<{ ease: number[]; intervals: number[]; states: JsonValue }> => {
  const states = await stateCounts(port, scope);
  const ease = numberArray(
    await port.invoke<unknown>("getEaseFactors", { cards }),
    "getEaseFactors",
  )
    .map((value: number): number => value / 1000)
    .filter((value: number): boolean => value > 0);
  const intervals = numberArray(
    await port.invoke<unknown>("getIntervals", { cards }),
    "getIntervals",
  ).filter((value: number): boolean => value > 0);
  return { ease, intervals, states };
};

export const deckStats = async (
  port: AnkiPort,
  deck: string,
  easeBuckets: readonly number[] = [2, 2.5, 3],
  intervalBuckets: readonly number[] = [7, 21, 90],
): Promise<JsonValue> => {
  try {
    const { deckId, ids, subtree } = await requireDeckSubtree(port, deck);
    const rawStats = objectRecord(
      await port.invoke<unknown>("getDeckStats", { decks: subtree }),
      "getDeckStats",
    );
    const readStats = createStatsReader(rawStats);
    const root = readStats(deckId);
    if (root === undefined) throw new Error(`Deck "${deck}" not found in statistics response`);

    const counts = collectCounts(subtree, ids, readStats, root);
    const scope = deckScopeQuery(deck);
    const cards = numberArray(
      await port.invoke<unknown>("findCards", { query: scope }),
      "findCards",
    );
    if (cards.length === 0) {
      return emptyDeckMetrics(deck, counts, easeBuckets, intervalBuckets);
    }

    const { ease, intervals, states } = await collectCardMetrics(port, cards, scope);
    return {
      success: true,
      deck,
      counts,
      states,
      ease: computeDistribution(ease, easeBuckets),
      intervals: computeDistribution(intervals, intervalBuckets, "d"),
    };
  } catch (error) {
    const details = error instanceof AnkiOperationError ? error.details : undefined;
    throw new AnkiOperationError(
      error instanceof Error ? error.message : String(error),
      "deckStats",
      {
        hint: "Make sure Anki is running and the deck name is valid",
        ...(details === undefined ? {} : { details }),
      },
    );
  }
};
