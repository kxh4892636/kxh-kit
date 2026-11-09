import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  appendRunRecord,
  buildRunRecord,
  countRuns,
  enqueueAppend,
  entriesSince,
  planLogPath,
  runCountOf,
} from "./log.ts";

const created: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-nano-log-"));
  created.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const record = (run: number) =>
  buildRunRecord({
    sessionId: "session-1",
    sessionFile: "/sessions/s1.jsonl",
    cwd: "/ws",
    planPath: ".agents/domains/demo/plans/active/2026-11-09-示例",
    run,
    startedAt: Date.parse("2026-11-09T00:00:00.000Z"),
    endedAt: Date.parse("2026-11-09T00:01:00.000Z"),
    entries: [{ type: "message", id: "a1" }],
  });

describe("plan log", () => {
  it("keeps only the entries appended after the run mark", () => {
    const entries = [{ id: "a1" }, { id: "b2" }, { id: "c3" }];
    expect(entriesSince(entries, "a1").map((entry) => entry.id)).toEqual(["b2", "c3"]);
    // 标记丢失或不在当前分支：宁可不记，也不重记历史。
    expect(entriesSince(entries, undefined)).toEqual([]);
    expect(entriesSince(entries, "missing")).toEqual([]);
    expect(entriesSince([], "a1")).toEqual([]);
  });

  it("builds a versioned run record", () => {
    const built = record(2);
    expect(built).toMatchObject({
      type: "run",
      v: 1,
      run: 2,
      startedAt: "2026-11-09T00:00:00.000Z",
      endedAt: "2026-11-09T00:01:00.000Z",
      planPath: ".agents/domains/demo/plans/active/2026-11-09-示例",
    });
    expect(built.entries).toEqual([{ type: "message", id: "a1" }]);
  });

  it("counts runs, tolerating blank and broken lines", () => {
    expect(countRuns("")).toBe(0);
    expect(countRuns(`${JSON.stringify(record(1))}\n\nnot-json\n`)).toBe(1);
    expect(
      countRuns(
        `${JSON.stringify(record(1))}\n${JSON.stringify({ type: "other" })}\n${JSON.stringify(record(2))}\n`,
      ),
    ).toBe(2);
  });

  it("appends one line per run and numbers them", async () => {
    const dir = tempDir();
    const file = planLogPath(dir);
    expect(await runCountOf(file)).toBe(0);

    await enqueueAppend(file, async (run) => record(run));
    await enqueueAppend(file, async (run) => record(run));
    await appendRunRecord(file, record(9));

    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ run: 1 });
    expect(JSON.parse(lines[1] ?? "{}")).toMatchObject({ run: 2 });
    expect(JSON.parse(lines[2] ?? "{}")).toMatchObject({ run: 9 });
    expect(await runCountOf(file)).toBe(3);
  });

  it("serializes concurrent appends on the same file", async () => {
    const dir = tempDir();
    const file = planLogPath(dir);
    await Promise.all([
      enqueueAppend(file, async (run) => record(run)),
      enqueueAppend(file, async (run) => record(run)),
      enqueueAppend(file, async (run) => record(run)),
    ]);
    const runs = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { run: number }).run);
    expect(runs).toEqual([1, 2, 3]);
  });

  it("keeps going after a broken existing line", async () => {
    const dir = tempDir();
    const file = planLogPath(dir);
    writeFileSync(file, "broken\n", "utf8");
    await enqueueAppend(file, async (run) => record(run));
    expect(await runCountOf(file)).toBe(1);
  });

  it("creates the plan directory when missing", async () => {
    const planDir = join(tempDir(), "nested", "plan");
    const file = planLogPath(planDir);
    await appendRunRecord(file, record(1));
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(1);
  });
});
