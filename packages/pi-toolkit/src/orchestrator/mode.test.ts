import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildSeed,
  currentPlanOf,
  CURRENT_PLAN_ENTRY,
  isOrchestratorActive,
  latestResetAt,
  MODE_ENTRY,
  RESET_ENTRY,
  sessionModeOf,
  type BranchEntryLike,
} from "./mode.ts";

const created: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-nano-mode-"));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const modeEntry = (enabled: boolean): BranchEntryLike => ({
  type: "custom",
  customType: MODE_ENTRY,
  data: { enabled },
});

const resetEntry = (at: number): BranchEntryLike => ({
  type: "custom",
  customType: RESET_ENTRY,
  data: { at },
});

describe("sessionModeOf", () => {
  it("uses the last mode entry on the branch", () => {
    expect(sessionModeOf([])).toBeUndefined();
    expect(sessionModeOf([modeEntry(true), modeEntry(false)])).toBe(false);
    expect(sessionModeOf([modeEntry(false), { type: "message" }, modeEntry(true)])).toBe(true);
  });
});

describe("isOrchestratorActive", () => {
  it("requires the toolkit switch even when always is on", () => {
    expect(isOrchestratorActive([], { switchOn: false, always: true })).toBe(false);
    expect(isOrchestratorActive([modeEntry(true)], { switchOn: false, always: false })).toBe(false);
  });

  it("lets a session override win over the global default", () => {
    expect(isOrchestratorActive([], { switchOn: true, always: true })).toBe(true);
    expect(isOrchestratorActive([modeEntry(false)], { switchOn: true, always: true })).toBe(false);
    expect(isOrchestratorActive([modeEntry(true)], { switchOn: true, always: false })).toBe(true);
  });
});

describe("latestResetAt", () => {
  it("returns the most recent reset timestamp", () => {
    expect(latestResetAt([])).toBeUndefined();
    expect(latestResetAt([resetEntry(10), resetEntry(20)])).toBe(20);
  });
});

describe("buildSeed", () => {
  it("names the only active plan", async () => {
    const root = await tempDir();
    const plan = join(root, ".agents/domains/demo/plans/active/2026-11-08-种子计划");
    await mkdir(plan, { recursive: true });
    await writeFile(join(plan, "notes.json"), JSON.stringify({ version: 1, index: [], notes: [] }));
    const seed = await buildSeed(root, ".agents/domains");
    expect(seed).toContain("demo/active/2026-11-08-种子计划");
    expect(seed).toContain("orchestrator_read");
  });

  it("tells the model to init a plan when there is none", async () => {
    const root = await tempDir();
    const seed = await buildSeed(root, ".agents/domains");
    expect(seed).toContain("没有 active Plan");
    expect(seed).toContain("init");
  });

  it("names the current plan even when several are active（不再让用户挑）", async () => {
    const root = await tempDir();
    const made: string[] = [];
    for (const name of ["2026-11-08-甲", "2026-11-08-乙"]) {
      const plan = join(root, `.agents/domains/demo/plans/active/${name}`);
      await mkdir(plan, { recursive: true });
      await writeFile(
        join(plan, "notes.json"),
        JSON.stringify({ version: 1, index: [], notes: [] }),
      );
      made.push(plan);
    }
    // 当前 Plan 由会话记录给出：种子里直接指名它。
    const seed = await buildSeed(root, ".agents/domains", made[1]);
    expect(seed).toContain("demo/active/2026-11-08-乙");
    expect(seed).toContain("恢复当前 Plan");
    expect(seed).not.toContain("先问用户");

    // 没有记录时也不问：退到唯一的 active Plan。
    const only = join(root, ".agents/domains/demo/plans/active/2026-11-08-丙");
    await mkdir(only, { recursive: true });
    await writeFile(join(only, "notes.json"), JSON.stringify({ version: 1, index: [], notes: [] }));
    expect(await buildSeed(root, ".agents/domains")).not.toContain("先问用户");
  });

  it("falls back to the most recently updated plan instead of asking", async () => {
    const root = await tempDir();
    for (const name of ["2026-11-08-甲", "2026-11-08-乙"]) {
      const plan = join(root, `.agents/domains/demo/plans/active/${name}`);
      await mkdir(plan, { recursive: true });
      await writeFile(
        join(plan, "notes.json"),
        JSON.stringify({ version: 1, index: [], notes: [] }),
      );
    }
    const seed = await buildSeed(root, ".agents/domains");
    expect(seed).toContain("恢复当前 Plan");
    expect(seed).toContain("不要问用户挑 Plan");
    expect(seed).not.toContain("先问用户是哪个");
  });

  it("ignores a recorded plan that no longer exists", async () => {
    const root = await tempDir();
    const plan = join(root, ".agents/domains/demo/plans/active/2026-11-08-现有");
    await mkdir(plan, { recursive: true });
    await writeFile(join(plan, "notes.json"), JSON.stringify({ version: 1, index: [], notes: [] }));
    const gone = join(root, ".agents/domains/demo/plans/active/2026-11-08-已归档");
    expect(await buildSeed(root, ".agents/domains", gone)).toContain("demo/active/2026-11-08-现有");
  });
});

describe("currentPlanOf", () => {
  const planEntry = (directory: string): BranchEntryLike => ({
    type: "custom",
    customType: CURRENT_PLAN_ENTRY,
    data: { directory },
  });

  it("取最后一条记下的 Plan 目录", () => {
    expect(currentPlanOf([])).toBeUndefined();
    expect(currentPlanOf([planEntry("/w/a"), { type: "message" }, planEntry("/w/b")])).toBe("/w/b");
  });

  it("坏数据跳过", () => {
    expect(currentPlanOf([{ type: "custom", customType: CURRENT_PLAN_ENTRY, data: {} }])).toBe(
      undefined,
    );
  });
});
