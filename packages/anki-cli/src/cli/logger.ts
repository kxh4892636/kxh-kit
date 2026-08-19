export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface LoggerOptions {
  /** error 输出 Error 元信息时附完整堆栈(--debug 时开启) */
  debugStack?: boolean;
}

const toMetaText = (meta: unknown, debugStack: boolean): string => {
  if (meta instanceof Error) {
    return debugStack ? (meta.stack ?? meta.message) : meta.message;
  }
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
};

// 日志一律写 stderr: stdout 是 JSON 结果契约的专属通道(ADR-0001)。
export const createLogger = (level: LogLevel, options: LoggerOptions = {}): Logger => {
  const write = (logLevel: LogLevel, message: string, meta?: unknown): void => {
    if (LEVEL_RANK[logLevel] < LEVEL_RANK[level]) {
      return;
    }
    process.stderr.write(`[${new Date().toISOString()}] ${logLevel.toUpperCase()} ${message}\n`);
    if (meta !== undefined) {
      process.stderr.write(`  ${toMetaText(meta, options.debugStack ?? false)}\n`);
    }
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
};
