import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  acquireLedgerLock,
  archiveEvents,
  createLedger,
  LEDGER_FILE,
  LOCK_FILE,
  openLedger,
  releaseLedgerLock,
  resetLedgers,
} from "./ledger.ts";
import type { LedgerEvent } from "./events.ts";

const created: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-ledger-"));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  resetLedgers();
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const sent = (worker: string, idem?: string) => ({
  type: "input.sent" as const,
  payload: { worker, kind: "message", text: "做 01" },
  ...(idem === undefined ? {} : { idem }),
});

describe("账本读写", () => {
  it("追加后能原样读回，seq 单调", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const first = ledger.append(sent("/w/p::01"));
    const second = ledger.append({ type: "state.pulled", payload: {} });
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(ledger.lastSeq()).toBe(2);

    // 只追加：文件里就是两行 JSON。
    const lines = (await readFile(join(dir, LEDGER_FILE), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ seq: 1, type: "input.sent" });

    // 新实例（模拟重启）只靠文件重建。
    const reopened = createLedger(dir);
    expect(reopened.events().map((event) => event.seq)).toEqual([1, 2]);
    expect(reopened.lastSeq()).toBe(2);
  });

  it("同一幂等键只落一次，重复 append 返回既有事件", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const first = ledger.append(sent("/w/p::01", "dispatch:abc"));
    const again = ledger.append(sent("/w/p::01", "dispatch:abc"));
    expect(again.seq).toBe(first.seq);
    expect(ledger.events()).toHaveLength(1);
    expect(ledger.findByIdem("dispatch:abc")?.seq).toBe(first.seq);

    // 重启后幂等仍然成立（幂等表从文件重建）。
    const reopened = createLedger(dir);
    expect(reopened.findByIdem("dispatch:abc")?.seq).toBe(first.seq);
    reopened.append(sent("/w/p::01", "dispatch:abc"));
    expect(reopened.events()).toHaveLength(1);
  });

  it("坏行跳过，好行照读", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append(sent("temp:1"));
    await writeFile(join(dir, LEDGER_FILE), "{坏行\n", { flag: "a" });
    ledger.append({ type: "state.pulled", payload: {} });
    const reopened = createLedger(dir);
    expect(reopened.events().map((event) => event.type)).toEqual(["input.sent", "state.pulled"]);
    // 坏行不会占用 seq：新事件接着 2 走。
    expect(reopened.append({ type: "state.pulled", payload: {} }).seq).toBe(3);
  });

  it("订阅者在 append 时同步收到（同进程毫秒级路径）", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const seen: number[] = [];
    const stop = ledger.subscribe((event) => seen.push(event.seq));
    ledger.append(sent("temp:1"));
    ledger.append(sent("temp:1"));
    stop();
    ledger.append(sent("temp:1"));
    expect(seen).toEqual([1, 2]);
  });

  it("另一个实例写入后 sync 能捡到，并保持 seq 不撞车", async () => {
    const dir = await tempDir();
    const mine = createLedger(dir);
    mine.append(sent("temp:1"));

    const other = createLedger(dir);
    other.append(sent("temp:2"));
    const picked: LedgerEvent[] = [];
    mine.subscribe((event) => picked.push(event));
    const fresh = mine.sync();
    expect(fresh.map((event) => event.seq)).toEqual([2]);
    expect(picked.map((event) => event.seq)).toEqual([2]);

    // 自己再写时 seq 接着别人走。
    expect(mine.append(sent("temp:3")).seq).toBe(3);
    // 没有新内容时 sync 是空操作。
    expect(mine.sync()).toEqual([]);
  });

  it("openLedger 同一状态目录共享一份实例", async () => {
    const dir = await tempDir();
    expect(openLedger(dir)).toBe(openLedger(dir));
  });

  it("replace 换掉整本并重置 seq / 幂等表", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append(sent("temp:1", "a"));
    ledger.append(sent("temp:2", "b"));
    const snapshot: LedgerEvent = {
      seq: 3,
      at: "2026-11-07T10:00:00.000Z",
      type: "snapshot",
      payload: { upToSeq: 2, state: {} },
    };
    const notified: string[] = [];
    ledger.subscribe((event) => notified.push(event.type));
    ledger.replace([snapshot]);
    expect(notified).toEqual(["snapshot"]);
    expect(ledger.lastSeq()).toBe(3);
    expect(ledger.findByIdem("a")).toBeUndefined();
    expect(ledger.events()).toEqual([snapshot]);
    expect(ledger.append({ type: "state.pulled", payload: {} }).seq).toBe(4);
  });

  it("归档把旧行写进按日期命名的文件", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append(sent("temp:1"));
    ledger.append(sent("temp:2"));
    const file = archiveEvents(dir, ledger.events(), new Date("2026-11-07T10:00:00.000Z"));
    expect(file.endsWith("events-2026-11-07.jsonl")).toBe(true);
    const archived = (await readFile(file, "utf8")).trim().split("\n");
    expect(archived).toHaveLength(2);
  });

  it("文件锁互斥，释放后可再拿", async () => {
    const dir = await tempDir();
    const lock = await acquireLedgerLock(dir);
    await expect(acquireLedgerLock(dir, { timeoutMs: 60, retryMs: 10 })).rejects.toThrow(
      /正被另一个进程压缩/u,
    );
    releaseLedgerLock(lock);
    const again = await acquireLedgerLock(dir, { timeoutMs: 60, retryMs: 10 });
    expect(again.path.endsWith(LOCK_FILE)).toBe(true);
    releaseLedgerLock(again);
  });
});
