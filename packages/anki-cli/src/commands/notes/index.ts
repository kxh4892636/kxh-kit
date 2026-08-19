import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { addNoteParamsSchema, runAddNote } from "./add-note-command";
import { addNotesParamsSchema, runAddNotes } from "./add-notes-command";
import { runDeleteNotes } from "./delete-notes-command";
import { runFindNotes } from "./find-notes-command";
import { runNotesInfo } from "./notes-info-command";
import { runUpdateNoteFields } from "./update-note-fields-command";

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

const parseIds = (raw: readonly string[], action: string): number[] =>
  raw.map((item) => {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) {
      throw new JsonError(`无效的笔记 ID: ${item}`, { action });
    }
    return id;
  });

const parseMediaItems = (
  raw: readonly string[],
  flag: string,
  action: string,
): Array<{ url: string; filename: string; fields: string[] }> =>
  raw.map((item) => {
    try {
      const parsed = JSON.parse(item) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("url" in parsed) ||
        !("filename" in parsed) ||
        !("fields" in parsed)
      ) {
        throw new Error("shape");
      }
      const obj = parsed as { url: string; filename: string; fields: string[] };
      if (
        typeof obj.url !== "string" ||
        typeof obj.filename !== "string" ||
        !Array.isArray(obj.fields)
      ) {
        throw new Error("shape");
      }
      return obj;
    } catch {
      throw new JsonError(
        `${flag} 需要 JSON 对象: {"url":"..","filename":"..","fields":["Front"]}`,
        { action },
      );
    }
  });

// add-batch 的笔记数组从 stdin 读入 JSON。
const readStdinJson = async (): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  if (text === "") {
    throw new JsonError("notes add-batch 需要从 stdin 读入笔记数组 JSON", {
      action: "addNotes",
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new JsonError("stdin 内容不是合法 JSON", { action: "addNotes" });
  }
};

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const notes = program
    .command("notes")
    .description("笔记管理(add/add-batch/find/info/update/delete)");

  notes
    .command("add")
    .description("添加单条笔记。批量请用 add-batch。排序字段(第一字段)必须非空。")
    .requiredOption("--deck <name>", "目标牌组名")
    .requiredOption("--model <name>", "笔记类型名")
    .option("--field <k=v>", "字段值, 可重复", collectRepeatable, [])
    .option("--tag <tag>", "标签, 可重复", collectRepeatable, [])
    .option("--allow-duplicate", "允许添加重复笔记")
    .option("--duplicate-scope <scope>", "重复检查范围: deck|collection")
    .option("--dup-scope-deck <name>", "重复检查的指定牌组")
    .option("--dup-check-children", "重复检查包含子牌组")
    .option("--dup-check-all-models", "重复检查跨全部笔记类型")
    .action(async (options: Record<string, unknown>) => {
      const raw = {
        deckName: options["deck"],
        modelName: options["model"],
        fields: parseFields(options["field"] as string[]),
        tags: (options["tag"] as string[]).length > 0 ? (options["tag"] as string[]) : undefined,
        allowDuplicate: options["allowDuplicate"] === true ? true : undefined,
        duplicateScope: options["duplicateScope"] as "deck" | "collection" | undefined,
        duplicateScopeOptions:
          options["dupScopeDeck"] !== undefined ||
          options["dupCheckChildren"] === true ||
          options["dupCheckAllModels"] === true
            ? {
                deckName: options["dupScopeDeck"] as string | undefined,
                checkChildren: options["dupCheckChildren"] === true,
                checkAllModels: options["dupCheckAllModels"] === true,
              }
            : undefined,
      };
      await runAction(ctx, (client) => runAddNote(client, addNoteParamsSchema.parse(raw)))();
    });

  notes
    .command("add-batch")
    .description(
      "批量添加笔记(≤100, 共享牌组与模板, 部分成功)。笔记数组从 stdin 读入 JSON: " +
        '[{"fields":{"Front":"..","Back":".."},"tags":["x"]}]',
    )
    .requiredOption("--deck <name>", "目标牌组名")
    .requiredOption("--model <name>", "笔记类型名")
    .option("--tag <tag>", "共享标签, 可重复", collectRepeatable, [])
    .option("--allow-duplicate", "允许添加重复笔记")
    .option("--duplicate-scope <scope>", "重复检查范围: deck|collection")
    .action(async (options: Record<string, unknown>) => {
      const stdinData = await readStdinJson();
      const raw = {
        deckName: options["deck"],
        modelName: options["model"],
        tags: (options["tag"] as string[]).length > 0 ? (options["tag"] as string[]) : undefined,
        allowDuplicate: options["allowDuplicate"] === true ? true : undefined,
        duplicateScope: options["duplicateScope"] as "deck" | "collection" | undefined,
        notes: stdinData,
      };
      await runAction(ctx, (client) => runAddNotes(client, addNotesParamsSchema.parse(raw)))();
    });

  notes
    .command("find")
    .description('按 Anki 查询语法搜索笔记(如 "deck:Spanish tag:verb")。')
    .argument("<query>", "Anki 查询语句")
    .action(async (query: string) => {
      await runAction(ctx, (client) => runFindNotes(client, { query }))();
    });

  notes
    .command("info")
    .description("获取笔记详情(字段/标签/卡片/CSS 提示), 最多 100 个。")
    .argument("<noteIds...>", "笔记 ID 列表")
    .action(async (ids: string[]) => {
      await runAction(ctx, (client) =>
        runNotesInfo(client, { notes: parseIds(ids, "notesInfo") }),
      )();
    });

  notes
    .command("update")
    .description("更新笔记字段(支持 HTML)。警告: 笔记在 Anki 浏览器中打开时更新会静默失败。")
    .argument("<id>", "笔记 ID")
    .requiredOption("--field <k=v>", "要更新的字段, 可重复", collectRepeatable, [])
    .option(
      "--audio <json>",
      '音频附件 JSON 对象 {"url":"..","filename":"..","fields":["Front"]}, 可重复',
      collectRepeatable,
      [],
    )
    .option(
      "--picture <json>",
      '图片附件 JSON 对象 {"url":"..","filename":"..","fields":["Front"]}, 可重复',
      collectRepeatable,
      [],
    )
    .action(async (id: string, options: Record<string, unknown>) => {
      const noteId = parseIds([id], "updateNoteFields")[0]!;
      const noteParams: {
        id: number;
        fields: Record<string, string>;
        audio?: Array<{ url: string; filename: string; fields: string[] }>;
        picture?: Array<{ url: string; filename: string; fields: string[] }>;
      } = { id: noteId, fields: parseFields(options["field"] as string[]) };
      if ((options["audio"] as string[]).length > 0) {
        noteParams.audio = parseMediaItems(
          options["audio"] as string[],
          "--audio",
          "updateNoteFields",
        );
      }
      if ((options["picture"] as string[]).length > 0) {
        noteParams.picture = parseMediaItems(
          options["picture"] as string[],
          "--picture",
          "updateNoteFields",
        );
      }
      await runAction(ctx, (client) => runUpdateNoteFields(client, { note: noteParams }))();
    });

  notes
    .command("delete")
    .description("永久删除笔记及其全部卡片(不可逆), 必须 --yes 确认。")
    .argument("<noteIds...>", "笔记 ID 列表")
    .option("--yes", "确认删除")
    .action(async (ids: string[], options: { yes?: boolean }) => {
      await runAction(ctx, (client) =>
        runDeleteNotes(client, {
          notes: parseIds(ids, "deleteNotes"),
          confirmDeletion: options.yes ?? false,
        }),
      )();
    });
};

// commander 可重复选项收集器: 返回数组且不把值当参数。
function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}
