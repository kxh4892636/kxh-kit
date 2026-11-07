/**
 * 编排方会话的通知投递队列：worker 的 report 与超时提醒。
 *
 * pi 的 `sendMessage` 是**即发即忘**的（内部把失败交给 `runner.emitError`），所以失败既
 * 不会抛给我们，也不会留下痕迹 —— 这正是"worker 报完了、编排方却什么也没看到"的根因。
 * 这里给每条通知一个显式的队列位置：投递成功即出队，失败留在队里并在下一次可注入的时机
 * （`agent_settled` / `before_agent_start` / `input`）重试，失败原因与积压条数都能被
 * `orchestrator_workers` 与 `/orchestrator status` 看到。
 *
 * 投递方式按编排方会话忙不忙选：忙 → `followUp`（等当前轮结束再插进队列），空闲 →
 * `steer` + `triggerTurn`（立刻开一轮）。
 *
 * 积压可以**落盘**（状态目录的 `reports-pending.json`，`fileOutboxStore`）：进程被杀、
 * 崩溃、上下文轮转之后，未送达的通知还在，下一次启动的第一个钩子会接着重试。
 * @module @kxh4892636/pi-toolkit/orchestrator/outbox
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** 一条待送达通知。 */
export interface OutboxNotice {
  /** 单调递增序号，日志与队列排序用。 */
  readonly id: number;
  /** 注入用的 customType（`orchestrator-report` / `orchestrator-worker-timeout`）。 */
  readonly customType: string;
  readonly content: string;
  readonly details?: unknown;
  /** 相关 worker 的 plan 引用；清单据此把"未送达"归到那一行。 */
  readonly planRef?: string;
  /** 首次尝试时刻（毫秒）。 */
  readonly at: number;
  /** 已经尝试投递的次数。 */
  attempts: number;
  /** 最近一次投递失败的原因。 */
  lastError?: string;
}

/** 提交一条通知时要给的内容。 */
export type OutboxNoticeInput = Pick<OutboxNotice, "customType" | "content"> & {
  readonly details?: unknown;
  readonly planRef?: string;
};

/** 投递选项：与 pi `sendMessage` 的参数对齐。 */
export interface OutboxSendOptions {
  readonly triggerTurn?: boolean;
  readonly deliverAs: "steer" | "followUp";
}

/** 真正把通知塞进会话的回调；失败必须抛错，不能自己吞掉。 */
export type OutboxSender = (
  message: { customType: string; content: string; display: boolean; details?: unknown },
  options: OutboxSendOptions,
) => void;

/** 积压的持久化后端：读回未送达的、覆盖保存当前的（空数组即清掉）。 */
export interface OutboxStore {
  load(): readonly OutboxNotice[];
  save(notices: readonly OutboxNotice[]): void;
}

/** 积压文件的文件名（编排方状态目录下）。 */
export const PENDING_REPORTS_FILE = "reports-pending.json";

/**
 * 文件后端：把积压写到 `file`，送达即重写（空队列直接删文件，不留垃圾）。
 *
 * 读写失败一律当作"没有积压" / "没存下来"：通知能否持久化不影响投递主路径。
 * @param file - 积压文件绝对路径。
 * @returns 持久化后端。
 */
export const fileOutboxStore = (file: string): OutboxStore => ({
  load: () => {
    if (!existsSync(file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { notices?: OutboxNotice[] };
      return Array.isArray(parsed.notices) ? parsed.notices : [];
    } catch {
      return [];
    }
  },
  save: (notices) => {
    try {
      if (notices.length === 0) {
        if (existsSync(file)) rmSync(file, { force: true });
        return;
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify({ notices }, null, 2)}\n`, "utf8");
    } catch {
      // 状态目录不可写时退回纯内存队列。
    }
  },
});

/** 通知队列。 */
export interface Outbox {
  /** 提交一条通知：立即尝试，失败入队（不抛错，通知不能把调用方带崩）。 */
  submit(input: OutboxNoticeInput, busy: boolean): void;
  /** 重试积压的通知；队头仍失败就停手（保持顺序）。返回本次送出的条数。 */
  retry(busy: boolean): number;
  /** 积压条数。 */
  count(): number;
  /** 某个 worker（plan 引用）的积压条数。 */
  countFor(planRef: string): number;
  /** 积压快照，供展示。 */
  list(): readonly OutboxNotice[];
  /** 最近一次失败原因。 */
  lastError(): string | undefined;
}

/**
 * 建一个通知队列。
 *
 * 给了 `store` 就把积压落盘：启动时先载入上次没送出去的通知（id 已存在的不重复入队），
 * 入队/出队时重写。不带 `store` 就是纯内存队列（测试与老路径）。
 * @param send - 真正的投递函数（通常是 `pi.sendMessage` 的封装）；失败抛错。
 * @param store - 积压的持久化后端；省略则只在内存里排队。
 * @returns 队列。
 */
export const createOutbox = (send: OutboxSender, store?: OutboxStore): Outbox => {
  const queued: OutboxNotice[] = [];
  let seq = 0;
  let lastError: string | undefined;

  /** 载入盘上的积压：按 id 去重，序号续着最大值走（否则重启后会发出重复 id）。 */
  for (const notice of store?.load() ?? []) {
    if (queued.some((existing) => existing.id === notice.id)) continue;
    queued.push(notice);
    if (notice.id > seq) seq = notice.id;
  }

  const persist = (): void => store?.save(queued);

  const attempt = (notice: OutboxNotice, busy: boolean): boolean => {
    notice.attempts += 1;
    try {
      send(
        {
          customType: notice.customType,
          content: notice.content,
          display: true,
          ...(notice.details === undefined ? {} : { details: notice.details }),
        },
        busy ? { deliverAs: "followUp" } : { triggerTurn: true, deliverAs: "steer" },
      );
      delete notice.lastError;
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      notice.lastError = lastError;
      return false;
    }
  };

  return {
    submit(input, busy) {
      const notice: OutboxNotice = {
        ...input,
        id: (seq += 1),
        at: Date.now(),
        attempts: 0,
      };
      if (attempt(notice, busy)) return;
      queued.push(notice);
      persist();
    },
    retry(busy) {
      let sent = 0;
      while (queued.length > 0) {
        const head = queued[0];
        if (head === undefined || !attempt(head, busy)) break;
        queued.shift();
        sent += 1;
      }
      // 不论送出几条都重写：进度（attempts / lastError）也要落盘。
      if (queued.length > 0 || sent > 0) persist();
      return sent;
    },
    count: () => queued.length,
    countFor: (planRef) => queued.filter((notice) => notice.planRef === planRef).length,
    list: () => [...queued],
    lastError: () => lastError,
  };
};
