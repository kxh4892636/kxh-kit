import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { buildDreamMessage, DREAM_ENTRY } from "./dream/prompt.ts";
import { selectDreamScope } from "./dream/scope.ts";

const created: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-nano-dream-"));
  created.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const domainRoot = ".agents/domains";

/** 造一个域：`plans/<lifecycle>/<name>/spec.md`。 */
const seedPlan = (
  workspace: string,
  domain: string,
  lifecycle: string,
  name: string,
  options: { log?: number } = {},
): string => {
  const dir = join(workspace, domainRoot, domain, "plans", lifecycle, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "spec.md"), "---\nname: x\ndescription: y\n---\n\n# x\n", "utf8");
  writeFileSync(join(dir, "notes_index.md"), "# Notes Index\n", "utf8");
  if (options.log !== undefined) {
    writeFileSync(join(dir, "log.jsonl"), `${"x".repeat(options.log)}\n`, "utf8");
  }
  return dir;
};

describe("dream scope", () => {
  it("keeps active and reference, drops archived, newest date first", async () => {
    const workspace = tempDir();
    seedPlan(workspace, "demo", "active", "2026-11-01-旧");
    seedPlan(workspace, "demo", "active", "2026-11-09-新");
    seedPlan(workspace, "demo", "reference", "2026-10-01-更旧");
    seedPlan(workspace, "demo", "archived", "2026-11-30-归档");

    const scope = await selectDreamScope(workspace, { domainRoot, maxPlansPerDomain: 21 });
    expect(scope.domains).toHaveLength(1);
    expect(scope.domains[0]?.domain).toBe("demo");
    expect(scope.domains[0]?.plans.map((entry) => entry.plan.name)).toEqual([
      "2026-11-09-新",
      "2026-11-01-旧",
      "2026-10-01-更旧",
    ]);
    expect(scope.totalPlans).toBe(3);
  });

  it("caps each domain at maxPlansPerDomain and orders domains by name", async () => {
    const workspace = tempDir();
    for (const day of ["01", "02", "03"])
      seedPlan(workspace, "zeta", "active", `2026-11-${day}-p${day}`);
    seedPlan(workspace, "alpha", "active", "2026-11-05-a");

    const scope = await selectDreamScope(workspace, { domainRoot, maxPlansPerDomain: 2 });
    expect(scope.domains.map((item) => item.domain)).toEqual(["alpha", "zeta"]);
    expect(scope.domains[1]?.plans.map((entry) => entry.plan.name)).toEqual([
      "2026-11-03-p03",
      "2026-11-02-p02",
    ]);
    expect(scope.totalPlans).toBe(3);
  });

  it("reports trace size and treats a missing log as zero", async () => {
    const workspace = tempDir();
    seedPlan(workspace, "demo", "active", "2026-11-09-有轨迹", { log: 2048 });
    seedPlan(workspace, "demo", "active", "2026-11-08-无轨迹");

    const scope = await selectDreamScope(workspace, { domainRoot, maxPlansPerDomain: 21 });
    const [withLog, without] = scope.domains[0]?.plans ?? [];
    expect(withLog?.logBytes).toBeGreaterThan(2000);
    expect(without?.logBytes).toBe(0);
  });

  it("returns an empty scope when there is no domain", async () => {
    const scope = await selectDreamScope(tempDir(), { domainRoot, maxPlansPerDomain: 21 });
    expect(scope).toEqual({ domains: [], totalPlans: 0 });
  });
});

describe("dream message", () => {
  const scope = async (workspace: string) =>
    selectDreamScope(workspace, { domainRoot, maxPlansPerDomain: 21 });

  it("puts the prompt first and lists plans with their paths", async () => {
    const workspace = tempDir();
    seedPlan(workspace, "demo", "active", "2026-11-09-示例", { log: 4096 });
    const message = buildDreamMessage(await scope(workspace), {
      workspace,
      prompt: "[nano-flow:dream]\n# dream",
    });
    expect(message.startsWith("[nano-flow:dream]")).toBe(true);
    expect(message).toContain("## 本次运行");
    expect(message).toContain("- 域 `demo`：1 个 Plan");
    expect(message).toContain(
      "`demo/active/2026-11-09-示例`｜.agents/domains/demo/plans/active/2026-11-09-示例/spec.md",
    );
    expect(message).toContain(
      "轨迹：.agents/domains/demo/plans/active/2026-11-09-示例/log.jsonl（4.0 KB）",
    );
    expect(message).toContain("无轨迹的 Plan：0 个");
  });

  it("marks plans without a trace instead of inventing one", async () => {
    const workspace = tempDir();
    seedPlan(workspace, "demo", "active", "2026-11-09-示例");
    const message = buildDreamMessage(await scope(workspace), {
      workspace,
      prompt: "[nano-flow:dream]",
    });
    expect(message).toContain("无轨迹（尚无 log.jsonl）");
    expect(message).toContain("无轨迹的 Plan：1 个");
  });

  it("exposes the session entry name", () => {
    expect(DREAM_ENTRY).toBe("nano-flow-dream");
  });
});
