import { Command } from "commander";
import { CLI_VERSION } from "../version";
import type { CommandContext, CommandRegistrar } from "./command";

// 自动发现命令组: 后续 issue 只新增 commands/<组>/ 目录与文件,
// 不改任何共享文件, 保证并行 worktree 的改动集合互不相交。
const commandGroups = import.meta.glob<{ registerCommand: CommandRegistrar }>(
  "../commands/*/index.ts",
  { eager: true },
);

export const buildProgram = (ctx: CommandContext): Command => {
  const program = new Command();

  program
    .name("anki-cli")
    .description("通过 AnkiConnect 控制 Anki 的命令行工具")
    .version(CLI_VERSION, "-V, --version");

  for (const group of Object.values(commandGroups)) {
    group.registerCommand(program, ctx);
  }

  return program;
};
