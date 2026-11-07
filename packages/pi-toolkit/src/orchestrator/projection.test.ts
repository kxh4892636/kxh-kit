import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createLedger, LEDGER_FILE, resetLedgers } from "./ledger.ts";
import {
  applyEvent,
  compactLedger,
  createProjection,
  openProjection,
  project,
  resetProjections,
  snapshotState,
} from "./projection.ts";
import type { LedgerEvent } from "./events.ts";

const created: string[] = [];
const projections: Array<{ dispose(): void }> = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-projection-"));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  for (const projection of projections.splice(0)) projection.dispose();
  resetProjections();
  resetLedgers();
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const sent = (worker: string, text: string, extra: Record<string, unknown> = {}) => ({
  type: "input.sent" as const,
  payload: {
    worker,
    planRef: "etf/active/p",
    kind: "message",
    delivery: "queue",
    delivered: "queued",
    text,
    ...extra,
  },
});

const waitFor = async (check: () => boolean, timeoutMs = 3_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("等待超时");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe("投影重放", () => {
  it("worker 表、待消费输入、最后输入都从事件重建", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append({
      type: "worker.spawned",
      payload: {
        worker: "/w/p::01",
        planRef: "etf/active/p",
        kind: "plan",
        notes: ["01"],
        sessionPath: "/s/worker-1.jsonl",
      },
    });
    ledger.append(sent("/w/p::01", "做 01"));
    ledger.append(sent("/w/p::01", "做 02", { delivery: "steer", delivered: "steered" }));

    const state = project(ledger.events());
    const worker = state.workers.get("/w/p::01");
    expect(worker).toMatchObject({ planRef: "etf/active/p", status: "live", inputs: 2 });
    expect(worker?.notes).toEqual(["01"]);
    expect(worker?.sessionPath).toBe("/s/worker-1.jsonl");
    expect(worker?.pending.map((input) => input.text)).toEqual(["做 01", "做 02"]);
    expect(worker?.lastInput?.delivery).toBe("steer");
  });

  it("ack 按 seq 精确消掉那一条；缺 seq 时退化为最老一条", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const first = ledger.append(sent("temp:1", "一"));
    ledger.append(sent("temp:1", "二"));
    ledger.append({ type: "input.consumed", payload: { worker: "temp:1", seqOfSent: first.seq } });
    expect(
      project(ledger.events())
        .workers.get("temp:1")
        ?.pending.map((i) => i.text),
    ).toEqual(["二"]);
    ledger.append({ type: "input.consumed", payload: { worker: "temp:1" } });
    expect(project(ledger.events()).workers.get("temp:1")?.pending).toEqual([]);
  });

  it("同一 idem 的 input.sent 只算一次", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const input = { ...sent("temp:1", "重复"), idem: "dispatch:1" };
    ledger.append(input);
    // 绕过账本层去重，直接问投影：重放也要幂等。
    const state = project([
      ...ledger.events(),
      { seq: 99, at: "2026-11-07T00:00:00.000Z", ...input },
    ]);
    expect(state.workers.get("temp:1")?.inputs).toBe(1);
  });

  it("report 未读直到 state.pulled，未读集合能重放", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append({
      type: "report.filed",
      payload: {
        worker: "temp:1",
        note: "01",
        outcome: "needs_review",
        summary: "改完了",
        evidence: ["npm test: 430 passed"],
      },
    });
    const projection = createProjection(ledger, { pollMs: 50 });
    projections.push(projection);
    expect(projection.unreadReports()).toHaveLength(1);
    expect(projection.unreadReports()[0]).toMatchObject({
      outcome: "needs_review",
      summary: "改完了",
    });
    ledger.append({ type: "state.pulled", payload: { workers: 1, reports: 1 } });
    expect(projection.unreadReports()).toEqual([]);
    expect(projection.state().workers.get("temp:1")?.lastReport?.summary).toBe("改完了");
  });

  it("note.pass 重放成放行集合（重启不丢）", async () => {
    const dir = await tempDir();
    const first = createLedger(dir);
    first.append({ type: "note.pass", payload: { plan: "/w/p", note: "45" } });
    resetLedgers();

    // 模拟进程重启：新账本实例只读文件。
    const reopened = createLedger(dir);
    const projection = createProjection(reopened, { pollMs: 50 });
    projections.push(projection);
    expect(projection.isReleased("/w/p", "45")).toBe(true);
    expect(projection.isReleased("/w/p", "46")).toBe(false);
  });

  it("退出即凭据：worker.exit 带 in_progress 的 note 记进 interrupted", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append({
      type: "worker.spawned",
      payload: { worker: "/w/p::", planRef: "etf/active/p", kind: "plan" },
    });
    ledger.append({
      type: "worker.exit",
      payload: {
        worker: "/w/p::",
        reason: "session_shutdown",
        notes: ["etf/active/p · note 01"],
      },
    });
    const projection = createProjection(ledger, { pollMs: 50 });
    projections.push(projection);
    const state = projection.state();
    expect(state.workers.get("/w/p::")?.status).toBe("exited");
    expect(state.interrupted).toMatchObject({
      reason: "session_shutdown",
      plans: ["etf/active/p"],
      notes: ["etf/active/p · note 01"],
    });
    ledger.append({ type: "interrupted.forgotten", payload: { planRef: "etf/active/p" } });
    expect(projection.state().interrupted).toBeUndefined();
  });

  it("超时事件记在 worker 上", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append(sent("temp:1", "卡住"));
    ledger.append({
      type: "timeout",
      payload: { worker: "temp:1", cause: "input", oldestUnconsumedSeq: 1, elapsedMs: 600_000 },
    });
    const worker = project(ledger.events()).workers.get("temp:1");
    expect(worker?.timedOut).toMatchObject({ cause: "input", elapsedMs: 600_000 });
  });

  it("同进程 append 后订阅者立刻收到（<50ms）", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const projection = createProjection(ledger, { pollMs: 1_000 });
    projections.push(projection);
    const started = Date.now();
    let delay = Number.POSITIVE_INFINITY;
    const stop = projection.subscribe(() => {
      delay = Date.now() - started;
    });
    ledger.append(sent("temp:1", "即刻"));
    stop();
    expect(projection.state().workers.get("temp:1")?.pending).toHaveLength(1);
    expect(delay).toBeLessThan(50);
  });

  it("另一个进程/实例写入后靠 fs.watch + 轮询跟上", async () => {
    const dir = await tempDir();
    const mine = createProjection(createLedger(dir), { pollMs: 50 });
    projections.push(mine);
    const other = createLedger(dir);
    other.append(sent("temp:9", "别人写的"));
    await waitFor(() => mine.state().workers.has("temp:9"));
    expect(mine.oldestPendingOf("temp:9")?.text).toBe("别人写的");
  });

  it("openProjection 同一账本共享一份", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const first = openProjection(ledger);
    expect(openProjection(ledger)).toBe(first);
  });
});

describe("snapshot 压缩", () => {
  it("压缩后只剩一条 snapshot，旧行归档，重放结果不变", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append({ type: "note.pass", payload: { plan: "/w/p", note: "45" } });
    const sendEvent = ledger.append(sent("temp:1", "待消费的一条"));
    ledger.append({
      type: "report.filed",
      payload: { worker: "temp:1", note: "01", outcome: "done", summary: "在跑" },
    });
    ledger.append({
      type: "input.consumed",
      payload: { worker: "temp:1", seqOfSent: sendEvent.seq },
    });
    const before = project(ledger.events());

    const outcome = await compactLedger(ledger, {
      threshold: 2,
      now: new Date("2026-11-07T10:00:00.000Z"),
    });
    expect(outcome?.removed).toBe(4);
    expect(outcome?.archived.endsWith("events-2026-11-07.jsonl")).toBe(true);

    // 主账本只剩一条 snapshot；归档里有全部旧行。
    const lines = (await readFile(join(dir, LEDGER_FILE), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ type: "snapshot" });
    const archived = (await readFile(outcome?.archived ?? "", "utf8")).trim().split("\n");
    expect(archived).toHaveLength(4);

    // 重放结果与压缩前一致：放行、待消费、report 都在。
    const after = project(ledger.events());
    expect(after.released.get("/w/p")).toEqual(new Set(["45"]));
    expect(after.workers.get("temp:1")?.inputs).toBe(1);
    expect(after.workers.get("temp:1")?.pending).toHaveLength(0);
    expect(after.workers.get("temp:1")?.lastReport?.summary).toBe("在跑");
    expect(after.lastSeq).toBe(outcome?.snapshotSeq ?? 0);
    expect(sendEvent.seq).toBe(2);
    expect(before.workers.get("temp:1")?.inputs).toBe(1);

    // 压缩后继续追加：seq 接着 snapshot 走。
    expect(ledger.append(sent("temp:2", "新的")).seq).toBe((outcome?.snapshotSeq ?? 0) + 1);
  });

  it("不到门槛不压", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    ledger.append(sent("temp:1", "一"));
    expect(await compactLedger(ledger, { threshold: 10 })).toBeUndefined();
    expect(ledger.events()).toHaveLength(1);
  });

  it("snapshot 里的坏数据当作空投影", () => {
    const dir = "/nonexistent";
    const event: LedgerEvent = {
      seq: 5,
      at: "2026-11-07T00:00:00.000Z",
      type: "snapshot",
      payload: { upToSeq: 4, state: { version: 999 } },
    };
    const state = project([event]);
    expect(state.workers.size).toBe(0);
    expect(state.lastSeq).toBe(5);
    expect(dir).toBe("/nonexistent");
  });

  it("snapshot 丢掉的幂等键只留最近 500 条", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    for (let index = 0; index < 510; index += 1) {
      ledger.append({ ...sent("temp:1", `第 ${index} 条`), idem: `idem-${index}` });
    }
    const state = project(ledger.events());
    const snapshot = snapshotState(state) as { seenIdem: string[] };
    expect(snapshot.seenIdem).toHaveLength(500);
    expect(snapshot.seenIdem.at(-1)).toBe("idem-509");
  });

  it("applyEvent 跳过旧 seq（重放幂等）", async () => {
    const dir = await tempDir();
    const ledger = createLedger(dir);
    const event = ledger.append(sent("temp:1", "一"));
    const state = project([event]);
    expect(applyEvent(state, event)).toBe(false);
    expect(state.workers.get("temp:1")?.inputs).toBe(1);
  });
});
