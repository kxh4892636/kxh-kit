import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_NANO_FLOW_SETTINGS } from "./config.ts";
import { createCheckTool } from "./tools/check.ts";
import { createReadTool } from "./tools/read.ts";
import { createToolRuntime, type ToolRuntime } from "./tools/shared.ts";
import { createWriteTool } from "./tools/write.ts";

interface ToolResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
}

type RunnableTool = {
  execute(
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: unknown,
  ): Promise<ToolResult>;
};

const created: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-nano-flow-"));
  created.push(dir);
  return dir;
};

const makeWorkspace = async (): Promise<string> => {
  const root = await tempDir();
  await mkdir(join(root, ".agents/domains/demo"), { recursive: true });
  await writeFile(
    join(root, "CONTEXT-MAP.md"),
    "# Context Map\n\n## Contexts\n\n- [demo](./.agents/domains/demo/CONTEXT.md) - 示例域。\n\n## Relationships\n",
    "utf8",
  );
  await writeFile(
    join(root, ".agents/domains/demo/CONTEXT.md"),
    "# demo\n\n示例域职责。\n",
    "utf8",
  );
  await writeFile(
    join(root, ".agents/domains/demo/QUESTIONS.md"),
    "# demo 常见问题\n\n暂无已验证的重复问题。\n",
    "utf8",
  );
  return root;
};

const setup = (
  settings = DEFAULT_NANO_FLOW_SETTINGS,
): { runtime: ToolRuntime; read: RunnableTool; write: RunnableTool; check: RunnableTool } => {
  const runtime = createToolRuntime({
    limits: () => settings,
    domainRoot: ".agents/domains",
  });
  return {
    runtime,
    read: createReadTool(runtime) as unknown as RunnableTool,
    write: createWriteTool(runtime) as unknown as RunnableTool,
    check: createCheckTool(runtime) as unknown as RunnableTool,
  };
};

const run = async (
  tool: RunnableTool,
  args: Record<string, unknown>,
  cwd: string,
): Promise<string> => {
  const result = await tool.execute("id", args, undefined, undefined, { cwd });
  return result.content[0]?.text ?? "";
};

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const PLAN = "demo/active/2026-11-08-测试计划";

describe("nano_flow_write / nano_flow_read", () => {
  it("runs init → create → ready → awaiting_verification → complete", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    const init = await run(
      tools.write,
      { op: "init", domain: "demo", name: "2026-11-08-测试计划" },
      cwd,
    );
    expect(init).toContain("已建 Plan");

    const createdNote = await run(
      tools.write,
      {
        op: "create",
        plan: PLAN,
        title: "实现",
        description: "做一件事",
        content: "正文",
      },
      cwd,
    );
    expect(createdNote).toContain("已创建 note 01");

    const ready = await run(tools.read, { op: "ready", plan: PLAN }, cwd);
    expect(ready).toContain("第 1 组");
    expect(ready).toContain("01 [pending] 实现");

    await run(tools.write, { op: "status", plan: PLAN, note: "01", status: "in_progress" }, cwd);
    await expect(
      run(tools.write, { op: "complete", plan: PLAN, note: "01", evidence: ["提前"] }, cwd),
    ).rejects.toThrow(/不能直接 complete/u);

    await run(
      tools.write,
      { op: "status", plan: PLAN, note: "01", status: "awaiting_verification" },
      cwd,
    );
    const resume = await run(tools.read, { op: "resume", plan: PLAN }, cwd);
    expect(resume).toContain("等待验证（1）");

    const completed = await run(
      tools.write,
      { op: "complete", plan: PLAN, note: "01", evidence: ["测试通过"] },
      cwd,
    );
    expect(completed).toContain("已完成 note 01");
    const raw = JSON.parse(
      await readFile(
        join(cwd, ".agents/domains", "demo/plans/active/2026-11-08-测试计划", "notes.json"),
        "utf8",
      ),
    ) as { notes: { status: string; evidence: string[] }[] };
    expect(raw.notes[0]?.status).toBe("completed");
    expect(raw.notes[0]?.evidence).toContain("测试通过");
  });

  it("groups dependent notes and separates awaiting_verification", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-分组计划" }, cwd);
    const plan = "demo/active/2026-11-08-分组计划";
    for (const [title, blockedBy] of [
      ["第一条", undefined],
      ["第二条", ["01"]],
      ["第三条", undefined],
    ] as const) {
      await run(
        tools.write,
        {
          op: "create",
          plan,
          title,
          description: title,
          content: title,
          ...(blockedBy === undefined ? {} : { blocked_by: blockedBy }),
        },
        cwd,
      );
    }
    await run(tools.write, { op: "status", plan, note: "01", status: "in_progress" }, cwd);
    await run(
      tools.write,
      { op: "status", plan, note: "01", status: "awaiting_verification" },
      cwd,
    );
    const ready = await run(tools.read, { op: "ready", plan }, cwd);
    expect(ready).toContain("第 1 组（2）");
    expect(ready).toContain("01 [awaiting_verification]");
    expect(ready).toContain("03 [pending]");
    expect(ready.indexOf("01 [awaiting_verification]")).toBeLessThan(ready.indexOf("03 [pending]"));
  });

  it("moves a plan between lifecycles", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-迁移计划" }, cwd);
    const moved = await run(
      tools.write,
      { op: "move", plan: "demo/active/2026-11-08-迁移计划", lifecycle: "reference" },
      cwd,
    );
    expect(moved).toContain("demo/reference/2026-11-08-迁移计划");
  });
});

describe("nano_flow_check", () => {
  it("reports the active limits", async () => {
    const cwd = await makeWorkspace();
    const text = await run(setup().check, { op: "limits" }, cwd);
    expect(text).toContain("生效上限");
    expect(text).toContain("轮转阈值: 0.618");
  });

  it("rejects an invalid DAG", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-坏图" }, cwd);
    const plan = "demo/active/2026-11-08-坏图";
    await run(tools.write, { op: "create", plan, title: "A", description: "A", content: "A" }, cwd);
    await run(
      tools.write,
      { op: "create", plan, title: "B", description: "B", content: "B", blocked_by: ["01"] },
      cwd,
    );
    await expect(
      run(tools.write, { op: "link", plan, note: "01", blocked_by: ["02"] }, cwd),
    ).rejects.toThrow(/存在环/u);
  });
});

describe("nano_flow_read operations", () => {
  const seedPlan = async (cwd: string) => {
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-读取" }, cwd);
    const plan = "demo/active/2026-11-08-读取";
    await run(
      tools.write,
      { op: "create", plan, title: "第一条", description: "摘要一", content: "正文一" },
      cwd,
    );
    await run(
      tools.write,
      {
        op: "create",
        plan,
        title: "第二条",
        description: "摘要二",
        content: "正文二",
        blocked_by: ["01"],
      },
      cwd,
    );
    return { tools, plan };
  };

  it("lists plans and notes", async () => {
    const cwd = await makeWorkspace();
    const { tools } = await seedPlan(cwd);
    const plans = await run(tools.read, { op: "plans" }, cwd);
    expect(plans).toContain("demo/active/2026-11-08-读取");
    const notes = await run(tools.read, { op: "notes", plan: "demo/active/2026-11-08-读取" }, cwd);
    expect(notes).toContain("01 [pending] 第一条");
    expect(notes).toContain("02 [pending] 第二条");
  });

  it("gets multiple notes, graph, index and search", async () => {
    const cwd = await makeWorkspace();
    const { tools, plan } = await seedPlan(cwd);
    const got = await run(tools.read, { op: "get", plan, ids: ["01", "02"] }, cwd);
    expect(got).toContain("## 01 第一条");
    expect(got).toContain("## 02 第二条");
    expect(got).toContain("依赖: 01");

    const graph = await run(tools.read, { op: "graph", plan, note: "02" }, cwd);
    expect(graph).toContain("上游（直接+传递）: 01 第一条（pending）");

    await run(tools.write, { op: "set_index", plan, ids: ["02"] }, cwd);
    expect(await run(tools.read, { op: "index", plan }, cwd)).toContain("02 [pending] 第二条");
    expect(await run(tools.read, { op: "search", plan, query: "摘要二" }, cwd)).toContain(
      "命中 1 条",
    );
  });

  it("rejects unknown ops and unreadable notes.json", async () => {
    const cwd = await makeWorkspace();
    const { tools, plan } = await seedPlan(cwd);
    await expect(run(tools.read, { op: "bogus", plan }, cwd)).rejects.toThrow(/未知的 op/u);
    await writeFile(
      join(cwd, ".agents/domains/demo/plans/active/2026-11-08-读取", "notes.json"),
      "{ not json",
      "utf8",
    );
    await expect(run(tools.read, { op: "notes", plan }, cwd)).rejects.toThrow(/不是合法 JSON/u);
  });
});

describe("nano_flow_write operations", () => {
  it("updates, links, merges and deletes notes", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-写入" }, cwd);
    const plan = "demo/active/2026-11-08-写入";
    await run(
      tools.write,
      { op: "create", plan, title: "A", description: "A", content: "A 正文" },
      cwd,
    );
    await run(
      tools.write,
      { op: "create", plan, title: "B", description: "B", content: "B 正文" },
      cwd,
    );
    await run(
      tools.write,
      { op: "create", plan, title: "C", description: "C", content: "C 正文" },
      cwd,
    );
    await run(tools.write, { op: "link", plan, note: "02", blocked_by: ["01"] }, cwd);
    expect(
      await run(tools.write, { op: "update", plan, note: "01", content: "A 新正文" }, cwd),
    ).toContain("已更新 note 01");
    await expect(run(tools.write, { op: "delete", plan, note: "01" }, cwd)).rejects.toThrow(
      /仍被依赖/u,
    );
    await run(tools.write, { op: "link", plan, note: "02", blocked_by: [] }, cwd);
    expect(await run(tools.write, { op: "merge", plan, into: "02", from: "03" }, cwd)).toContain(
      "已合并 03 → 02",
    );
    expect(await run(tools.write, { op: "delete", plan, note: "01" }, cwd)).toContain(
      "已删除 note 01",
    );
  });

  it("init bootstraps domain docs in an empty workspace", async () => {
    const cwd = await tempDir();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "fresh", name: "2026-11-08-新建域" }, cwd);
    expect(await run(tools.check, { op: "workspace" }, cwd)).toContain("工作区校验通过");
  });

  it("rejects an invalid lifecycle and a missing plan", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-生命周期" }, cwd);
    await expect(
      run(
        tools.write,
        { op: "move", plan: "demo/active/2026-11-08-生命周期", lifecycle: "implementing" },
        cwd,
      ),
    ).rejects.toThrow(/active \| reference \| archived/u);
    await run(
      tools.write,
      { op: "move", plan: "demo/active/2026-11-08-生命周期", lifecycle: "reference" },
      cwd,
    );
    await expect(run(tools.write, { op: "move", lifecycle: "active" }, cwd)).rejects.toThrow(
      /没有 active 的 Plan/u,
    );
  });

  it("refuses complete when the plan check fails", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-超限" }, cwd);
    const plan = "demo/active/2026-11-08-超限";
    await run(tools.write, { op: "create", plan, title: "A", description: "A", content: "A" }, cwd);
    await writeFile(
      join(cwd, ".agents/domains/demo/plans/active/2026-11-08-超限", "story.md"),
      `# 超长故事
${"中".repeat(12000)}`,
      "utf8",
    );
    await run(tools.write, { op: "status", plan, note: "01", status: "in_progress" }, cwd);
    await run(
      tools.write,
      { op: "status", plan, note: "01", status: "awaiting_verification" },
      cwd,
    );
    await expect(
      run(tools.write, { op: "complete", plan, note: "01", evidence: ["完成"] }, cwd),
    ).rejects.toThrow(/校验未通过/u);
  });
});
