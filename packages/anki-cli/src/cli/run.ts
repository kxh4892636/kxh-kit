import { CommanderError, type Command } from "commander";
import { loadConfig } from "../config/config-schema";
import { AnkiConnectClient } from "../client/anki-connect-client";
import { createLogger } from "./logger";
import { scanGlobalOptions } from "./globals";
import { buildProgram } from "./program";
import { printErrorJson } from "./output";
import type { CommandContext } from "./command";

// exitOverride 只作用于被调用的命令实例; 对整棵命令树逐一应用,
// 保证子命令上的用法错误(如缺失必填参数)也以 CommanderError 抛出。
const applyExitOverride = (cmd: Command): void => {
  cmd.exitOverride();
  for (const sub of cmd.commands) {
    applyExitOverride(sub as Command);
  }
};

// commander 拦截 process.exit 时抛出的兜底错误(用法错误路径的残余)。
const isInterceptedExit = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith("process.exit unexpectedly called");

// CLI 主流程: 提取全局选项 → 装载配置 → 装配客户端 → 解析并执行子命令。
// 错误统一收敛: 用法错误退出码 2, 运行时错误退出码 1。
export const runCli = async (argv: readonly string[]): Promise<void> => {
  const { rest, globals } = scanGlobalOptions(argv);

  try {
    const config = loadConfig(process.env, globals);
    const logger = createLogger(config.logLevel, { debugStack: globals.debug });
    const client = new AnkiConnectClient({
      url: config.ankiConnectUrl,
      apiVersion: config.ankiConnectApiVersion,
      apiKey: config.ankiConnectApiKey,
      timeout: config.ankiConnectTimeout,
      readOnly: config.readOnly,
      logger,
    });

    const ctx: CommandContext = {
      client,
      logger,
      compact: globals.compact,
      debug: globals.debug,
    };

    const program = buildProgram(ctx);
    applyExitOverride(program);

    await program.parseAsync(["node", "anki-cli", ...rest]);
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help/--version 已正常输出后由 commander 抛出(exitCode 0)。
      if (error.exitCode === 0) {
        return;
      }
      printErrorJson(error, globals.debug);
      process.exitCode = 2;
      return;
    }
    if (isInterceptedExit(error)) {
      // commander 已输出人类可读错误, 再补一个错误 JSON 并置用法错误退出码。
      printErrorJson(error, globals.debug);
      process.exitCode = 2;
      return;
    }
    printErrorJson(error, globals.debug);
    process.exitCode = 1;
  }
};
