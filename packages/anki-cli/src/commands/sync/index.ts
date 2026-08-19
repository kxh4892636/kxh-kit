import type { Command } from "commander";
import { runAction, type CommandContext, type CommandRegistrar } from "../../cli/command";
import { runSync } from "./sync-command";

// sync 命令组: 每组的 index.ts 导出 registerCommand, 由 import.meta.glob 自动发现。
export const registerCommand: CommandRegistrar = (program: Command, ctx: CommandContext): void => {
  program
    .command("sync")
    .description("与 AnkiWeb 同步本地集合。复习会话开始与结束时应调用, 保证多设备数据一致。")
    .action(runAction(ctx, (client) => runSync(client)));
};
