import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { applyMarks, scanDreamInput } from "./scripts/dream-scan.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "dream-scan-"));
  roots.push(root);
  return root;
};

const PLAN = "2026-01-01-示例";
const PLAN_PATH = ".agents/domains/demo/plans/active/" + PLAN;
const SESSION_A = "session-a";
const SESSION_B = "session-b";

const writeLog = async (root: string, lines: readonly string[]): Promise<void> => {
  const directory = join(root, PLAN_PATH);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "log.jsonl"), lines.join("\n") + "\n", "utf8");
};

const turn = (sessionId: string, number: number, from: number, to: number, user: string): string =>
  JSON.stringify({
    type: "turn",
    v: 1,
    sessionId,
    turn: number,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    user,
    assistant: "回复 " + number,
    tools: [{ name: "bash", ok: true }],
    usage: {},
    seq: [from, to],
  });

const header = (sessionId: string): string =>
  JSON.stringify({ type: "session", v: 1, sessionId, planPath: PLAN_PATH });

const writeCursor = async (root: string, state: unknown): Promise<string> => {
  const statePath = join(root, "cursor.json");
  await writeFile(statePath, JSON.stringify(state), "utf8");
  return statePath;
};

const planOf = (report: ReturnType<typeof scanDreamInput>) => report.domains[0]?.plans[0];

describe("scanDreamInput", () => {
  it("treats a missing cursor as full scan and groups by domain", async () => {
    const root = await makeRoot();
    await writeLog(root, [header(SESSION_A), turn(SESSION_A, 1, 4, 533, "第一轮")]);
    const report = scanDreamInput({ rootDir: root, statePath: join(root, "cursor.json") });
    const plan = planOf(report);
    expect(report.domains[0]?.domain).toBe("demo");
    expect(plan?.planPath).toBe(PLAN_PATH);
    expect(plan?.sessions[0]?.sessionId).toBe(SESSION_A);
    expect(plan?.sessions[0]?.lastSeq).toBe(0);
    expect(plan?.sessions[0]?.latestSeq).toBe(533);
    expect(plan?.sessions[0]?.turns[0]?.seq).toEqual([4, 533]);
    expect(plan?.sessions[0]?.turns[0]?.tools).toEqual(["bash"]);
  });

  it("keeps cursors per session because seq restarts in a new session", async () => {
    const root = await makeRoot();
    await writeLog(root, [
      header(SESSION_A),
      turn(SESSION_A, 1, 4, 533, "A 第一轮"),
      turn(SESSION_A, 2, 535, 1368, "A 第二轮"),
      header(SESSION_B),
      turn(SESSION_B, 1, 4, 102, "B 第一轮"),
    ]);
    const statePath = await writeCursor(root, {
      version: 2,
      plans: { [PLAN_PATH]: { sessions: { [SESSION_A]: { lastSeq: 533 } } } },
    });
    const plan = planOf(scanDreamInput({ rootDir: root, statePath }));
    const a = plan?.sessions.find((session) => session.sessionId === SESSION_A);
    const b = plan?.sessions.find((session) => session.sessionId === SESSION_B);
    expect(a?.turns.map((item) => item.turn)).toEqual([2]);
    expect(b?.turns.map((item) => item.turn)).toEqual([1]);
    expect(b?.lastSeq).toBe(0);
  });

  it("ignores a v1 cursor and rescans everything", async () => {
    const root = await makeRoot();
    await writeLog(root, [header(SESSION_A), turn(SESSION_A, 1, 4, 533, "第一轮")]);
    const statePath = await writeCursor(root, {
      version: 1,
      plans: { [PLAN_PATH]: { lastSeq: 533 } },
    });
    const plan = planOf(scanDreamInput({ rootDir: root, statePath }));
    expect(plan?.sessions[0]?.turns).toHaveLength(1);
  });

  it("lists plans without new turns as idle", async () => {
    const root = await makeRoot();
    await writeLog(root, [header(SESSION_A), turn(SESSION_A, 1, 4, 533, "第一轮")]);
    const statePath = await writeCursor(root, {
      version: 2,
      plans: { [PLAN_PATH]: { sessions: { [SESSION_A]: { lastSeq: 533 } } } },
    });
    const report = scanDreamInput({ rootDir: root, statePath });
    expect(report.domains).toEqual([]);
    expect(report.idle[0]?.plans[0]?.planPath).toBe(PLAN_PATH);
  });

  it("reports skipped records for foreign or broken logs", async () => {
    const root = await makeRoot();
    await writeLog(root, [
      JSON.stringify({ type: "run", v: 1, sessionId: "pi", run: 1, entries: [] }),
      JSON.stringify({ type: "run", v: 1, sessionId: "pi", run: 2, entries: [] }),
      "{oops",
    ]);
    const report = scanDreamInput({ rootDir: root, statePath: join(root, "cursor.json") });
    expect(report.domains).toEqual([]);
    expect(report.warnings).toEqual([
      { planPath: PLAN_PATH, skipped: { malformed: 1, unknown: 2, invalidTurn: 0 } },
    ]);
  });

  it("skips malformed log lines instead of failing", async () => {
    const root = await makeRoot();
    await writeLog(root, [header(SESSION_A), "{oops", turn(SESSION_A, 1, 4, 533, "第一轮")]);
    const plan = planOf(scanDreamInput({ rootDir: root, statePath: join(root, "cursor.json") }));
    expect(plan?.sessions[0]?.turns).toHaveLength(1);
  });
});

describe("applyMarks", () => {
  it("writes the seq upper bound per session and never moves backwards", async () => {
    const root = await makeRoot();
    const statePath = await writeCursor(root, { version: 2, plans: {} });
    applyMarks(statePath, [{ planPath: PLAN_PATH, sessionId: SESSION_A, seq: 1368 }]);
    const state = applyMarks(statePath, [
      { planPath: PLAN_PATH, sessionId: SESSION_A, seq: 10 },
      { planPath: PLAN_PATH, sessionId: SESSION_B, seq: 533 },
    ]);
    expect(state.plans[PLAN_PATH]?.sessions[SESSION_A]?.lastSeq).toBe(1368);
    expect(state.plans[PLAN_PATH]?.sessions[SESSION_B]?.lastSeq).toBe(533);
  });

  it("makes the next scan see nothing new", async () => {
    const root = await makeRoot();
    await writeLog(root, [header(SESSION_A), turn(SESSION_A, 1, 4, 533, "第一轮")]);
    const statePath = join(root, "cursor.json");
    applyMarks(statePath, [{ planPath: PLAN_PATH, sessionId: SESSION_A, seq: 533 }]);
    const report = scanDreamInput({ rootDir: root, statePath });
    expect(report.domains).toEqual([]);
  });
});
