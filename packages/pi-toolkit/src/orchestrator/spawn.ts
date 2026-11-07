/**
 * 用 SDK 起一个 worker session。
 *
 * in-process `createAgentSession` + `DefaultResourceLoader`，只注入 worker 那套
 * 扩展工厂（`noExtensions: true`），因此 worker 看不到编排方的工具、句柄表与
 * 崩溃凭据，也不会递归加载宿主扩展。
 *
 * Plan worker 与临时 worker 的会话都**落盘**（jsonl）：工作键相同即能续上历史，重启后
 * 也找得回来；子 worker 不续、不落盘，仍在内存会话里跑。
 *
 * 三种形态：绑定 Plan 的 worker（`plan` 给出）、没有 Plan 的临时 worker（`temp`
 * 给出临时 id），以及上层 worker 派出的子 worker（`sub` 给出上级标识与序号，固定
 * `depth 1`）。只许给其中一个，否则属于调用错误。
 * @module @kxh4892636/pi-toolkit/orchestrator/spawn
 */

import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ToolkitSettings } from "../settings.ts";
import { assetsSkillsRoot } from "./assets.ts";
import { stateDirectory } from "./errors.ts";
import { openLedger } from "./ledger.ts";
import { openProjection } from "./projection.ts";
import type { SessionLike } from "./handles.ts";
import type { PlanRef } from "./plan.ts";
import type { WorkerReport } from "./types.ts";
import { createWorkerExtension } from "./worker.ts";
import { openWorkerSession } from "./worker-sessions.ts";

/** 起 worker 的参数。 */
export interface SpawnWorkerOptions {
  /** 该 worker 负责的 Plan；临时 worker 省略。 */
  readonly plan?: PlanRef;
  /** 临时 worker 的 id（与 `plan` 二选一）：没有 Plan，只读工作区 + 上报。 */
  readonly temp?: string;
  /** 子 worker（与 `plan` / `temp` 互斥）：上级标识与它在这一层里的序号。 */
  readonly sub?: { readonly parentRef: string; readonly index: number };
  /** 层级：0 = 编排方派的 worker，1 = 上层 worker 派的子 worker。缺省 0。 */
  readonly depth?: number;
  /** worker 的工作目录（通常是编排方的 cwd）。 */
  readonly cwd: string;
  /** 设置读取器。 */
  readonly settings: () => ToolkitSettings;
  /** 上报入口。 */
  readonly report: (report: WorkerReport) => void;
  /** 放行判定：账本里的 `note.pass` 重放出来的（不是内存集合）。 */
  readonly released: (noteId: string) => boolean;
  /**
   * 这个 worker 在账本里的路由键（`<plan 目录>::<组>` 或 `temp:<id>`）。
   *
   * ack（`agent_start` → `input.consumed`）与 report 的归属都靠它；省略时 worker 侧的
   * ack 不生效（子 worker / 测试替身）。
   */
  readonly workerKey?: string;
  /**
   * 落盘会话的工作键（`<plan 目录>::<组>` 或 `temp:<id>`）；同一键重启后能续上。
   * 子 worker 省略：它不续、不落盘，仍用内存会话。
   */
  readonly sessionKey?: string;
  /** 覆盖 agent 目录（测试用）。 */
  readonly agentDir?: string;
  /** 覆盖会话目录（测试用）；省略即 pi 的默认 sessions 目录。 */
  readonly sessionDir?: string;
}

/** 起出来的 worker。 */
export interface SpawnedWorker {
  readonly session: SessionLike;
  /** 会话文件路径；子 worker（内存会话）为 undefined。 */
  readonly sessionPath?: string;
  /** 是否从磁盘上的旧会话续上。 */
  readonly resumed: boolean;
  readonly dispose: () => void;
}

/**
 * worker session 的展示名：
 * - 子 worker：`worker:<上级展示名>/sub:<n>`（上级是谁一眼看得出）
 * - 临时 worker：`worker:temp:<id>`
 * - Plan worker：`worker:<domain>/<name>`
 * @param options - 形态与上级标识。
 * @returns session 名。
 */
export const workerSessionName = (options: {
  readonly plan?: PlanRef;
  readonly temp?: string;
  readonly sub?: { readonly parentRef: string; readonly index: number };
}): string => {
  const { plan, sub } = options;
  if (sub !== undefined) return `worker:${sub.parentRef}/sub:${sub.index}`;
  if (plan !== undefined) return `worker:${plan.domain}/${plan.name}`;
  return `worker:temp:${options.temp ?? "?"}`;
};

/**
 * 建一个 worker session。
 *
 * 调用方负责把它登记进句柄表、发第一条消息，并在结束时 `dispose`。
 * @param options - Plan 或临时 id、工作目录与依赖。
 * @returns session 与释放函数。
 */
export const spawnWorker = async (options: SpawnWorkerOptions): Promise<SpawnedWorker> => {
  const { plan, sub } = options;
  const given = [plan, options.temp, sub].filter((value) => value !== undefined);
  if (given.length !== 1) {
    throw new Error("起 worker 需要 plan / temp / sub 之一，且只能给一个");
  }
  const stateDirectoryOf = stateDirectory(options.agentDir ?? getAgentDir());
  // 子 worker 不续、不落盘；Plan worker 与临时 worker 都有 jsonl，按工作键找得回来。
  const opened =
    options.sessionKey === undefined || sub !== undefined
      ? undefined
      : openWorkerSession({
          key: options.sessionKey,
          cwd: options.cwd,
          stateDir: stateDirectoryOf,
          ...(options.sessionDir === undefined ? {} : { sessionDir: options.sessionDir }),
        });
  // worker 与编排方同进程：共享账本 + 投影，ack 与状态看的是同一份 seq。
  const ledger = openLedger(stateDirectoryOf);
  const events = {
    append: (input: Parameters<typeof ledger.append>[0]) => ledger.append(input),
    oldestPendingOf: (worker: string) => openProjection(ledger).oldestPendingOf(worker),
  };
  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir ?? getAgentDir(),
    noExtensions: true,
    additionalSkillPaths: [assetsSkillsRoot()],
    extensionFactories: [
      {
        name: "pi-toolkit-worker",
        factory: createWorkerExtension({
          ...(plan === undefined ? {} : { plan }),
          ...(options.temp === undefined ? {} : { temp: options.temp }),
          ...(sub === undefined ? {} : { sub }),
          ...(options.depth === undefined ? {} : { depth: options.depth }),
          report: options.report,
          settings: options.settings,
          released: options.released,
          ...(options.workerKey === undefined ? {} : { workerKey: options.workerKey }),
          events,
        }),
      },
    ],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: options.cwd,
    resourceLoader: loader,
    sessionManager: opened?.manager ?? SessionManager.inMemory(options.cwd),
  });
  // 续上的会话已经带名字，不再追加一条 session_info。
  if (opened?.resumed !== true) session.setSessionName(workerSessionName(options));
  return {
    session: session as unknown as SessionLike,
    ...(opened === undefined ? {} : { sessionPath: opened.path }),
    resumed: opened?.resumed ?? false,
    dispose: () => session.dispose(),
  };
};
