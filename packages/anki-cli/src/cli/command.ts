import type { Command } from "commander";
import type { AnkiConnectClient } from "../client/anki-connect-client";
import type { Logger } from "./logger";
import { printErrorJson, printSuccessJson } from "./output";

export interface CommandContext {
  client: AnkiConnectClient;
  logger: Logger;
  compact: boolean;
  debug: boolean;
}

// 命令组注册器: 每个 commands/<组>/index.ts 导出同签名函数,
// 由 import.meta.glob 自动发现(见 cli/program.ts)。
export type CommandRegistrar = (program: Command, ctx: CommandContext) => void;

// 命令动作: 输入 AnkiConnect 客户端, 产出可 JSON 序列化的结果。
export type CommandAction = (client: AnkiConnectClient) => Promise<unknown>;

// 统一 action 包装: 成功输出结果 JSON; 失败输出错误 JSON 并置退出码 1。
// commander 的 action 允许零参异步函数, 返回值被忽略。
export const runAction =
  (ctx: CommandContext, action: CommandAction): (() => Promise<void>) =>
  async (): Promise<void> => {
    try {
      const result = await action(ctx.client);
      printSuccessJson(result, ctx.compact);
    } catch (error) {
      printErrorJson(error, ctx.debug, ctx.compact);
      process.exitCode = 1;
    }
  };
