import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildSeed,
  isNanoFlowActive,
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

describe("isNanoFlowActive", () => {
  it("requires the toolkit switch even when always is on", () => {
    expect(isNanoFlowActive([], { switchOn: false, always: true })).toBe(false);
    expect(isNanoFlowActive([modeEntry(true)], { switchOn: false, always: false })).toBe(false);
  });

  it("lets a session override win over the global default", () => {
    expect(isNanoFlowActive([], { switchOn: true, always: true })).toBe(true);
    expect(isNanoFlowActive([modeEntry(false)], { switchOn: true, always: true })).toBe(false);
    expect(isNanoFlowActive([modeEntry(true)], { switchOn: true, always: false })).toBe(true);
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
    expect(seed).toContain("nano_flow_read");
  });

  it("falls back to asking which plan when there are zero or several", async () => {
    const root = await tempDir();
    expect(await buildSeed(root, ".agents/domains")).toContain("先问用户");
  });
});
