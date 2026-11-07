/**
 * 编排层的错误处理底座。
 *
 * 单进程里所有 worker session 与编排方共享一个事件循环，所以原则是：**单个
 * worker 的问题不许外抛**，进程级的意外只做一件事 —— 落下"哪些 plan 被打断"
 * 的凭据，然后干净退出；凭据由人显式查询（`resume <plan>` 或 `/orchestrator
 * status`）时展示并移除，启动流程不读写它。
 * @module @kxh4892636/pi-toolkit/orchestrator/errors
 */

import { join } from "node:path";

/**
 * orchestrator 的状态目录。
 * @param agentDir - pi 的 agent 目录。
 * @returns `<agentDir>/orchestrator`。
 */
export const stateDirectory = (agentDir: string): string => join(agentDir, "orchestrator");

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

/** 崩溃兜底的数据来源：把当时 live 的 worker 记进账本（`worker.exit`）。 */
export interface CrashGuardSource {
  /** 落一条崩溃凭据；实现方负责追加 `worker.exit` 事件。 */
  readonly record: (reason: string) => void;
}

const sources = new Set<CrashGuardSource>();
let detach: (() => void) | undefined;

const attach = (exit: (code: number) => void): (() => void) => {
  const handle = (reason: string, error: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error);
    const label = `${reason}: ${detail}`;
    for (const source of sources) {
      try {
        source.record(label);
      } catch {
        // 单个来源失败不影响其它来源。
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
 * 状态不确定时继续比退出更危险 —— 退出后凭据留在磁盘上，等用户 `resume <plan>`
 * 或 `/orchestrator status` 时才被摆到面前，是唯一不会静默半死的选择。
 * 同一进程只挂一次监听，多个来源
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
