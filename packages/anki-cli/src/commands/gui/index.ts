import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { runGuiBrowse, runGuiSelectCard, runGuiSelectedNotes } from "./browse-commands";
import {
  runGuiAddCards,
  runGuiDeckBrowser,
  runGuiDeckOverview,
  runGuiEditNote,
} from "./dialog-commands";
import {
  runGuiCurrentCard,
  runGuiShowAnswer,
  runGuiShowQuestion,
  runGuiUndo,
} from "./view-commands";

const parseId = (raw: string, action: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new JsonError(`无效的 ID: ${raw}`, { action });
  }
  return id;
};

// --field k=v 可重复 → fields record
const parseFields = (pairs: readonly string[]): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new JsonError(`--field 需要 k=v 形式: "${pair}"`, { action: "cli" });
    }
    fields[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return fields;
};

// GUI 组: 仅用于笔记编辑/创建与牌组管理流程, 非复习会话。
export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const gui = program
    .command("gui")
    .description("驱动 Anki 桌面界面(编辑/创建与牌组管理流程, 非复习会话)");

  gui
    .command("browse")
    .description("打开卡片浏览器并搜索(返回匹配的卡片 ID)。")
    .argument("<query>", 'Anki 查询(如 "deck:Spanish tag:verb")')
    .option("--order <asc|desc>", "浏览器内排序方向")
    .option("--column <id>", "排序列(如 noteFld, cardDue)")
    .action(async (query: string, options: { order?: string; column?: string }) => {
      const reorderCards =
        options.order !== undefined || options.column !== undefined
          ? {
              order: (options.order === "desc" ? "descending" : "ascending") as
                | "ascending"
                | "descending",
              columnId: options.column ?? "noteFld",
            }
          : undefined;
      await runAction(ctx, (client) => runGuiBrowse(client, { query, reorderCards }))();
    });

  gui
    .command("select")
    .description("在卡片浏览器中选中指定卡片(浏览器须已打开)。")
    .argument("<cardId>", "卡片 ID")
    .action(async (cardId: string) => {
      await runAction(ctx, (client) =>
        runGuiSelectCard(client, parseId(cardId, "guiSelectCard")),
      )();
    });

  gui
    .command("selected-notes")
    .description("获取卡片浏览器中当前选中的笔记 ID。")
    .action(async () => {
      await runAction(ctx, (client) => runGuiSelectedNotes(client))();
    });

  gui
    .command("add-cards")
    .description("打开添加卡片对话框并预填笔记内容(供用户在 GUI 中确认创建)。")
    .requiredOption("--deck <name>", "目标牌组名")
    .requiredOption("--model <name>", "笔记类型名")
    .requiredOption("--field <k=v>", "字段值, 可重复", collectRepeatable, [])
    .option("--tag <tag>", "标签, 可重复", collectRepeatable, [])
    .action(async (options: Record<string, unknown>) => {
      await runAction(ctx, (client) =>
        runGuiAddCards(client, {
          note: {
            deckName: options["deck"] as string,
            modelName: options["model"] as string,
            fields: parseFields(options["field"] as string[]),
            tags:
              (options["tag"] as string[]).length > 0 ? (options["tag"] as string[]) : undefined,
          },
        }),
      )();
    });

  gui
    .command("edit")
    .description("打开指定笔记的编辑器(供用户在 GUI 中手动编辑)。")
    .argument("<noteId>", "笔记 ID")
    .action(async (noteId: string) => {
      await runAction(ctx, (client) => runGuiEditNote(client, parseId(noteId, "guiEditNote")))();
    });

  gui
    .command("deck-overview")
    .description("打开指定牌组的概览对话框(统计与学习选项)。")
    .argument("<deck>", "牌组名")
    .action(async (deck: string) => {
      await runAction(ctx, (client) => runGuiDeckOverview(client, deck))();
    });

  gui
    .command("deck-browser")
    .description("打开牌组浏览器(显示全部牌组)。")
    .action(async () => {
      await runAction(ctx, (client) => runGuiDeckBrowser(client))();
    });

  gui
    .command("current-card")
    .description("获取复习模式中当前显示的卡片信息(编辑/创建流程核对用)。")
    .action(async () => {
      await runAction(ctx, (client) => runGuiCurrentCard(client))();
    });

  gui
    .command("show-question")
    .description("显示当前卡片的正面(编辑/创建流程核对用, 非复习编排)。")
    .action(async () => {
      await runAction(ctx, (client) => runGuiShowQuestion(client))();
    });

  gui
    .command("show-answer")
    .description("显示当前卡片的背面(编辑/创建流程核对用, 非复习编排)。")
    .action(async () => {
      await runAction(ctx, (client) => runGuiShowAnswer(client))();
    });

  gui
    .command("undo")
    .description("撤销 Anki 中的上一个操作。")
    .action(async () => {
      await runAction(ctx, (client) => runGuiUndo(client))();
    });
};

function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}
