/**
 * 事件账本的读写：`<agentDir>/orchestrator/events.jsonl`，只追加。
 *
 * 设计要点（跟着 note 45 的定案走）：
 *
 * 1. **只追加**：`append` 分配 `seq` 并写一行；历史不改写。压缩靠 `replace` 把整本换成
 *    “一条 snapshot”，旧行先归档到 `events-<日期>.jsonl`。
 * 2. **幂等**：同一 `idem` 只落一次，重复 `append` 直接返回既有事件。
 * 3. **同进程即发**：`append` 之后立刻 `notify` 订阅者（毫秒级，侧栏与投影都靠它）。
 * 4. **跨进程兜底**：`sync` 重新读文件里 `seq` 更大的行并通知；另一个 pi 实例写入的事件
 *    也能跟上来。压缩时用 lockfile（`open(..., "wx")`）互斥，Windows 上也成立。
 * 5. **落盘**：每 16 条或每 1 秒 `fsync` 一次（进程崩溃不丢已写行；断电不保证）。
 *
 * 同一个状态目录在一个进程里只有一份实例（`openLedger`）：worker 与编排方同进程，ack
 * 与投影必须看到同一个 `seq`，模块级共享在这一层是刻意的（与句柄表相反）。
 * @module @kxh4892636/pi-toolkit/orchestrator/ledger
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { formatEvent, parseEventLine, type EventInput, type LedgerEvent } from "./events.ts";

/** 账本文件名（状态目录下）。 */
export const LEDGER_FILE = "events.jsonl";
/** 归档文件名前缀：`events-<日期>.jsonl`。 */
export const ARCHIVE_PREFIX = "events-";
/** 压缩用的 lockfile。 */
export const LOCK_FILE = "events.lock";
/** 累计多少条 append 后 fsync 一次。 */
const FSYNC_EVERY = 16;
/** 距上次 fsync 超过多久强制再 fsync（毫秒）。 */
const FSYNC_INTERVAL_MS = 1_000;
/** lockfile 超过这个年龄即视为残留（毫秒）。 */
export const LOCK_STALE_MS = 30_000;

/** 账本句柄：追加、读、订阅、整体替换（压缩用）。 */
export interface Ledger {
  /** 状态目录。 */
  readonly directory: string;
  /** 账本文件绝对路径。 */
  readonly path: string;
  /** 追加一条事件（幂等键重复时返回既有事件）；同步写盘。 */
  append(input: EventInput): LedgerEvent;
  /** 账本里的全部事件（按 `seq` 升序；坏行跳过）。 */
  events(): readonly LedgerEvent[];
  /** 当前最大 `seq`（没有事件时 0）。 */
  lastSeq(): number;
  /** 按 `idem` 查既有事件。 */
  findByIdem(idem: string): LedgerEvent | undefined;
  /** 订阅新事件（同进程 append 与 `sync` 捡到的跨进程事件都会通知）。返回退订阅函数。 */
  subscribe(listener: (event: LedgerEvent) => void): () => void;
  /** 读文件里 `seq` 更大的行并通知订阅者；返回本次捡到的事件。 */
  sync(): readonly LedgerEvent[];
  /** 把整本换成一串事件（压缩用）：先归档旧行，再原子替换。 */
  replace(events: readonly LedgerEvent[]): void;
  /** 文件字节数（跨进程轮询用）。 */
  size(): number;
  /** 退订阅并释放缓存；之后再 `openLedger` 会重新读盘。 */
  close(): void;
}

/** 读账本文件里的全部可解析事件。 */
const readEventLines = (file: string): LedgerEvent[] => {
  if (!existsSync(file)) return [];
  const events: LedgerEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const event = parseEventLine(line);
    if (event !== undefined) events.push(event);
  }
  return events;
};

/** 文件当前字节数；文件不存在时 0。 */
const sizeOf = (file: string): number => {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
};

/**
 * 建一个账本实例（不共享）。一般用 `openLedger`，测试里需要隔离时用这个。
 * @param directory - 状态目录（不存在会建）。
 * @returns 账本句柄。
 */
export const createLedger = (directory: string): Ledger => {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, LEDGER_FILE);
  const listeners = new Set<(event: LedgerEvent) => void>();
  const byIdem = new Map<string, LedgerEvent>();
  let seq = 0;
  let bytes = sizeOf(path);
  let sinceFsync = 0;
  let lastFsync = Date.now();
  let closed = false;

  for (const event of readEventLines(path)) {
    if (event.seq > seq) seq = event.seq;
    if (event.idem !== undefined) byIdem.set(event.idem, event);
  }

  const notify = (event: LedgerEvent): void => {
    for (const listener of listeners) listener(event);
  };

  const fsyncNow = (): void => {
    sinceFsync = 0;
    lastFsync = Date.now();
    try {
      const fd = openSync(path, "r+");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch {
      // 文件被挪走或权限问题：下一次 append 会把新行写进去，这里不抛。
    }
  };

  const adopt = (event: LedgerEvent): void => {
    if (event.seq > seq) seq = event.seq;
    if (event.idem !== undefined) byIdem.set(event.idem, event);
  };

  const ledger: Ledger = {
    directory,
    path,
    append(input) {
      if (input.idem !== undefined) {
        const seen = byIdem.get(input.idem);
        if (seen !== undefined) return seen;
      }
      // 跨进程写者可能已经推进了 seq：先跟上，否则会写出重复 seq。
      ledger.sync();
      const event: LedgerEvent = {
        seq: seq + 1,
        at: input.at ?? new Date().toISOString(),
        type: input.type,
        ...(input.idem === undefined ? {} : { idem: input.idem }),
        payload: input.payload,
      };
      const line = `${formatEvent(event)}\n`;
      appendFileSync(path, line, "utf8");
      bytes += Buffer.byteLength(line, "utf8");
      adopt(event);
      sinceFsync += 1;
      if (sinceFsync >= FSYNC_EVERY || Date.now() - lastFsync >= FSYNC_INTERVAL_MS) fsyncNow();
      notify(event);
      return event;
    },
    events: () => readEventLines(path),
    lastSeq: () => seq,
    findByIdem: (idem) => byIdem.get(idem),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync() {
      if (closed) return [];
      const current = sizeOf(path);
      // 只增不减（压缩会变小，那种情况由 `replace` 主动通知）。
      if (current === bytes && current !== 0) return [];
      const fresh: LedgerEvent[] = [];
      for (const event of readEventLines(path)) {
        if (event.seq <= seq) continue;
        adopt(event);
        fresh.push(event);
      }
      bytes = current;
      for (const event of fresh) notify(event);
      return fresh;
    },
    replace(events) {
      const next = [...events].sort((left, right) => left.seq - right.seq);
      const temp = `${path}.tmp`;
      writeFileSync(temp, next.map((event) => `${formatEvent(event)}\n`).join(""), "utf8");
      renameSync(temp, path);
      seq = 0;
      byIdem.clear();
      for (const event of next) adopt(event);
      bytes = sizeOf(path);
      fsyncNow();
      for (const event of next) notify(event);
    },
    size: () => sizeOf(path),
    close() {
      closed = true;
      listeners.clear();
      if (openLedgers.get(directory) === ledger) openLedgers.delete(directory);
    },
  };
  return ledger;
};

/** 进程内共享的账本：同一状态目录一份。 */
const openLedgers = new Map<string, Ledger>();

/**
 * 取（或建）某个状态目录的共享账本。
 *
 * worker 的 ack 与编排方的投影必须落在同一个实例上才能共享 `seq` 与订阅，所以这里共享；
 * 释放用 `closeLedger`（测试与退出收尾）。
 * @param directory - 状态目录。
 * @returns 账本句柄。
 */
export const openLedger = (directory: string): Ledger => {
  const existing = openLedgers.get(directory);
  if (existing !== undefined) return existing;
  const created = createLedger(directory);
  openLedgers.set(directory, created);
  return created;
};

/**
 * 关掉某个状态目录的共享账本（退出收尾 / 测试清理）。
 * @param directory - 状态目录。
 */
export const closeLedger = (directory: string): void => {
  openLedgers.get(directory)?.close();
  openLedgers.delete(directory);
};

/** 关掉全部共享账本（测试用）。 */
export const resetLedgers = (): void => {
  for (const ledger of openLedgers.values()) ledger.close();
  openLedgers.clear();
};

/** 归档文件名：`events-<YYYY-MM-DD>.jsonl`（同一天多次压缩追加到同一个文件）。 */
export const archivePath = (directory: string, at: Date = new Date()): string => {
  const stamp = at.toISOString().slice(0, 10);
  return join(directory, `${ARCHIVE_PREFIX}${stamp}.jsonl`);
};

/**
 * 把一串事件追加进归档文件（压缩时调用）。
 * @param directory - 状态目录。
 * @param events - 要归档的旧事件。
 * @param at - 归档时刻（决定文件名里的日期）。
 * @returns 归档文件路径。
 */
export const archiveEvents = (
  directory: string,
  events: readonly LedgerEvent[],
  at: Date = new Date(),
): string => {
  const file = archivePath(directory, at);
  if (events.length > 0) {
    const text = events.map((event) => `${formatEvent(event)}\n`).join("");
    appendFileSync(file, text, "utf8");
  }
  return file;
};

/** 文件锁的持有者信息（写进 lockfile，便于判断残留）。 */
export interface LedgerLock {
  /** lockfile 绝对路径。 */
  readonly path: string;
}

/**
 * 拿账本的文件锁（`open(..., "wx")`，Windows 上也成立）。
 *
 * 拿不到就按 `retryMs` 重试到 `timeoutMs`；超过 `LOCK_STALE_MS` 的 lockfile 视为残留进程
 * 留下的，删掉重试。
 * @param directory - 状态目录。
 * @param options - 超时与重试间隔。
 * @returns 锁；拿不到时抛错。
 */
export const acquireLedgerLock = async (
  directory: string,
  options: { readonly timeoutMs?: number; readonly retryMs?: number } = {},
): Promise<LedgerLock> => {
  const path = join(directory, LOCK_FILE);
  const timeoutMs = options.timeoutMs ?? 3_000;
  const retryMs = options.retryMs ?? 25;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = openSync(path, "wx");
      writeFileSync(fd, `${process.pid} ${new Date().toISOString()}\n`, "utf8");
      closeSync(fd);
      return { path };
    } catch {
      try {
        const age = Date.now() - statSync(path).mtimeMs;
        if (age > LOCK_STALE_MS) rmSync(path, { force: true });
      } catch {
        // lockfile 刚好被释放：直接重试。
      }
      if (Date.now() >= deadline) throw new Error(`账本正被另一个进程压缩（${path}）`);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
};

/**
 * 释放文件锁。
 * @param lock - `acquireLedgerLock` 的返回值。
 */
export const releaseLedgerLock = (lock: LedgerLock): void => {
  rmSync(lock.path, { force: true });
};
