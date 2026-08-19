import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { runChangeDeck } from "./change-deck-command";
import { runCreateDeck } from "./create-deck-command";
import { deckStatsParamsSchema, runDeckStats } from "./deck-stats-command";
import { runListDecks } from "./list-decks-command";

// 逗号分隔正数列表解析(分布桶边界)。
const parseNumberList = (raw: string, name: string): number[] => {
  const values = raw.split(",").map((v) => Number(v.trim()));
  if (values.length === 0 || values.some((v) => !Number.isFinite(v) || v <= 0)) {
    throw new JsonError(`${name} 必须是逗号分隔的正数列表`, { action: "cli" });
  }
  return values;
};

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const decks = program.command("decks").description("牌组管理(list/stats/create/move)");

  decks
    .command("list")
    .description(
      "列出全部牌组。--stats 附带每牌组的今日学习队列统计(今日到期、受每日上限, 非卡片总数)。",
    )
    .option("--stats", "附带每牌组的今日学习队列统计")
    .action(async (options: { stats?: boolean }) => {
      await runAction(ctx, (client) =>
        runListDecks(client, { includeStats: options.stats ?? false }),
      )();
    });

  decks
    .command("stats")
    .description(
      "单牌组综合统计: counts(今日学习队列)/states(真实卡片状态)/ease/interval 分布, 均上卷子孙牌组。",
    )
    .argument("<deck>", "牌组名(如 German 或 German::Verbs)")
    .option("--ease-buckets <csv>", "难度系数分布桶边界, 默认 2.0,2.5,3.0")
    .option("--interval-buckets <csv>", "间隔天数分布桶边界, 默认 7,21,90")
    .action(async (deck: string, options: { easeBuckets?: string; intervalBuckets?: string }) => {
      const params: Record<string, unknown> = { deck };
      if (options.easeBuckets !== undefined) {
        params["easeBuckets"] = parseNumberList(options.easeBuckets, "--ease-buckets");
      }
      if (options.intervalBuckets !== undefined) {
        params["intervalBuckets"] = parseNumberList(options.intervalBuckets, "--interval-buckets");
      }
      await runAction(ctx, (client) => runDeckStats(client, deckStatsParamsSchema.parse(params)))();
    });

  decks
    .command("create")
    .description("创建空牌组, 支持 父::子(最多 2 层), 不覆盖已有牌组。")
    .argument("<name>", '牌组名(如 "Japanese::JLPT N5")')
    .action(async (name: string) => {
      await runAction(ctx, (client) => runCreateDeck(client, { deckName: name }))();
    });

  decks
    .command("move")
    .description("把卡片移动到目标牌组, 牌组不存在时自动创建。")
    .argument("<deck>", "目标牌组名")
    .argument("<cardIds...>", "要移动的卡片 ID(空格分隔)")
    .action(async (deck: string, cardIds: string[]) => {
      const cards = cardIds.map((raw) => {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) {
          throw new JsonError(`无效的卡片 ID: ${raw}`, { action: "changeDeck" });
        }
        return id;
      });
      await runAction(ctx, (client) => runChangeDeck(client, { deck, cards }))();
    });
};
