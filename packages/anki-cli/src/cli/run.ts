import { CommanderError } from "commander";
import { loadConfig } from "../config/config-schema";
import { AnkiConnectClient } from "../client/anki-connect-client";
import { createLogger } from "./logger";
import { scanGlobalOptions } from "./globals";
import { buildProgram } from "./program";
import { printErrorJson } from "./output";
import type { CommandContext } from "./command";

// CLI 主流程: 提取全局选项 → 装载配置 → 装配客户端 → 解析并执行子命令。
// 错误统一收敛: CommanderError(用法)退出码 2, 其余运行时错误退出码 1。
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
    program.exitOverride();

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
    printErrorJson(error, globals.debug);
    process.exitCode = 1;
  }
};
