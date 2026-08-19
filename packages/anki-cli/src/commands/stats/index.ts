import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { runCollectionStats } from "./collection-command";
import { reviewStatsParamsSchema, runReviewStats } from "./review-command";

const parseBucketList = (raw: string, name: string): number[] => {
  const values = raw.split(",").map((v) => Number(v.trim()));
  if (values.length === 0 || values.some((v) => !Number.isFinite(v) || v <= 0)) {
    throw new JsonError(`${name} 必须是逗号分隔的正数列表`, { action: "cli" });
  }
  return values;
};

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const stats = program.command("stats").description("统计(collection/review)");

  stats
    .command("collection")
    .description("全集合统计: counts/per_deck(今日学习队列) + states(真实状态计数) + 分布。")
    .option("--ease-buckets <csv>", "难度系数分布桶边界, 默认 2.0,2.5,3.0")
    .option("--interval-buckets <csv>", "间隔天数分布桶边界, 默认 7,21,90")
    .action(async (options: { easeBuckets?: string; intervalBuckets?: string }) => {
      const params: Record<string, unknown> = {};
      if (options.easeBuckets !== undefined) {
        params["easeBuckets"] = parseBucketList(options.easeBuckets, "--ease-buckets");
      }
      if (options.intervalBuckets !== undefined) {
        params["intervalBuckets"] = parseBucketList(options.intervalBuckets, "--interval-buckets");
      }
      await runAction(ctx, (client) => runCollectionStats(client, params))();
    });

  stats
    .command("review")
    .description(
      "复习历史统计(时间模式/保持率/连续天数)。--deck 缺省分析全集合(精确牌组, 不含子牌组)。",
    )
    .requiredOption("--start <YYYY-MM-DD>", "开始日期(必填)")
    .option("--end <YYYY-MM-DD>", "结束日期(默认今天)")
    .option("--deck <name>", "限定牌组(缺省全集合)")
    .action(async (options: { start: string; end?: string; deck?: string }) => {
      const raw: Record<string, unknown> = { startDate: options.start };
      if (options.end !== undefined) {
        raw["endDate"] = options.end;
      }
      if (options.deck !== undefined) {
        raw["deck"] = options.deck;
      }
      await runAction(ctx, (client) =>
        runReviewStats(client, reviewStatsParamsSchema.parse(raw)),
      )();
    });
};
