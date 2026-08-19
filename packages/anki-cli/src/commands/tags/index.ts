import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { runAddTags } from "./add-command";
import { runClearUnusedTags } from "./clear-command";
import { runGetTags } from "./list-command";
import { runRemoveTags } from "./remove-command";
import { runReplaceTags } from "./replace-command";

const parseIds = (raw: readonly string[], action: string): number[] =>
  raw.map((item) => {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) {
      throw new JsonError(`无效的笔记 ID: ${item}`, { action });
    }
    return id;
  });

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const tags = program
    .command("tags")
    .description("标签管理(list/add/remove/replace/clear-unused)");

  tags
    .command("list")
    .description("列出全部标签, --pattern 按子串过滤(大小写不敏感)。")
    .option("--pattern <p>", "只返回包含该子串的标签")
    .action(async (options: { pattern?: string }) => {
      await runAction(ctx, (client) => runGetTags(client, { pattern: options.pattern }))();
    });

  tags
    .command("add")
    .description('给笔记添加标签(空格分隔, 如 --tag "t1 t2", 可重复)。')
    .argument("<noteIds...>", "笔记 ID 列表")
    .requiredOption("--tag <tags>", "要添加的标签", collectJoin, undefined)
    .action(async (ids: string[], options: { tag: string }) => {
      await runAction(ctx, (client) =>
        runAddTags(client, {
          notes: parseIds(ids, "addTags"),
          tags: options.tag,
        }),
      )();
    });

  tags
    .command("remove")
    .description('从笔记移除标签(空格分隔, 如 --tag "t1 t2", 可重复)。')
    .argument("<noteIds...>", "笔记 ID 列表")
    .requiredOption("--tag <tags>", "要移除的标签", collectJoin, undefined)
    .action(async (ids: string[], options: { tag: string }) => {
      await runAction(ctx, (client) =>
        runRemoveTags(client, {
          notes: parseIds(ids, "removeTags"),
          tags: options.tag,
        }),
      )();
    });

  tags
    .command("replace")
    .description("重命名标签(单标签, 不含空格)。")
    .argument("<noteIds...>", "笔记 ID 列表")
    .requiredOption("--from <tag>", "要替换的标签")
    .requiredOption("--to <tag>", "替换为")
    .action(async (ids: string[], options: { from: string; to: string }) => {
      await runAction(ctx, (client) =>
        runReplaceTags(client, {
          notes: parseIds(ids, "replaceTags"),
          tagToReplace: options.from,
          replaceWithTag: options.to,
        }),
      )();
    });

  tags
    .command("clear-unused")
    .description("清理未被任何笔记使用的孤儿标签(破坏性, 必须 --yes)。")
    .option("--yes", "确认清理")
    .action(async (options: { yes?: boolean }) => {
      await runAction(ctx, (client) => runClearUnusedTags(client, options.yes ?? false))();
    });
};

// 可重复 --tag 收集器: 以空格拼接各值(与上游空格分隔语义一致)。
function collectJoin(value: string, previous: string | undefined): string {
  return previous === undefined ? value : `${previous} ${value}`;
}
