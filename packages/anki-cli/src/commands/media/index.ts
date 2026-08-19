import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { runDeleteMediaFile } from "./delete-command";
import { runGetMediaFilesNames } from "./list-command";
import { runRetrieveMediaFile, writeRetrievedBase64 } from "./retrieve-command";
import { runStoreMediaFile } from "./store-command";

export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  const media = program.command("media").description("媒体管理(list/get/store/delete)");

  media
    .command("list")
    .description("列出 collection.media 中的媒体文件, --pattern 过滤(如 *.mp3)。")
    .option("--pattern <p>", "glob 风格过滤")
    .action(async (options: { pattern?: string }) => {
      await runAction(ctx, (client) =>
        runGetMediaFilesNames(client, { pattern: options.pattern }),
      )();
    });

  media
    .command("get")
    .description("取回媒体文件(base64 输出到 stdout JSON; --out 直接写入文件)。")
    .argument("<filename>", "媒体文件名")
    .option("--out <path>", "将 base64 解码后写入该文件")
    .action(async (filename: string, options: { out?: string }) => {
      await runAction(ctx, async (client) => {
        const result = await runRetrieveMediaFile(client, { filename });
        if (options.out !== undefined && result.found && result.data !== null) {
          writeRetrievedBase64(result.data, options.out);
        }
        return result;
      })();
    });

  media
    .command("store")
    .description("存入媒体文件(--file 本地路径 | --url 远程地址 | --data base64, 三选一)。")
    .requiredOption("--filename <name>", "保存的文件名")
    .option("--file <path>", "本地文件路径(仅媒体类型)")
    .option("--url <url>", "远程 URL(http/https, 公网地址)")
    .option("--data <base64>", "base64 内容")
    .option("--delete-original", "同名文件已存在时先删除(默认行为)")
    .action(async (options: Record<string, unknown>) => {
      const sources = ["file", "url", "data"].filter((key) => options[key] !== undefined);
      if (sources.length !== 1) {
        throw new Error("Must provide exactly one of --file, --url, or --data");
      }
      await runAction(ctx, (client) =>
        runStoreMediaFile(client, {
          filename: options["filename"] as string,
          data: options["data"] as string | undefined,
          path: options["file"] as string | undefined,
          url: options["url"] as string | undefined,
          deleteExisting: true,
        }),
      )();
    });

  media
    .command("delete")
    .description("删除媒体文件(破坏性, 必须 --yes)。")
    .argument("<filename>", "媒体文件名")
    .option("--yes", "确认删除")
    .action(async (filename: string, options: { yes?: boolean }) => {
      await runAction(ctx, (client) =>
        runDeleteMediaFile(client, {
          filename,
          confirmed: options.yes ?? false,
        }),
      )();
    });
};
