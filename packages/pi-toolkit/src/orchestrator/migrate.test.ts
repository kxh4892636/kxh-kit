import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_ORCHESTRATOR_SETTINGS } from "./config.ts";
import { serializeDocument } from "./dag.ts";
import { LEDGER_FILE, openLedger, resetLedgers } from "./ledger.ts";
import {
  LEGACY_INTERRUPTED_FILE,
  LEGACY_REPORTS_FILE,
  ledgerExists,
  migrateLedger,
} from "./migrate.ts";
import { createProjection, resetProjections } from "./projection.ts";
import { NOTES_FILE } from "./store.ts";

const created: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-migrate-"));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  resetProjections();
  resetLedgers();
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** 造一个带一条 in_progress note 的 Plan 工作区。 */
const workspace = async (): Promise<string> => {
  const root = await tempDir();
  const directory = join(root, ".agents/domains/etf/plans/active/2026-11-07-示例");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, NOTES_FILE),
    serializeDocument({
      version: 1,
      index: [],
      notes: [
        {
          id: "01",
          title: "旧活",
          description: "摘要",
          status: "in_progress",
          blocked_by: [],
          evidence: [],
          updated_at: "2026-11-07T00:00:00.000Z",
          content: "正文",
        },
      ],
    }),
    "utf8",
  );
  return root;
};

const options = async (stateDir: string) => ({
  stateDir,
  workspace: await workspace(),
  domainRoot: ".agents/domains",
  limits: DEFAULT_ORCHESTRATOR_SETTINGS,
});

describe("首启迁移", () => {
  it("把 notes 状态 / 崩溃凭据 / 未送达 report 并成一条初始 snapshot，再删旧文件", async () => {
    const stateDir = await tempDir();
    await writeFile(
      join(stateDir, LEGACY_INTERRUPTED_FILE),
      JSON.stringify({
        at: "2026-11-07T00:00:00.000Z",
        reason: "uncaughtException: worker 炸了",
        plans: ["etf/active/2026-11-07-示例"],
        notes: ["etf/active/2026-11-07-示例 · note 01"],
      }),
      "utf8",
    );
    await writeFile(
      join(stateDir, LEGACY_REPORTS_FILE),
      JSON.stringify({
        notices: [
          {
            id: 1,
            customType: "orchestrator-report",
            content: "[worker] needs_review · note 01: 改完了",
            planRef: "etf/active/2026-11-07-示例",
            at: Date.parse("2026-11-07T00:00:01.000Z"),
            attempts: 2,
            details: {
              outcome: "needs_review",
              note: "01",
              summary: "改完了",
              evidence: ["npm test: 430 passed"],
            },
          },
          // 认不出来的通知直接跳过。
          { id: 2, customType: "x", content: "", at: 0, attempts: 0 },
        ],
      }),
      "utf8",
    );

    expect(ledgerExists(stateDir)).toBe(false);
    const outcome = await migrateLedger(await options(stateDir));
    expect(outcome).toMatchObject({ migrated: true, notes: 1 });
    expect([...outcome.removed].sort()).toEqual(
      [LEGACY_INTERRUPTED_FILE, LEGACY_REPORTS_FILE].sort(),
    );
    expect(ledgerExists(stateDir)).toBe(true);

    // 账本里只有一条 snapshot（seq 1），旧文件已删。
    const lines = (await readFile(join(stateDir, LEDGER_FILE), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ seq: 1, type: "snapshot" });

    // 重放出来的投影：note 状态缓存、凭据、未读 report 都在。
    const projection = createProjection(openLedger(stateDir), { pollMs: 1_000 });
    const state = projection.state();
    expect(state.notesStatus.get("/x")).toBeUndefined();
    const notesStatus = [...state.notesStatus.values()];
    expect(notesStatus[0]?.status).toBe("in_progress");
    expect(state.interrupted).toMatchObject({ plans: ["etf/active/2026-11-07-示例"] });
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]).toMatchObject({
      outcome: "needs_review",
      summary: "改完了",
      evidence: ["npm test: 430 passed"],
      read: false,
    });
    projection.dispose();
  });

  it("旧文件不存在时也写一条空 snapshot（首启有账本）", async () => {
    const stateDir = await tempDir();
    const outcome = await migrateLedger(await options(stateDir));
    expect(outcome).toMatchObject({ migrated: true, removed: [] });
    expect(openLedger(stateDir).events()).toHaveLength(1);
  });

  it("账本已有事件时不再迁移，也不删旧文件", async () => {
    const stateDir = await tempDir();
    const ledger = openLedger(stateDir);
    ledger.append({ type: "state.pulled", payload: { workers: 0, reports: 0 } });
    await writeFile(
      join(stateDir, LEGACY_INTERRUPTED_FILE),
      JSON.stringify({ reason: "x" }),
      "utf8",
    );
    const outcome = await migrateLedger(await options(stateDir));
    expect(outcome.migrated).toBe(false);
    expect(ledger.events()).toHaveLength(1);
    await expect(readFile(join(stateDir, LEGACY_INTERRUPTED_FILE), "utf8")).resolves.toContain("x");
  });
});
