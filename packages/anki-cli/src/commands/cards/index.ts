import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { runGetDueCards } from "./due-command";
import { runGetCards } from "./list-command";
import { runPresentCard } from "./present-command";
import { runRateCard } from "./rate-command";

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const cards = program.command("cards").description("卡片复习(due/list/present/rate)");

  cards
    .command("due")
    .description("拉取到期卡片(默认含学习中, 不含新卡)。复习前先 sync。")
    .option("--deck <name>", "限定牌组(缺省为全部)")
    .option("--limit <n>", "最多返回数量(1-50, 默认 10)", parsePositiveInt, undefined)
    .option("--no-learning", "不含学习中的卡片")
    .option("--include-new", "包含新卡(结果会区分 new/due 计数)")
    .action(
      async (options: {
        deck?: string;
        limit?: number;
        learning?: boolean;
        includeNew?: boolean;
      }) => {
        await runAction(ctx, (client) =>
          runGetDueCards(client, {
            deckName: options.deck,
            limit: options.limit,
            includeLearning: options.learning ?? true,
            includeNew: options.includeNew ?? false,
          }),
        )();
      },
    );

  cards
    .command("list")
    .description("按状态过滤拉取卡片(单一状态, 默认 due)。")
    .option("--deck <name>", "限定牌组")
    .option("--state <state>", "状态: due|new|learning|suspended|buried(默认 due)")
    .option("--limit <n>", "最多返回数量(1-50, 默认 10)", parsePositiveInt, undefined)
    .action(async (options: { deck?: string; state?: string; limit?: number }) => {
      await runAction(ctx, (client) =>
        runGetCards(client, {
          deckName: options.deck,
          cardState: options.state as
            | "due"
            | "new"
            | "learning"
            | "suspended"
            | "buried"
            | undefined,
          limit: options.limit,
        }),
      )();
    });

  cards
    .command("present")
    .description("呈现单张卡片(按模板方向渲染正反面), --answer 附带背面。")
    .argument("<id>", "卡片 ID")
    .option("--answer", "同时输出背面内容")
    .action(async (id: string, options: { answer?: boolean }) => {
      const cardId = parsePositiveInt(id);
      await runAction(ctx, (client) =>
        runPresentCard(client, { cardId, showAnswer: options.answer ?? false }),
      )();
    });

  cards
    .command("rate")
    .description("提交评分(1=Again, 2=Hard, 3=Good, 4=Easy)更新调度。")
    .argument("<id>", "卡片 ID")
    .argument("<rating>", "评分 1-4")
    .action(async (id: string, rating: string) => {
      await runAction(ctx, (client) =>
        runRateCard(client, {
          cardId: parsePositiveInt(id),
          rating: parsePositiveInt(rating),
        }),
      )();
    });
};

const parsePositiveInt = (raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new JsonError(`无效的数值: ${raw}`, { action: "cli" });
  }
  return value;
};
