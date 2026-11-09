import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS, limitsOf } from "./config.ts";
import {
  buildSeed,
  bindingOf,
  isNanoFlowActive,
  lastAssistantAt,
  lastAssistantText,
  latestResetOf,
  MODE_ENTRY,
  BINDING_ENTRY,
  RESET_ENTRY,
  resolveBindingDirectory,
  sessionModeOf,
  truncateTail,
} from "./mode.ts";
import { readUnfinishedNotes } from "./notes.ts";
import { activePlans, listPlans, planRefFromDirectory, resolvePlan } from "./plan.ts";

const created: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-nano-core-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const message = (role: "assistant" | "user", text: string, timestamp: string) => ({
  type: "message",
  timestamp,
  message: { role, content: [{ type: "text", text }] },
});

describe("config", () => {
  it("ships the documented defaults and only numeric limits", () => {
    expect(DEFAULT_NANO_FLOW_SETTINGS).toMatchObject({
      specMaxBytes: 34 * 1024,
      noteMaxBytes: 13 * 1024,
      noteDescriptionMaxChars: 233,
      contextMaxBytes: 89 * 1024,
      rotateAt: 0.618,
    });
    expect(Object.keys(limitsOf(DEFAULT_NANO_FLOW_SETTINGS)).sort()).toEqual([
      "adrMaxBytes",
      "contextMaxBytes",
      "guideMaxBytes",
      "noteDescriptionMaxChars",
      "noteMaxBytes",
      "questionMaxBytes",
      "specMaxBytes",
      "workflowMaxBytes",
    ]);
  });
});

describe("mode and binding", () => {
  it("reads the last mode, binding and reset entries", () => {
    const entries = [
      { type: "custom", customType: MODE_ENTRY, data: { enabled: false } },
      { type: "custom", customType: MODE_ENTRY, data: { enabled: true } },
      {
        type: "custom",
        customType: BINDING_ENTRY,
        data: { planPath: "a", cwd: "/w", boundAt: "t1" },
      },
      {
        type: "custom",
        customType: BINDING_ENTRY,
        data: { planPath: "b", cwd: "/w", boundAt: "t2" },
      },
      { type: "custom", customType: RESET_ENTRY, data: { at: 1, seed: "old" } },
      { type: "custom", customType: RESET_ENTRY, data: { at: 2, seed: "new" } },
    ];
    expect(sessionModeOf(entries)).toBe(true);
    expect(bindingOf(entries)).toEqual({ planPath: "b", cwd: "/w", boundAt: "t2" });
    expect(latestResetOf(entries)).toEqual({ at: 2, seed: "new" });
  });

  it("requires the switch and the session default", () => {
    const on = [{ type: "custom", customType: MODE_ENTRY, data: { enabled: true } }];
    const off = [{ type: "custom", customType: MODE_ENTRY, data: { enabled: false } }];
    expect(isNanoFlowActive([], { switchOn: false, always: true })).toBe(false);
    expect(isNanoFlowActive([], { switchOn: true, always: true })).toBe(true);
    expect(isNanoFlowActive(on, { switchOn: true, always: false })).toBe(true);
    expect(isNanoFlowActive(off, { switchOn: true, always: true })).toBe(false);
  });

  it("resolves a relative binding against the bound cwd, then the workspace", () => {
    const bound = tempDir();
    const workspace = tempDir();
    mkdirSync(join(bound, ".agents/domains/demo/plans/active/p1"), { recursive: true });
    const binding = {
      planPath: ".agents/domains/demo/plans/active/p1",
      cwd: bound,
      boundAt: "t",
    };
    expect(resolveBindingDirectory(binding, workspace)).toBe(
      join(bound, ".agents/domains/demo/plans/active/p1"),
    );
    expect(resolveBindingDirectory({ ...binding, cwd: "/missing" }, workspace)).toBe(
      join(workspace, binding.planPath),
    );
  });

  it("takes the last assistant text and truncates the tail", () => {
    const entries = [
      message("user", "问题", "2026-11-09T00:00:00.000Z"),
      message("assistant", "第一轮", "2026-11-09T00:00:01.000Z"),
      message("assistant", "最后一轮", "2026-11-09T00:00:02.000Z"),
    ];
    expect(lastAssistantText(entries)).toBe("最后一轮");
    expect(lastAssistantAt(entries)).toBe(Date.parse("2026-11-09T00:00:02.000Z"));
    const truncated = truncateTail("a".repeat(9000), 100);
    expect(truncated.startsWith("…（前 ")).toBe(true);
    expect(truncated.endsWith("a".repeat(100))).toBe(true);
  });

  it("builds a seed with the plan reference and last output", () => {
    const workspace = tempDir();
    const planDirectory = join(workspace, ".agents/domains/demo/plans/active/2026-11-09-示例");
    mkdirSync(planDirectory, { recursive: true });
    const binding = {
      planPath: ".agents/domains/demo/plans/active/2026-11-09-示例",
      cwd: workspace,
      boundAt: "t",
    };
    const seed = buildSeed(binding, workspace, "上一轮结论");
    expect(seed).toContain("demo/active/2026-11-09-示例");
    expect(seed).toContain("<rotation-last-output>");
    expect(seed).toContain("上一轮结论");
    expect(buildSeed(undefined, workspace, undefined)).toContain("nano_flow_bind");
  });
});

describe("plan and notes", () => {
  it("lists plans and resolves a duplicate name by domain", async () => {
    const workspace = tempDir();
    for (const domain of ["alpha", "beta"]) {
      const dir = join(workspace, ".agents/domains", domain, "plans/active/2026-11-09-同名");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "spec.md"), "---\nname: x\ndescription: y\nstatus: pending\n---\n");
    }
    const plans = await listPlans(workspace, ".agents/domains");
    expect(plans.map((plan) => plan.domain).sort()).toEqual(["alpha", "beta"]);
    expect(activePlans(plans)).toHaveLength(2);
    await expect(
      resolvePlan(workspace, ".agents/domains", { plan: "2026-11-09-同名" }),
    ).rejects.toThrow(/多个同名/u);
    const resolved = await resolvePlan(workspace, ".agents/domains", {
      plan: "2026-11-09-同名",
      domain: "beta",
    });
    expect(resolved.domain).toBe("beta");
    expect(planRefFromDirectory(resolved.directory)).toBe("beta/active/2026-11-09-同名");
  });

  it("reads only unfinished notes with reason and next step", () => {
    const plan = tempDir();
    const write = (file: string, body: string): void =>
      writeFileSync(join(plan, file), body, "utf8");
    write(
      "001-待处理.md",
      "---\nname: 001-待处理\ndescription: 描述\nstatus: pending\nnext_step: 继续\n---\n",
    );
    write(
      "002-阻塞.md",
      "---\nname: 002-阻塞\ndescription: 阻塞描述\nstatus: blocked\nreason: 等验收\n---\n",
    );
    write("003-完成.md", "---\nname: 003-完成\ndescription: 完成\nstatus: completed\n---\n");
    const notes = readUnfinishedNotes(plan);
    expect(notes.map((note) => note.name)).toEqual(["001-待处理", "002-阻塞"]);
    expect(notes[0]).toMatchObject({ status: "pending", nextStep: "继续" });
    expect(notes[1]).toMatchObject({ status: "blocked", reason: "等验收" });
  });
});
