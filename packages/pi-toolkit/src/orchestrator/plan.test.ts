import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  activePlans,
  mainWorkspaceOf,
  worktreeDomainCopies,
  workspaceOfPlanDirectory,
  isPlanLifecycle,
  listPlans,
  planRefOf,
  resolvePlan,
  type PlanRef,
} from "./plan.ts";

const created: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-nano-plan-"));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makePlan = async (
  root: string,
  lifecycle: string,
  name: string,
  withNotes = true,
): Promise<string> => {
  const directory = join(root, ".agents/domains/demo/plans", lifecycle, name);
  await mkdir(directory, { recursive: true });
  if (withNotes) {
    await writeFile(
      join(directory, "notes.json"),
      JSON.stringify({ version: 1, index: [], notes: [] }),
      "utf8",
    );
  }
  return directory;
};

describe("listPlans", () => {
  it("lists only plans with notes.json, sorted", async () => {
    const root = await tempDir();
    await makePlan(root, "active", "2026-11-08-乙");
    await makePlan(root, "active", "2026-11-08-甲");
    await makePlan(root, "reference", "2026-11-08-旧");
    await makePlan(root, "active", "2026-11-08-无notes", false);
    const plans = await listPlans(root, ".agents/domains");
    expect(plans.map(planRefOf)).toEqual([
      "demo/active/2026-11-08-甲",
      "demo/active/2026-11-08-乙",
      "demo/reference/2026-11-08-旧",
    ]);
    expect(activePlans(plans).map(planRefOf)).toEqual([
      "demo/active/2026-11-08-甲",
      "demo/active/2026-11-08-乙",
    ]);
  });

  it("returns nothing for a missing domains root", async () => {
    expect(await listPlans(await tempDir(), ".agents/domains")).toEqual([]);
  });
});

describe("mainWorkspaceOf（worktree 归一化）", () => {
  it("cwd 落在 .worktrees/<名> 时回到主工作区根", () => {
    const root = join(tmpdir(), "pi-main-workspace");
    expect(mainWorkspaceOf(join(root, ".worktrees", "plan"))).toBe(root);
    expect(mainWorkspaceOf(join(root, ".worktrees", "note-01", "packages"))).toBe(root);
  });

  it("普通目录、相对路径与根下 .worktrees 都原样返回", () => {
    const root = join(tmpdir(), "pi-main-workspace");
    expect(mainWorkspaceOf(root)).toBe(root);
    expect(mainWorkspaceOf(join(root, "packages", "pi-toolkit"))).toBe(
      join(root, "packages", "pi-toolkit"),
    );
    expect(mainWorkspaceOf(".worktrees/plan")).toBe(".worktrees/plan");
  });
});

describe("worktreeDomainCopies（只提示，不读写）", () => {
  it("列出 .worktrees 内存在的领域根副本", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".worktrees", "plan", ".agents", "domains"), { recursive: true });
    await mkdir(join(root, ".worktrees", "empty"), { recursive: true });
    expect(worktreeDomainCopies(root)).toEqual([
      join(root, ".worktrees", "plan", ".agents", "domains"),
    ]);
  });

  it("没有 .worktrees 时返回空", async () => {
    expect(worktreeDomainCopies(await tempDir())).toEqual([]);
  });
});

describe("workspaceOfPlanDirectory（worktree worker 的 lockedPlan）", () => {
  it("从绝对 Plan 目录反推工作区根", async () => {
    const root = await tempDir();
    const directory = join(root, ".agents/domains/demo/plans/active/2026-01-01-x");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "notes.json"), "{}", "utf8");
    expect(workspaceOfPlanDirectory(directory)).toBe(root);
  });

  it("形状不匹配或不是绝对路径时返回 undefined", async () => {
    expect(workspaceOfPlanDirectory("pi/active/2026-01-01-x")).toBeUndefined();
    expect(workspaceOfPlanDirectory("/tmp/whatever")).toBeUndefined();
  });
});

describe("resolvePlan", () => {
  it("resolves an explicit reference, a directory path and an absolute path", async () => {
    const root = await tempDir();
    const directory = await makePlan(root, "active", "2026-11-08-定位");
    const byRef = await resolvePlan(root, ".agents/domains", "demo/active/2026-11-08-定位");
    expect(byRef.directory).toBe(directory);
    const byPath = await resolvePlan(
      root,
      ".agents/domains",
      ".agents/domains/demo/plans/active/2026-11-08-定位",
    );
    expect(byPath.name).toBe("2026-11-08-定位");
    const byAbsolute = await resolvePlan(root, ".agents/domains", directory);
    expect(byAbsolute.directory).toBe(directory);
  });

  it("resolves the only active plan when no reference is given", async () => {
    const root = await tempDir();
    await makePlan(root, "active", "2026-11-08-唯一");
    const resolved = await resolvePlan(root, ".agents/domains");
    expect(planRefOf(resolved)).toBe("demo/active/2026-11-08-唯一");
  });

  it("reports invalid lifecycles, missing plans and ambiguous choices", async () => {
    const root = await tempDir();
    await expect(
      resolvePlan(root, ".agents/domains", "demo/planning/2026-11-08-x"),
    ).rejects.toThrow(/生命周期无效/u);
    await expect(resolvePlan(root, ".agents/domains", "demo/active/2026-11-08-缺")).rejects.toThrow(
      /Plan 不存在/u,
    );
    await expect(resolvePlan(root, ".agents/domains")).rejects.toThrow(/没有 active 的 Plan/u);

    await makePlan(root, "active", "2026-11-08-甲");
    await makePlan(root, "active", "2026-11-08-乙");
    await expect(resolvePlan(root, ".agents/domains")).rejects.toThrow(/2 个 active 的 Plan/u);
  });

  it("exposes lifecycle and ref helpers", () => {
    expect(isPlanLifecycle("active")).toBe(true);
    expect(isPlanLifecycle("planning")).toBe(false);
    const plan: PlanRef = {
      domain: "demo",
      lifecycle: "reference",
      name: "2026-11-08-x",
      directory: "/tmp/x",
    };
    expect(planRefOf(plan)).toBe("demo/reference/2026-11-08-x");
  });
});
