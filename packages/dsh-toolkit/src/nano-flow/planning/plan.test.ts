import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  activePlans,
  isPlanLifecycle,
  listPlans,
  planRefFromDirectory,
  planRefOf,
} from "./plan.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-plan-"));
  roots.push(root);
  return root;
};

const writePlan = async (root: string, domain: string, lifecycle: string, name: string) => {
  const directory = join(root, ".agents", "domains", domain, "plans", lifecycle, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "spec.md"), "# spec\n", "utf8");
  return directory;
};

describe("isPlanLifecycle", () => {
  it("只认三档生命周期", () => {
    expect(isPlanLifecycle("active")).toBe(true);
    expect(isPlanLifecycle("reference")).toBe(true);
    expect(isPlanLifecycle("archived")).toBe(true);
    expect(isPlanLifecycle("done")).toBe(false);
    expect(isPlanLifecycle("")).toBe(false);
  });
});

describe("planRefOf / planRefFromDirectory", () => {
  it("拼出与反解 domain/lifecycle/name", () => {
    const ref = { domain: "dsh", lifecycle: "active" as const, name: "x", directory: "/tmp/x" };
    expect(planRefOf(ref)).toBe("dsh/active/x");
    expect(planRefFromDirectory("/w/.agents/domains/dsh/plans/active/x")).toBe("dsh/active/x");
    expect(planRefFromDirectory("C:\\w\\.agents\\domains\\dsh\\plans\\reference\\x")).toBe(
      "dsh/reference/x",
    );
  });

  it("形状不合法时退回 undefined", () => {
    expect(planRefFromDirectory("/tmp/nowhere")).toBeUndefined();
    expect(planRefFromDirectory("plans/active")).toBeUndefined();
    expect(planRefFromDirectory("/a/b/plans/active")).toBeUndefined();
    expect(planRefFromDirectory("/a/b/plans/done/x")).toBeUndefined();
    expect(planRefFromDirectory("/a/b/plans/reference")).toBeUndefined();
  });
});

describe("listPlans", () => {
  it("按 spec.md 判定 Plan 存在，并按生命周期过滤", async () => {
    const root = await makeRoot();
    const active = await writePlan(root, "dsh", "active", "2026-11-09-a");
    const reference = await writePlan(root, "dsh", "reference", "2026-11-09-b");
    // 没有 spec.md 的目录不算 Plan；生命周期目录名不合法时整层跳过。
    await mkdir(join(root, ".agents", "domains", "dsh", "plans", "active", "empty"), {
      recursive: true,
    });
    await mkdir(join(root, ".agents", "domains", "dsh", "plans", "done", "x"), { recursive: true });
    const plans = await listPlans(root, ".agents/domains");
    expect(plans.map((plan) => plan.directory).sort()).toEqual([active, reference].sort());
    expect(activePlans(plans)).toHaveLength(1);
  });

  it("领域根不存在时返回空表", async () => {
    const root = await makeRoot();
    await expect(listPlans(root, ".agents/domains")).resolves.toEqual([]);
  });

  it("支持绝对领域根", async () => {
    const root = await makeRoot();
    const plan = await writePlan(root, "etf", "active", "2026-11-09-etf");
    const plans = await listPlans(root, join(root, ".agents", "domains"));
    expect(plans.map((item) => item.directory)).toEqual([plan]);
  });
});
