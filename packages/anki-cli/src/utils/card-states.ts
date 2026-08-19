// 卡片状态计数(搜索派生)与调度器 due tree 计数——统计类命令的基础设施。
// 自上游 card-states.utils.ts 移植, 语义与措辞保持一致。

import { z } from "zod";
import type { AnkiConnectClient } from "../client/anki-connect-client";

// ---------------------------------------------------------------------------
// 卡片状态(搜索派生)
// ---------------------------------------------------------------------------

// 真实卡片状态计数: 不受到期日与每日上限影响, 回答「各状态有多少卡片」。
export const cardStateCountsSchema = z.object({
  new: z
    .number()
    .describe(
      "Cards never studied, excluding suspended and buried. True count: " +
        "not filtered by due date and not capped by the daily new-card limit.",
    ),
  learning: z
    .number()
    .describe(
      "Cards in learning or relearning (lapsed cards are counted here), " +
        "excluding suspended and buried.",
    ),
  review: z
    .number()
    .describe(
      "Cards in the review state that are not relearning, excluding " +
        "suspended and buried. Young and mature, due or not due.",
    ),
  suspended: z.number().describe("Suspended cards, whatever their underlying state."),
  buried: z
    .number()
    .describe("Buried cards (manually or automatically), whatever their underlying state."),
});

export type CardStateCounts = z.infer<typeof cardStateCountsSchema>;

// states 块 schema(deckStats 与 collection_stats 共用)
export function cardStatesSchema(scope: string) {
  return cardStateCountsSchema.describe(
    `True card-state counts for ${scope}, computed from Anki searches ` +
      "(is:new / is:learn / is:review / is:suspended / is:buried). " +
      "Unaffected by due dates and daily limits — use these to answer " +
      '"how many cards are in state X", and `counts` to answer ' +
      '"what will I study today". The five values are mutually exclusive ' +
      "and together cover every card in scope.",
  );
}

/**
 * 每个状态的搜索片段。声明顺序即查询发出顺序。
 * is:learn 与 is:review 在 relearning(失效)卡片上重叠, 因此 review 减去
 * is:learn —— 与 Anki 文档「-is:learn is:review = 不含失效卡片的复习卡」一致。
 * 五个过滤器恰好互斥且覆盖全部卡片。
 */
const CARD_STATE_QUERIES = {
  new: "is:new -is:suspended -is:buried",
  learning: "is:learn -is:suspended -is:buried",
  review: "is:review -is:learn -is:suspended -is:buried",
  suspended: "is:suspended",
  buried: "is:buried",
} satisfies Record<keyof CardStateCounts, string>;

// 空牌组/空集合的全零状态计数
export function emptyCardStateCounts(): CardStateCounts {
  return { new: 0, learning: 0, review: 0, suspended: 0, buried: 0 };
}

// Anki 搜索双引号内仍具特殊含义的字符: \ " * _。冒号故意不转义(deck: 的值)。
const ANKI_SEARCH_SPECIALS = /[\\"*_]/g;

/**
 * 构造 deck: 作用域查询词。deck: 默认匹配该牌组及全部子孙,
 * 也匹配被筛选牌组临时借入的卡片, 一个词即覆盖整棵子树。
 * 牌组名按字面转义, 避免 JLPT_N5 误匹配 JLPT-N5 之类。
 */
export function deckScopeQuery(deckName: string): string {
  return `"deck:${deckName.replace(ANKI_SEARCH_SPECIALS, (char) => `\\${char}`)}"`;
}

/**
 * 经 findCards 统计真实卡片状态(5 个状态各一次查询, 顺序执行——
 * 客户端本来就串行化, 并行无收益)。scope 缺省统计全集合。
 * @throws 任一查询返回非数组时报错, 而不是静默记为 0
 */
export async function fetchCardStateCounts(
  client: AnkiConnectClient,
  scope?: string,
): Promise<CardStateCounts> {
  const prefix = scope ? `${scope} ` : "";
  const counts = emptyCardStateCounts();

  const entries = Object.entries(CARD_STATE_QUERIES) as [keyof CardStateCounts, string][];

  for (const [state, filter] of entries) {
    const cardIds = await client.invoke<number[]>("findCards", {
      query: `${prefix}${filter}`,
    });

    if (!Array.isArray(cardIds)) {
      throw new Error(`Invalid findCards response for state "${state}": expected array`);
    }

    counts[state] = cardIds.length;
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Due-tree 计数(getDeckStats 派生)
// ---------------------------------------------------------------------------

export const DUE_TREE_INVARIANT_NOTE =
  "Normally total === new + learning + review + other; `other` is clamped at 0, " +
  "so in rare filtered-deck / inherited-limit cases the sum can exceed total.";

export function dueTreeCountsShape(totalDescription: string) {
  return {
    total: z.number().describe(totalDescription),
    new: z
      .number()
      .describe(
        "New cards queued for study TODAY, capped by each deck's daily " +
          "new-card limit. This is not the total number of new cards — " +
          "see states.new.",
      ),
    learning: z
      .number()
      .describe(
        "Learning/relearning cards due now or today, the interday part " +
          "capped by the daily review limit.",
      ),
    review: z
      .number()
      .describe(
        "Review cards DUE TODAY, capped by each deck's daily review limit. " +
          "Not 'mature' cards and not all review cards — cards scheduled " +
          "for a future day are excluded. See states.review.",
      ),
    other: z
      .number()
      .describe(
        "Arithmetic remainder: total - new - learning - review. NOT a card " +
          "state. Dominated by review cards not due today plus new cards " +
          "beyond the daily new limit; suspended and buried cards also land " +
          "here. It can also reflect the mismatch between total (counted by " +
          "storage deck) and the scheduler buckets when a filtered deck has " +
          "borrowed cards from this deck. Use `states` for real per-state counts.",
      ),
  };
}

export type DueTreeCounts = {
  [K in keyof ReturnType<typeof dueTreeCountsShape>]: z.infer<
    ReturnType<typeof dueTreeCountsShape>[K]
  >;
};

export function dueTreeCountsSchema(options: { scope: string; total: string; note?: string }) {
  return z
    .object(dueTreeCountsShape(options.total))
    .describe(
      `Today's study queue for ${options.scope}, exactly as shown in Anki's ` +
        "deck browser: due-today counts capped by the daily new/review limits " +
        "(parent limits included), always excluding suspended and buried cards. " +
        "These are NOT card totals — use `states`. " +
        (options.note ? `${options.note} ` : "") +
        DUE_TREE_INVARIANT_NOTE,
    );
}
