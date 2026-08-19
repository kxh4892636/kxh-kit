import { JsonError } from "./json-error";

export interface GlobalCliOptions {
  ankiConnect?: string;
  readOnly: boolean;
  debug: boolean;
  compact: boolean;
}

/**
 * 在 commander 解析前提取全局选项, 使其出现在子命令前后都生效,
 * 且不污染各子命令的参数定义。
 */
export const scanGlobalOptions = (
  argv: readonly string[],
): { rest: string[]; globals: GlobalCliOptions } => {
  const rest: string[] = [];
  const globals: GlobalCliOptions = {
    readOnly: false,
    debug: false,
    compact: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--read-only") {
      globals.readOnly = true;
      continue;
    }
    if (arg === "--debug" || arg === "-d") {
      globals.debug = true;
      continue;
    }
    if (arg === "--compact" || arg === "-c") {
      globals.compact = true;
      continue;
    }
    if (arg === "--anki-connect" || arg === "-a") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new JsonError(`选项 ${arg} 需要一个 URL 值`, { action: "cli" });
      }
      globals.ankiConnect = value;
      i++;
      continue;
    }
    if (arg.startsWith("--anki-connect=")) {
      globals.ankiConnect = arg.slice("--anki-connect=".length);
      continue;
    }

    rest.push(arg);
  }

  return { rest, globals };
};
