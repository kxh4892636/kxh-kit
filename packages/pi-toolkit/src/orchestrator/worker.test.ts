import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import { emptyDocument, serializeDocument } from "./dag.ts";
import { NOTES_FILE } from "./store.ts";
import type { PlanRef } from "./plan.ts";
import {
  createWorkerExtension,
  SUB_WORKER_TOOL_NAMES,
  TEMP_WORKER_TOOL_NAMES,
  WORKER_TOOL_NAMES,
} from "./worker.ts";
import type { WorkerReport } from "./types.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface Tool {
  name: string;
  execute: (
    id: string,
    args: unknown,
    signal?: unknown,
    onUpdate?: unknown,
    ctx?: unknown,
  ) => Promise<{ content: { text: string }[]; details?: unknown }>;
}

interface Harness {
  readonly workspace: string;
  readonly tools: Map<string, Tool>;
  readonly reports: WorkerReport[];
  readonly sections: Record<string, string>;
  readonly settings: ToolkitSettings;
}

const settings: ToolkitSettings = {
  ...DEFAULT_SETTINGS,
  tools: { ...DEFAULT_TOOLS, orchestrator: true },
};

/** 换行符；测试里不写反斜杠转义，避免被外层转义吃掉。 */
const NL = String.fromCharCode(10);

/**
 * 造一个工作区：`common` + `etf`（本域，含一个 Plan）+ `other`。
 * `other` 故意残缺，用来验证 worker 的 workspace 只覆盖 common + 本域。
 */
const makePlan = async (): Promise<{ plan: PlanRef; workspace: string }> => {
  const root = await mkdtemp(join(tmpdir(), "pi-worker-"));
  created.push(root);
  const write = async (relative: string, body: string): Promise<void> => {
    const target = join(root, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
  };
  const knowledge = ["# 域", "", "**示例**: 一句话 / Avoid: 别名", ""].join(NL);
  const questions = ["# 问题", "", "暂无。", ""].join(NL);
  await write(
    "CONTEXT-MAP.md",
    [
      "# Context Map",
      "",
      "- [common](./.agents/domains/common/CONTEXT.md) - 基础域。",
      "- [etf](./.agents/domains/etf/CONTEXT.md) - 本域。",
      "- [other](./.agents/domains/other/CONTEXT.md) - 别的域。",
      "",
    ].join(NL),
  );
  for (const domain of ["common", "etf"]) {
    await write(`.agents/domains/${domain}/CONTEXT.md`, knowledge);
    await write(`.agents/domains/${domain}/QUESTIONS.md`, questions);
  }
  // 别域故意残缺：缺 QUESTIONS.md、Plan 缺 story/spec。
  await write(".agents/domains/other/CONTEXT.md", knowledge);
  await mkdir(join(root, ".agents", "domains", "other", "plans", "active", "2026-11-07-坏"), {
    recursive: true,
  });

  const directory = join(root, ".agents", "domains", "etf", "plans", "active", "2026-11-07-示例");
  await mkdir(directory, { recursive: true });
  const document = {
    ...emptyDocument(),
    notes: [
      {
        id: "01",
        title: "示例",
        description: "一句话摘要",
        status: "in_progress" as const,
        blocked_by: [],
        evidence: [],
        updated_at: "2026-11-07T00:00:00.000Z",
        content: "正文",
      },
    ],
  };
  await writeFile(join(directory, NOTES_FILE), serializeDocument(document), "utf8");
  await writeFile(join(directory, "story.md"), ["# 示例 story", ""].join(NL), "utf8");
  await writeFile(join(directory, "spec.md"), ["# 示例 spec", ""].join(NL), "utf8");
  return {
    plan: { domain: "etf", lifecycle: "active", name: "2026-11-07-示例", directory },
    workspace: root,
  };
};

const setup = async (): Promise<Harness> => {
  const tools = new Map<string, Tool>();
  const reports: WorkerReport[] = [];
  const sections: Record<string, string> = {};
  const handlers = new Map<string, ((event: unknown) => unknown)[]>();
  const pi = {
    registerTool: (tool: Tool) => tools.set(tool.name, tool),
    on: (event: string, handler: (payload: unknown) => unknown) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  } as unknown as ExtensionAPI;

  const { plan, workspace } = await makePlan();
  const released = new Set<string>();
  const factory = createWorkerExtension({
    plan,
    report: (report) => reports.push(report),
    settings: () => settings,
    released,
  });
  await factory(pi);

  for (const handler of handlers.get("before_agent_start") ?? []) {
    handler({ systemPromptOptions: { sections } });
  }
  return { workspace, tools, reports, sections, settings };
};

const ctx = (cwd: string) => ({ cwd, mode: "print" });

describe("worker 扩展工厂", () => {
  it("只注册四个工具，且注入 worker 提示词", async () => {
    const harness = await setup();
    expect([...harness.tools.keys()].sort()).toEqual([...WORKER_TOOL_NAMES].sort());
    expect(harness.tools.has("ask_questions")).toBe(false);
    expect(harness.sections["orchestrator"]).toContain("你是 worker");
  });

  it("拒绝对 plan 级动作与未放行的 completed", async () => {
    const harness = await setup();
    const write = harness.tools.get("orchestrator_write");
    const run = (args: Record<string, unknown>) =>
      write?.execute("id", args, undefined, undefined, ctx(harness.workspace));

    await expect(run({ op: "init", domain: "etl", name: "2026-11-07-新建" })).rejects.toThrow(
      /plan 级动作/,
    );
    await expect(run({ op: "move", lifecycle: "archived" })).rejects.toThrow(/plan 级动作/);
    await expect(run({ op: "complete", note: "01", evidence: ["x"] })).rejects.toThrow(
      /尚未被放行/,
    );
  });

  it("放行后可以 complete", async () => {
    const tools = new Map<string, Tool>();
    const reports: WorkerReport[] = [];
    const pi = {
      registerTool: (tool: Tool) => tools.set(tool.name, tool),
      on: () => undefined,
    } as unknown as ExtensionAPI;
    const { plan, workspace } = await makePlan();
    const released = new Set<string>(["01"]);
    await createWorkerExtension({
      plan,
      report: (r) => reports.push(r),
      settings: () => settings,
      released,
    })(pi);
    const write = tools.get("orchestrator_write");
    // 放行只解开「印」这一层：note 还没到 waiting 时仍拒绝。
    await expect(
      write?.execute(
        "id",
        { op: "complete", note: "01", evidence: ["x"] },
        undefined,
        undefined,
        ctx(workspace),
      ),
    ).rejects.toThrow(/先 status=waiting/);
  });

  it("orchestrator_check 校验自己的 Plan，但不跨域查工作区", async () => {
    const harness = await setup();
    const check = harness.tools.get("orchestrator_check");
    const planResult = (await check?.execute(
      "id",
      { op: "plan" },
      undefined,
      undefined,
      ctx(harness.workspace),
    )) as { content: { text: string }[] };
    expect(planResult.content[0]?.text).toContain("Plan 校验通过");

    const limits = (await check?.execute("id", { op: "limits" })) as {
      content: { text: string }[];
    };
    expect(limits.content[0]?.text).toContain("生效上限");

    // other 域缺 QUESTIONS.md、Plan 缺 story/spec；worker 的 workspace 不应扫到。
    const workspace = (await check?.execute(
      "id",
      { op: "workspace" },
      undefined,
      undefined,
      ctx(harness.workspace),
    )) as { content: { text: string }[] };
    expect(workspace.content[0]?.text).toContain("工作区校验通过");
    expect(workspace.content[0]?.text).not.toContain("other");
  });

  it("子 worker 只有只读工具与 report：没有 dispatch / write / check", async () => {
    const tools = new Map<string, Tool>();
    const reports: WorkerReport[] = [];
    const sections: Record<string, string> = {};
    const handlers = new Map<string, ((event: unknown) => unknown)[]>();
    const pi = {
      registerTool: (tool: Tool) => tools.set(tool.name, tool),
      sendMessage: () => undefined,
      on: (event: string, handler: (payload: unknown) => unknown) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
    } as unknown as ExtensionAPI;
    const { workspace } = await makePlan();
    await createWorkerExtension({
      sub: { parentRef: "etf/active/2026-11-07-示例", index: 1 },
      depth: 1,
      report: (report) => reports.push(report),
      settings: () => settings,
      released: new Set<string>(),
    })(pi);
    for (const handler of handlers.get("before_agent_start") ?? []) {
      handler({ systemPromptOptions: { sections } });
    }

    expect([...tools.keys()].sort()).toEqual([...SUB_WORKER_TOOL_NAMES].sort());
    expect(tools.has("orchestrator_dispatch")).toBe(false);
    expect(tools.has("orchestrator_write")).toBe(false);
    expect(tools.has("orchestrator_check")).toBe(false);
    expect(sections["orchestrator"]).toContain(
      "子 worker（etf/active/2026-11-07-示例/sub:1，第 1 层）",
    );
    expect(sections["orchestrator"]).toContain("改不了 `notes.json`");

    // 上报的路由键带上上级：编排方看到的永远是上级，子 worker 只回报上级。
    await tools.get("orchestrator_report")?.execute("id", {
      outcome: "done",
      note: "-",
      summary: "查完了",
    });
    expect(reports[0]?.plan).toBe("etf/active/2026-11-07-示例/sub:1");
    // 只读工具可跨域列 Plan。
    const plans = (await tools
      .get("orchestrator_read")
      ?.execute("id", { op: "plans" }, undefined, undefined, ctx(workspace))) as {
      content: { text: string }[];
    };
    expect(plans.content[0]?.text).toContain("etf/active/2026-11-07-示例");
  });

  it("临时 worker 只注册只读工具与 report，路由键为 temp:<id>", async () => {
    const tools = new Map<string, Tool>();
    const reports: WorkerReport[] = [];
    const sections: Record<string, string> = {};
    const handlers = new Map<string, ((event: unknown) => unknown)[]>();
    const pi = {
      registerTool: (tool: Tool) => tools.set(tool.name, tool),
      on: (event: string, handler: (payload: unknown) => unknown) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
    } as unknown as ExtensionAPI;
    const { workspace } = await makePlan();
    await createWorkerExtension({
      temp: "1",
      report: (report) => reports.push(report),
      settings: () => settings,
      released: new Set<string>(),
    })(pi);
    for (const handler of handlers.get("before_agent_start") ?? []) {
      handler({ systemPromptOptions: { sections } });
    }

    expect([...tools.keys()].sort()).toEqual([...TEMP_WORKER_TOOL_NAMES].sort());
    expect(tools.has("orchestrator_write")).toBe(false);
    expect(tools.has("orchestrator_check")).toBe(false);
    expect(sections["orchestrator"]).toContain("临时 worker（temp:1）");

    // 只读工具可跨域列 Plan；写操作不存在。
    const read = tools.get("orchestrator_read");
    const plans = (await read?.execute(
      "id",
      { op: "plans" },
      undefined,
      undefined,
      ctx(workspace),
    )) as {
      content: { text: string }[];
    };
    expect(plans.content[0]?.text).toContain("etf/active/2026-11-07-示例");
    await expect(
      read?.execute("id", { op: "write" }, undefined, undefined, ctx(workspace)),
    ).rejects.toThrow(/未知的 op/);

    await tools.get("orchestrator_report")?.execute("id", {
      outcome: "done",
      note: "-",
      summary: "查完了",
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.plan).toBe("temp:1");
  });

  it("orchestrator_report 校验并回调编排方", async () => {
    const harness = await setup();
    const report = harness.tools.get("orchestrator_report");
    await expect(
      report?.execute("id", { outcome: "needs_answer", note: "01", summary: "s" }),
    ).rejects.toThrow(/必须给 question/);

    const result = await report?.execute("id", {
      outcome: "needs_review",
      note: "01",
      summary: "改完了",
      evidence: ["pnpm test"],
    });
    expect(result?.details).toMatchObject({
      outcome: "needs_review",
      note: "01",
      plan: expect.any(String),
    });
    expect(harness.reports).toHaveLength(1);
    expect(harness.reports[0]?.summary).toBe("改完了");
  });
});
