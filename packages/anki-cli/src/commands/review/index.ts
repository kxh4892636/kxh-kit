import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { runReviewSession, type ReviewIo } from "./review-command";

const parsePositiveInt = (raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new JsonError(`无效的数值: ${raw}`, { action: "review" });
  }
  return value;
};

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  program
    .command("review")
    .description(
      "交互式复习会话: sync → 拉取到期卡片 → 逐张输出问题 JSON, 从 stdin 读评分(1-4, q 退出)。Ctrl+C 输出汇总后退出。",
    )
    .option("--deck <name>", "限定牌组(缺省全部)")
    .option("--limit <n>", "本次会话最多卡片数(1-50, 默认 10)")
    .option("--include-new", "包含新卡")
    .option("--no-sync", "跳过会话开始时的 AnkiWeb 同步")
    .action(
      async (options: {
        deck?: string;
        limit?: string;
        includeNew?: boolean;
        sync?: boolean;
      }): Promise<void> => {
        await runAction(ctx, async (client): Promise<unknown> => {
          const rl = createInterface({ input: process.stdin });

          // SIGINT: 关闭 readline 使挂起的 question 返回 null, 循环自然收尾输出汇总。
          const onSigint = (): void => {
            rl.close();
          };
          process.once("SIGINT", onSigint);

          const io: ReviewIo = {
            readLine: async () => {
              try {
                return await rl.question("");
              } catch {
                return null;
              }
            },
            writeOut: (text) => {
              process.stdout.write(text);
            },
            writeErr: (text) => {
              process.stderr.write(text);
            },
          };

          try {
            const summary = await runReviewSession(client, io, {
              deck: options.deck,
              limit: options.limit !== undefined ? parsePositiveInt(options.limit) : undefined,
              includeNew: options.includeNew ?? false,
              syncFirst: options.sync ?? true,
            });
            rl.close();
            return summary;
          } finally {
            process.removeListener("SIGINT", onSigint);
            rl.close();
          }
        })();
      },
    );
};
