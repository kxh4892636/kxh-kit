import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { readNanoFlowReady } from "./nano-flow-ready.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const note = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  title: `note ${id}`,
  description: "一句话摘要",
  status: "pending",
  blocked_by: [],
  evidence: [],
  updated_at: "2026-11-07T00:00:00.000Z",
  content: "正文",
  ...overrides,
});

const makeWorkspace = async (
  plans: readonly { readonly name: string; readonly notes: readonly Record<string, unknown>[] }[],
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-ready-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, ".agents/domains/demo"), { recursive: true });
  for (const plan of plans) {
    const directory = join(root, ".agents/domains/demo/plans/active", plan.name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "story.md"), "# 示例故事\n", "utf8");
    await writeFile(join(directory, "spec.md"), "# 示例规格\n", "utf8");
    await writeFile(
      join(directory, "notes.json"),
      JSON.stringify({ version: 1, index: [], notes: plan.notes }),
      "utf8",
    );
  }
  return root;
};

describe("readNanoFlowReady", () => {
  it("returns the active plan's dependency groups and counts", async () => {
    const workspace = await makeWorkspace([
      {
        name: "2026-11-07-示例工作",
        notes: [note("01"), note("02", { blocked_by: ["01"] })],
      },
    ]);
    const ready = await readNanoFlowReady({
      workspace,
      domainRoot: ".agents/domains",
      limits: DEFAULT_NANO_FLOW_SETTINGS,
    });
    expect(ready.available).toBe(true);
    expect(ready.plan).toEqual({
      domain: "demo",
      lifecycle: "active",
      name: "2026-11-07-示例工作",
    });
    expect(ready.counts).toMatchObject({
      total: 2,
      pending: 2,
      waiting: 0,
      completed: 0,
    });
    expect(ready.groups?.map((group) => group.notes.map((item) => item.id))).toEqual([
      ["01", "02"],
    ]);
  });

  it("counts waiting and keeps it in the dependency group", async () => {
    const workspace = await makeWorkspace([
      {
        name: "2026-11-07-等待确认",
        notes: [
          note("01", { status: "waiting", needs: "review" }),
          note("02", { blocked_by: ["01"] }),
        ],
      },
    ]);
    const ready = await readNanoFlowReady({
      workspace,
      domainRoot: ".agents/domains",
      limits: DEFAULT_NANO_FLOW_SETTINGS,
    });
    expect(ready.available).toBe(true);
    expect(ready.counts).toMatchObject({
      total: 2,
      pending: 1,
      waiting: 1,
      completed: 0,
    });
    expect(ready.groups?.map((group) => group.notes.map((item) => item.id))).toEqual([
      ["01", "02"],
    ]);
  });

  it("counts waiting with needs=blocked 单列，不影响 waiting 总数", async () => {
    const workspace = await makeWorkspace([
      {
        name: "2026-11-08-阻塞并入等待",
        notes: [
          note("01", {
            status: "waiting",
            needs: "blocked",
            blocked_reason: "等上游接口",
          }),
        ],
      },
    ]);
    const ready = await readNanoFlowReady({
      workspace,
      domainRoot: ".agents/domains",
      limits: DEFAULT_NANO_FLOW_SETTINGS,
    });
    expect(ready.available).toBe(true);
    expect(ready.counts).toMatchObject({
      total: 1,
      pending: 0,
      waiting: 1,
      needsBlocked: 1,
      completed: 0,
    });
    expect(ready.groups?.[0]?.notes[0]).toMatchObject({
      status: "waiting",
      needs: "blocked",
      blocked_reason: "等上游接口",
    });
  });

  it("reports no active plan", async () => {
    const workspace = await makeWorkspace([]);
    await expect(
      readNanoFlowReady({
        workspace,
        domainRoot: ".agents/domains",
        limits: DEFAULT_NANO_FLOW_SETTINGS,
      }),
    ).resolves.toEqual({ available: false, reason: "no-active-plan" });
  });

  it("reports multiple active plans", async () => {
    const workspace = await makeWorkspace([
      { name: "2026-11-07-甲", notes: [note("01")] },
      { name: "2026-11-07-乙", notes: [note("01")] },
    ]);
    await expect(
      readNanoFlowReady({
        workspace,
        domainRoot: ".agents/domains",
        limits: DEFAULT_NANO_FLOW_SETTINGS,
      }),
    ).resolves.toEqual({ available: false, reason: "multiple-active-plans" });
  });
});
