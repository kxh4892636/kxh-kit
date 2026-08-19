import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { JsonError } from "../../cli/json-error";
import { runCreateModel } from "./create-command";
import { runAddModelField } from "./field-add-command";
import { runRemoveModelField } from "./field-remove-command";
import { runRenameModelField } from "./field-rename-command";
import { runRepositionModelField } from "./field-reposition-command";
import { runModelFieldNames } from "./fields-command";
import { runModelNames } from "./list-command";
import { runModelStyling } from "./styling-command";
import { runModelTemplates } from "./templates-command";
import { runUpdateModelStyling } from "./update-styling-command";
import { runUpdateModelTemplates } from "./update-templates-command";

const parseNonNegativeInt = (raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new JsonError(`无效的数值: ${raw}`, { action: "cli" });
  }
  return value;
};

// CSS 输入: "-" 从 stdin 读(await), 其余按文件路径读取。
const readCssInput = async (raw: string): Promise<string> => {
  if (raw === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
  try {
    return readFileSync(raw, "utf-8");
  } catch {
    throw new JsonError(`无法读取 CSS 文件: ${raw}`, { action: "cli" });
  }
};

const parseTemplatesJson = (raw: string): Record<string, { Front: string; Back: string }> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    const templates = parsed as Record<string, { Front: string; Back: string }>;
    for (const [name, value] of Object.entries(templates)) {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof value.Front !== "string" ||
        typeof value.Back !== "string"
      ) {
        throw new JsonError(`--templates 需要对象: {"Card 1": {"Front": "...", "Back": "..."}}`, {
          action: "cli",
        });
      }
      void name;
    }
    return templates;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError("--templates 需要合法 JSON", { action: "cli" });
  }
};

const parseCreateTemplatesJson = (
  raw: string,
): Array<{ Name: string; Front: string; Back: string }> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("shape");
    }
    return parsed as Array<{ Name: string; Front: string; Back: string }>;
  } catch {
    throw new JsonError('--templates 需要数组 JSON: [{"Name":"Card 1","Front":"..","Back":".."}]', {
      action: "createModel",
    });
  }
};

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const models = program
    .command("models")
    .description("笔记类型管理(list/fields/styling/templates/create/update-*/field-*)");

  models
    .command("list")
    .description("列出全部笔记类型名。")
    .action(async () => {
      await runAction(ctx, (client) => runModelNames(client))();
    });

  models
    .command("fields")
    .description("某笔记类型的字段名列表(常见类型附示例字段)。")
    .argument("<name>", "笔记类型名")
    .action(async (name: string) => {
      await runAction(ctx, (client) => runModelFieldNames(client, { modelName: name }))();
    });

  models
    .command("styling")
    .description("某笔记类型的 CSS 样式。")
    .argument("<name>", "笔记类型名")
    .action(async (name: string) => {
      await runAction(ctx, (client) => runModelStyling(client, { modelName: name }))();
    });

  models
    .command("templates")
    .description("某笔记类型的卡片模板(Front/Back HTML)。")
    .argument("<name>", "笔记类型名")
    .action(async (name: string) => {
      await runAction(ctx, (client) => runModelTemplates(client, { modelName: name }))();
    });

  models
    .command("create")
    .description("创建笔记类型: 字段列表 + 卡片模板 JSON + 可选 CSS。")
    .argument("<name>", "新笔记类型名")
    .requiredOption("--field <n>", "字段名(按顺序), 可重复", collectFields, [])
    .requiredOption(
      "--templates <json>",
      '卡片模板数组 JSON: [{"Name":"Card 1","Front":"..","Back":".."}]',
    )
    .option("--css <file|->", "CSS 文件路径, - 表示从 stdin 读取")
    .option("--cloze", "创建为 cloze 类型")
    .action(async (name: string, options: Record<string, unknown>) => {
      const inOrderFields = options["field"] as string[];
      const cardTemplates = parseCreateTemplatesJson(options["templates"] as string);
      const css =
        options["css"] !== undefined ? await readCssInput(options["css"] as string) : undefined;
      await runAction(ctx, (client) =>
        runCreateModel(client, {
          modelName: name,
          inOrderFields,
          cardTemplates,
          css,
          isCloze: options["cloze"] === true,
        }),
      )();
    });

  models
    .command("update-styling")
    .description("更新笔记类型 CSS(整体替换, 影响该类型全部卡片)。")
    .argument("<name>", "笔记类型名")
    .requiredOption("--css <file|->", "CSS 文件路径, - 表示从 stdin 读取")
    .action(async (name: string, options: { css: string }) => {
      const css = await readCssInput(options.css);
      await runAction(ctx, (client) => runUpdateModelStyling(client, { modelName: name, css }))();
    });

  models
    .command("update-templates")
    .description("更新卡片模板(模板名大小写敏感, 未知名称会被拒绝)。")
    .argument("<name>", "笔记类型名")
    .requiredOption(
      "--templates <json>",
      '模板对象 JSON: {"Card 1": {"Front": "..", "Back": ".."}}',
    )
    .action(async (name: string, options: { templates: string }) => {
      const templates = parseTemplatesJson(options.templates);
      await runAction(ctx, (client) =>
        runUpdateModelTemplates(client, { modelName: name, templates }),
      )();
    });

  models
    .command("field-add")
    .description("给笔记类型添加字段(缺省追加末尾, --index 指定位置)。")
    .argument("<name>", "笔记类型名")
    .argument("<field>", "新字段名")
    .option("--index <n>", "插入位置(0 起)")
    .action(async (name: string, field: string, options: { index?: string }) => {
      await runAction(ctx, (client) =>
        runAddModelField(client, {
          modelName: name,
          fieldName: field,
          index: options.index !== undefined ? parseNonNegativeInt(options.index) : undefined,
        }),
      )();
    });

  models
    .command("field-remove")
    .description("移除字段(其全部数据被永久删除, 必须 --yes)。")
    .argument("<name>", "笔记类型名")
    .argument("<field>", "字段名")
    .option("--yes", "确认删除")
    .action(async (name: string, field: string, options: { yes?: boolean }) => {
      await runAction(ctx, (client) =>
        runRemoveModelField(client, {
          modelName: name,
          fieldName: field,
          confirmDeletion: options.yes ?? false,
        }),
      )();
    });

  models
    .command("field-rename")
    .description("重命名字段(模板引用需用 update-templates 单独更新)。")
    .argument("<name>", "笔记类型名")
    .argument("<old>", "当前字段名")
    .argument("<new>", "新字段名")
    .action(async (name: string, oldName: string, newName: string) => {
      await runAction(ctx, (client) =>
        runRenameModelField(client, {
          modelName: name,
          oldFieldName: oldName,
          newFieldName: newName,
        }),
      )();
    });

  models
    .command("field-reposition")
    .description("调整字段位置(0 起; 不改变排序字段设置)。")
    .argument("<name>", "笔记类型名")
    .argument("<field>", "字段名")
    .argument("<index>", "新位置(0 起)")
    .action(async (name: string, field: string, index: string) => {
      await runAction(ctx, (client) =>
        runRepositionModelField(client, {
          modelName: name,
          fieldName: field,
          index: parseNonNegativeInt(index),
        }),
      )();
    });
};

function collectFields(value: string, previous: string[]): string[] {
  return [...previous, value];
}
