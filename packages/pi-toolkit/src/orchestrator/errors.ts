/**
 * 编排层的错误处理底座。
 *
 * 单进程里所有 worker session 与编排方共享一个事件循环，所以原则是：**单个
 * worker 的问题不许外抛**，进程级的意外只做一件事 —— 落下"哪些 plan 被打断"
 * 的凭据，然后干净退出，交给下次 `session_start` 的对账接手。
 * @module @kxh4892636/pi-toolkit/orchestrator/errors
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** 状态文件名：崩溃时写下的中断凭据。 */
export const INTERRUPTED_FILE = "interrupted.json";

/** 中断凭据。 */
export interface InterruptedState {
  readonly at: string;
  readonly reason: string;
  /** 崩溃时仍 live 的 plan 引用。 */
  readonly plans: readonly string[];
}

/**
 * orchestrator 的状态目录。
 * @param agentDir - pi 的 agent 目录。
 * @returns `<agentDir>/orchestrator`。
 */
export const stateDirectory = (agentDir: string): string => join(agentDir, "orchestrator");

/**
 * 写中断凭据（覆盖旧值）。
 * @param directory - 状态目录。
 * @param state - 凭据。
 */
export const writeInterrupted = (directory: string, state: InterruptedState): void => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, INTERRUPTED_FILE), `${JSON.stringify(state, null, 2)}\n`, "utf8");
};

/**
 * 读中断凭据；没有或损坏时返回 undefined。
 * @param directory - 状态目录。
 * @returns 凭据或 undefined。
 */
export const readInterrupted = (directory: string): InterruptedState | undefined => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(directory, INTERRUPTED_FILE), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (typeof record["at"] !== "string" || typeof record["reason"] !== "string") return undefined;
    const plans = Array.isArray(record["plans"])
      ? record["plans"].filter((item): item is string => typeof item === "string")
      : [];
    return { at: record["at"], reason: record["reason"], plans };
  } catch {
    return undefined;
  }
};

/**
 * 清掉中断凭据（对账报告之后调用）。
 * @param directory - 状态目录。
 */
export const clearInterrupted = (directory: string): void => {
  rmSync(join(directory, INTERRUPTED_FILE), { force: true });
};

/**
 * 把一次 handler 失败收成一行文本，绝不向外抛。
 * @param label - 出问题的地方。
 * @param error - 捕获到的错误。
 * @returns 可读文本。
 */
export const describeError = (label: string, error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return `${label}: ${message}`;
};

/** 崩溃兜底的数据来源：状态目录与当时的 live plan。 */
export interface CrashGuardSource {
  readonly directory: () => string;
  readonly plans: () => readonly string[];
}

const sources = new Set<CrashGuardSource>();
let detach: (() => void) | undefined;

const attach = (exit: (code: number) => void): (() => void) => {
  const handle = (reason: string, error: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error);
    const plans = new Set<string>();
    let directory: string | undefined;
    for (const source of sources) {
      try {
        directory ??= source.directory();
        for (const plan of source.plans()) plans.add(plan);
      } catch {
        // 单个来源失败不影响其它来源。
      }
    }
    if (directory !== undefined) {
      try {
        writeInterrupted(directory, {
          at: new Date().toISOString(),
          reason: `${reason}: ${detail}`,
          plans: [...plans],
        });
      } catch {
        // 连落盘都失败时没有更好的选择，直接退出。
      }
    }
    exit(1);
  };
  const onException = (error: unknown): void => handle("uncaughtException", error);
  const onRejection = (reason: unknown): void => handle("unhandledRejection", reason);
  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);
  return () => {
    process.off("uncaughtException", onException);
    process.off("unhandledRejection", onRejection);
  };
};

/**
 * 进程级兜底：记录中断凭据后退出。
 *
 * 状态不确定时继续比退出更危险 —— 退出后由 `session_start` 的对账把中断的 plan
 * 摆到人面前，是唯一不会静默半死的选择。同一进程只挂一次监听，多个来源
 * （多个编排方 session）共享它。
 * @param source - 状态目录与 live plan 读取器。
 * @param exit - 退出方式，测试可替换。
 * @returns 卸载函数。
 */
export const installCrashGuard = (
  source: CrashGuardSource,
  exit: (code: number) => void = (code) => process.exit(code),
): (() => void) => {
  sources.add(source);
  detach ??= attach(exit);
  return () => {
    sources.delete(source);
    if (sources.size === 0 && detach !== undefined) {
      detach();
      detach = undefined;
    }
  };
};

/**
 * 给一个 promise 套超时；超时后先执行收尾再返回。
 * @param work - 待等待的工作。
 * @param ms - 超时毫秒。
 * @param onTimeout - 超时收尾（通常是 abort）。
 * @returns `"timeout"` 或工作结果。
 */
export const withTimeout = async <T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => Promise<void> | void,
): Promise<T | "timeout"> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      void Promise.resolve(onTimeout()).catch(() => undefined);
      resolve("timeout");
    }, ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/** 目录名辅助：拼状态文件路径。 */
export const interruptedPath = (directory: string): string =>
  join(dirname(directory), INTERRUPTED_FILE);
