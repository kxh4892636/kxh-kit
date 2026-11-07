/**
 * 用 SDK 起一个 worker session。
 *
 * in-process `createAgentSession` + `DefaultResourceLoader`，只注入 worker 那套
 * 扩展工厂（`noExtensions: true`），因此 worker 看不到编排方的工具、句柄表与
 * 启动对账，也不会递归加载宿主扩展。
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
import type { SessionLike } from "./handles.ts";
import type { PlanRef } from "./plan.ts";
import type { WorkerReport } from "./types.ts";
import { createWorkerExtension } from "./worker.ts";

/** 起 worker 的参数。 */
export interface SpawnWorkerOptions {
  /** 该 worker 负责的 Plan。 */
  readonly plan: PlanRef;
  /** worker 的工作目录（通常是编排方的 cwd）。 */
  readonly cwd: string;
  /** 设置读取器。 */
  readonly settings: () => ToolkitSettings;
  /** 上报入口。 */
  readonly report: (report: WorkerReport) => void;
  /** 编排方已放行的 note id。 */
  readonly released: Set<string>;
  /** 覆盖 agent 目录（测试用）。 */
  readonly agentDir?: string;
}

/** 起出来的 worker。 */
export interface SpawnedWorker {
  readonly session: SessionLike;
  readonly dispose: () => void;
}

/**
 * 建一个 worker session。
 *
 * 调用方负责把它登记进句柄表、发第一条消息，并在结束时 `dispose`。
 * @param options - Plan、工作目录与依赖。
 * @returns session 与释放函数。
 */
export const spawnWorker = async (options: SpawnWorkerOptions): Promise<SpawnedWorker> => {
  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir ?? getAgentDir(),
    noExtensions: true,
    additionalSkillPaths: [assetsSkillsRoot()],
    extensionFactories: [
      {
        name: "pi-toolkit-worker",
        factory: createWorkerExtension({
          plan: options.plan,
          report: options.report,
          settings: options.settings,
          released: options.released,
        }),
      },
    ],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: options.cwd,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(options.cwd),
  });
  session.setSessionName(`worker:${options.plan.domain}/${options.plan.name}`);
  return {
    session: session as unknown as SessionLike,
    dispose: () => session.dispose(),
  };
};
