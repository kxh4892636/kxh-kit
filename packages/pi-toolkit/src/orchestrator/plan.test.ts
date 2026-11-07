import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  activePlans,
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
