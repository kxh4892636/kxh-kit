/**
 * worker 侧的子派工：一层子 worker（`depth 1`），跑完即弃。
 *
 * 上层 worker 拿一个**受限**的 `orchestrator_dispatch`：只接受 `message`，不接受
 * `plan`，派出来的会话固定是 `depth 1` —— 子 worker 拿宿主的文件工具 + 只读
 * `orchestrator_read` + `orchestrator_report`，改得了工作区文件、改不了 `notes.json`，
 * 也没有 `dispatch`（不能再往下派）。
 *
 * 观测面刻意只有一条：子 worker 的 report 与超时都**注入上级 worker 的会话**，
 * 编排方看不到子 worker 的句柄，也不需要看 —— 上级 worker 才是那一组 note 的负责人。
 *
 * 句柄表是这条工具自己的闭包（与编排方那张表互不相通），所以 worker 会话被
 * dispose 时不会有残留状态泄漏给别的会话。
 * @module @kxh4892636/pi-toolkit/orchestrator/subdispatch
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ToolkitSettings } from "../settings.ts";
import {
  createRegistry,
  deliver,
  disposeEntry,
  harvest,
  renew,
  type WorkerEntry,
  type WorkerJob,
  type WorkerRegistry,
} from "./handles.ts";
import { spawnWorker } from "./spawn.ts";
import { asArguments, optionalString, textBlocks, type OrchestratorTool } from "./tools/shared.ts";
import type { WorkerReport } from "./types.ts";

/** 子 worker 上报注入上级会话时用的 customType。 */
export const SUB_REPORT_TYPE = "orchestrator-subreport";

/** 子 worker 超时注入上级会话时用的 customType。 */
export const SUB_TIMEOUT_TYPE = "orchestrator-sub-timeout";

/** 子派工工具的依赖。 */
export interface SubDispatchOptions {
  /** 上级 worker 的扩展入口：注入消息走它，消息落在上级会话里。 */
  readonly pi: ExtensionAPI;
  /** 上级 worker 的路由键（Plan 目录或 `temp:<id>`）：子 worker 是 `<parent>/sub:<n>`。 */
  readonly parentRoute: string;
  /** 上级 worker 的展示名（`<domain>/<lifecycle>/<name>` 或 `temp:<id>`）：用于 session 名。 */
  readonly parentRef: string;
  /** 上级 worker 的层级：子 worker 一律是 `depth + 1`。 */
  readonly depth: number;
  /** 当前设置；每次读取（`workerTimeoutMs` 改了立即生效）。 */
  readonly settings: () => ToolkitSettings;
  /** 起 session 的接缝；测试注入替身。 */
  readonly spawn?: typeof spawnWorker;
}

/**
 * 构造 worker 侧的 `orchestrator_dispatch`。
 *
 * 一次调用 = 一个子 worker：不排队、不复用键。子 worker 的终态（settle 或超时）
 * 都立刻摘除句柄并 dispose，所以「跑完即弃」不需要额外清理路径。
 * @param options - 上级路由键、层级与依赖。
 * @returns 受限的子派工工具。
 */
export const createSubDispatchTool = (options: SubDispatchOptions): OrchestratorTool => {
  const registry: WorkerRegistry = createRegistry();
  const depth = options.depth + 1;
  /** 子 worker 序号：进程内自增，键形如 `<parent>/sub:1`。 */
  let seq = 0;

  /**
   * 往**上级 worker 的会话**注入一条消息。
   *
   * 这是子 worker 唯一的观测通道：编排方看不到子 worker，只有上级会收到。
   * 会话正在关闭时注入失败只丢通知，不影响收尾。
   */
  const notify = (customType: string, lines: string[], details: Record<string, unknown>): void => {
    try {
      options.pi.sendMessage(
        { customType, content: lines.join("\n"), display: true, details },
        { triggerTurn: true, deliverAs: "followUp" },
      );
    } catch {
      // 会话正在关闭时无法注入；子 worker 已经收尾。
    }
  };

  /** 摘除句柄并释放 session；子 worker 只有这一条收尾路径。 */
  const drop = async (entry: WorkerEntry): Promise<void> => {
    registry.remove(entry.planDirectory);
    await disposeEntry(entry);
  };

  /**
   * watchdog 到点：中止子 worker、摘句柄，并向上级报一条超时。
   *
   * 与编排方同一口径：只对同一次派工发一次（`job.notified`），不代写 note 状态。
   */
  const sendTimeout = (entry: WorkerEntry, job: WorkerJob, timeoutMs: number): void => {
    if (entry.job !== job || job.notified) return;
    job.notified = true;
    const minutes = Math.round(timeoutMs / 60_000);
    void (async () => {
      await drop(entry);
      notify(
        SUB_TIMEOUT_TYPE,
        [
          `[sub] 超时：${entry.planRef} 超过 ${minutes} 分钟没有进展，已中止（kind: ${job.kind}）。`,
          "note 状态未改动：由你决定重新派一个子 worker 还是自己收尾。",
        ],
        { sub: entry.planRef, kind: job.kind, timedOut: true, depth },
      );
    })();
  };

  /**
   * 子 worker 上报的落点：续期 watchdog，然后转发给上级会话。
   *
   * 任何 outcome（含纯信息性的 `done`）都算进展并续期，语义与 note 18 一致。
   */
  const onReport = (entry: WorkerEntry, report: WorkerReport): void => {
    entry.lastReport = report;
    const job = entry.job;
    if (job !== undefined) {
      const timeoutMs = options.settings().orchestrator.workerTimeoutMs;
      renew(entry, job, timeoutMs, () => sendTimeout(entry, job, timeoutMs));
    }
    const lines = [`[sub] ${report.outcome} · note ${report.note}: ${report.summary}`];
    if (report.question !== undefined) lines.push(`问题: ${report.question}`);
    lines.push(`来源: ${entry.planRef}`);
    notify(SUB_REPORT_TYPE, lines, { ...report, sub: entry.planRef, depth });
  };

  return {
    name: "orchestrator_dispatch",
    label: "Dispatch sub",
    description:
      "派一个子 worker 去办一件并行的事：它改得了工作区文件、改不了 notes.json，也没有 dispatch。它的 report 与超时只回到你这个会话；跑完即弃。只接受 message（不能指定 plan 或 note）。",
    promptSnippet: "Dispatch a sub-worker for one parallel side task.",
    promptGuidelines: [
      "子 worker 改不了 notes：note 状态仍由你改、证据仍由你写。",
      "并行办事才用子 worker；组与组之间的并行属于编排方，用 report 说明。",
      "子 worker 的 report 只回到你这里，收尾时把它拼进自己的上报。",
    ],
    parameters: Type.Unsafe<Record<string, unknown>>({
      type: "object",
      additionalProperties: false,
      properties: {
        message: { type: "string", description: "交给子 worker 的那件事（含边界与验收）" },
      },
      required: ["message"],
    }),
    async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
      const args = asArguments(raw);
      const message = optionalString(args, "message");
      if (message === undefined || message.trim() === "") {
        throw new Error("message 必填：子 worker 不知道要办什么");
      }
      seq += 1;
      const key = `${options.parentRoute}/sub:${seq}`;
      const spawned = await (options.spawn ?? spawnWorker)({
        sub: { parentRef: options.parentRef, index: seq },
        depth,
        cwd: exec.cwd,
        settings: options.settings,
        workerKey: key,
        report: (report) => {
          const entry = registry.get(key);
          if (entry !== undefined) onReport(entry, report);
        },
        // 子 worker 改不了 notes：放行判定对它没有意义。
        released: () => false,
      });
      const entry = registry.add({
        planDirectory: key,
        planRef: key,
        startedAt: Date.now(),
        session: spawned.session,
      });
      const timeoutMs = options.settings().orchestrator.workerTimeoutMs;
      const delivery = deliver(entry, "message", message);
      const now = Date.now();
      const job: WorkerJob = {
        kind: "message",
        startedAt: now,
        progressAt: now,
        settled: delivery.settled,
        notified: false,
      };
      entry.job = job;
      renew(entry, job, timeoutMs, () => sendTimeout(entry, job, timeoutMs));
      // 子 worker 是一次性的：终态即摘句柄 + dispose，不留隐性状态。
      const done = (): void => {
        harvest(entry, job);
        void drop(entry);
      };
      void delivery.settled.then(done, done);
      return {
        content: textBlocks(
          [
            `已起子 worker ${key}（depth ${depth}）。`,
            "它有文件工具与只读 orchestrator 工具，改不了 notes；report 与超时只回到你这里。",
            "跑完即弃，不用清理。",
          ].join("\n"),
        ),
        details: { sub: key, depth, queued: delivery.queued },
      };
    },
  };
};
