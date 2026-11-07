import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_ORCHESTRATOR_SETTINGS } from "./config.ts";
import { openLedger } from "./ledger.ts";
import { createInterruptedAccess, createProjection } from "./projection.ts";
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
  const dir = await mkdtemp(join(tmpdir(), "pi-orchestrator-"));
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
  settings = DEFAULT_ORCHESTRATOR_SETTINGS,
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

/** 只把 `resume` 用到的凭据口换成内存桩，其余仍走真实运行期。 */
const withInterrupted = (interrupted: ToolRuntime["interrupted"]): RunnableTool => {
  const runtime = createToolRuntime({
    limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
    domainRoot: ".agents/domains",
    ...(interrupted === undefined ? {} : { interrupted }),
  });
  return createReadTool(runtime) as unknown as RunnableTool;
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

describe("orchestrator_write / orchestrator_read", () => {
  it("runs init → create → ready → waiting → complete", async () => {
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
    expect(createdNote).toContain("首条 note");

    const ready = await run(tools.read, { op: "ready", plan: PLAN }, cwd);
    expect(ready).toContain("第 1 组");
    expect(ready).toContain("01 [pending] 实现");

    await run(tools.write, { op: "status", plan: PLAN, note: "01", status: "in_progress" }, cwd);
    await expect(
      run(tools.write, { op: "complete", plan: PLAN, note: "01", evidence: ["提前"] }, cwd),
    ).rejects.toThrow(/不能直接 complete/u);

    await run(
      tools.write,
      { op: "status", plan: PLAN, note: "01", status: "waiting", needs: "review" },
      cwd,
    );
    const resume = await run(tools.read, { op: "resume", plan: PLAN }, cwd);
    expect(resume).toContain("等待验证（1）");
    // 没有注入凭据口（worker 侧）时，resume 不展示也不碰崩溃凭据。
    expect(resume).not.toContain("上次崩溃");

    const completed = await run(
      tools.write,
      { op: "complete", plan: PLAN, note: "01", evidence: ["测试通过"] },
      cwd,
    );
    expect(completed).toContain("已完成 note 01");
    expect(completed).toContain("全部 note 已完成");
    const raw = JSON.parse(
      await readFile(
        join(cwd, ".agents/domains", "demo/plans/active/2026-11-08-测试计划", "notes.json"),
        "utf8",
      ),
    ) as { notes: { status: string; evidence: string[] }[] };
    expect(raw.notes[0]?.status).toBe("completed");
    expect(raw.notes[0]?.evidence).toContain("测试通过");
  });

  it("groups dependent notes and separates waiting", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-分组计划" }, cwd);
    const plan = "demo/active/2026-11-08-分组计划";
    for (const [title, blockedBy] of [
      ["第一条", undefined],
      ["第二条", ["01"]],
      ["第三条", undefined],
    ] as const) {
      const created = await run(
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
      if (blockedBy !== undefined) expect(created).toContain("用 status 置 in_progress");
    }
    await run(tools.write, { op: "status", plan, note: "01", status: "in_progress" }, cwd);
    await run(
      tools.write,
      { op: "status", plan, note: "01", status: "waiting", needs: "review" },
      cwd,
    );
    const ready = await run(tools.read, { op: "ready", plan }, cwd);
    expect(ready).toContain("第 1 组（2）");
    expect(ready).toContain("01 [waiting/review]");
    expect(ready).toContain("03 [pending]");
    expect(ready.indexOf("01 [waiting/review]")).toBeLessThan(ready.indexOf("03 [pending]"));
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

describe("orchestrator_check", () => {
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

describe("orchestrator_read operations", () => {
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

describe("orchestrator_write operations", () => {
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
      { op: "status", plan, note: "01", status: "waiting", needs: "review" },
      cwd,
    );
    await expect(
      run(tools.write, { op: "complete", plan, note: "01", evidence: ["完成"] }, cwd),
    ).rejects.toThrow(/校验未通过/u);
  });
});

describe("invalid document repair", () => {
  const plan = "demo/active/2026-11-08-待修复";
  const file = (cwd: string): string =>
    join(cwd, ".agents/domains/demo/plans/active/2026-11-08-待修复", "notes.json");

  const seed = async (cwd: string) => {
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-待修复" }, cwd);
    await run(
      tools.write,
      { op: "create", plan, title: "A", description: "A", content: "A 正文" },
      cwd,
    );
    return tools;
  };

  const corrupt = async (cwd: string): Promise<string> => {
    const path = file(cwd);
    const document = JSON.parse(await readFile(path, "utf8")) as {
      index: string[];
      notes: { description: string }[];
    };
    document.notes[0]!.description = "长".repeat(200);
    document.index = ["01", "01", "99"];
    await writeFile(path, JSON.stringify(document), "utf8");
    return path;
  };

  it("inspect shows the raw view while the document stays invalid", async () => {
    const cwd = await makeWorkspace();
    const tools = await seed(cwd);
    await corrupt(cwd);
    const text = await run(tools.read, { op: "inspect", plan }, cwd);
    expect(text).toContain("原始视图");
    expect(text).toContain("长".repeat(20));
    await expect(run(tools.read, { op: "notes", plan }, cwd)).rejects.toThrow(/无效/u);
  });

  it("repair applies model-provided description and index", async () => {
    const cwd = await makeWorkspace();
    const tools = await seed(cwd);
    const path = await corrupt(cwd);
    const result = await run(
      tools.write,
      {
        op: "repair",
        plan,
        notes: [{ note: "01", description: "模型重写的摘要" }],
        index: ["01"],
      },
      cwd,
    );
    expect(result).toContain("已修复");
    const fixed = JSON.parse(await readFile(path, "utf8")) as {
      index: string[];
      notes: { description: string }[];
    };
    expect(fixed.notes[0]!.description).toBe("模型重写的摘要");
    expect(fixed.index).toEqual(["01"]);
    expect(await run(tools.read, { op: "notes", plan }, cwd)).toContain("01 [pending] A");
  });

  it("repair rejects calls without changes and unknown notes", async () => {
    const cwd = await makeWorkspace();
    const tools = await seed(cwd);
    await corrupt(cwd);
    await expect(run(tools.write, { op: "repair", plan }, cwd)).rejects.toThrow(/至少需要/u);
    await expect(
      run(tools.write, { op: "repair", plan, notes: [{ note: "99", description: "x" }] }, cwd),
    ).rejects.toThrow(/没有 note 99/u);
  });
});

describe("resume 消费崩溃凭据", () => {
  it("命中时展示崩溃行并只移除本 Plan 的条目", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-测试计划" }, cwd);
    const forgotten: string[] = [];
    const read = withInterrupted({
      read: () => ({
        at: "2026-11-07T00:00:00.000Z",
        reason: "uncaughtException: worker 炸了",
        plans: [PLAN, "demo/active/另一个计划"],
        notes: [],
      }),
      forget: (planRef) => forgotten.push(planRef),
      clear: () => {
        throw new Error("resume 不该清整档");
      },
    });
    const text = await run(read, { op: "resume", plan: PLAN }, cwd);
    expect(text).toContain("上次崩溃: 2026-11-07T00:00:00.000Z · uncaughtException: worker 炸了");
    expect(text).toContain("已移除本 Plan 条目");
    expect(forgotten).toEqual([PLAN]);
  });

  it("未命中时不展示也不移除凭据", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-测试计划" }, cwd);
    const read = withInterrupted({
      read: () => ({
        at: "2026-11-07T00:00:00.000Z",
        reason: "boom",
        plans: ["demo/active/另一个计划"],
        notes: [],
      }),
      forget: () => {
        throw new Error("未命中时不该移除凭据");
      },
      clear: () => {
        throw new Error("未命中时不该清凭据");
      },
    });
    const text = await run(read, { op: "resume", plan: PLAN }, cwd);
    expect(text).not.toContain("上次崩溃");
    expect(text).not.toContain("已移除本 Plan 条目");
  });
});

describe("resume 与账本里的凭据", () => {
  it("只移除本 Plan 条目，其它条目留在账本里", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-测试计划" }, cwd);
    const stateDir = await tempDir();
    const ledger = openLedger(stateDir);
    ledger.append({
      type: "worker.exit",
      at: "2026-11-07T00:00:00.000Z",
      payload: {
        worker: "/w/demo/active/测试计划::",
        planRef: PLAN,
        reason: "uncaughtException: worker 炸了",
      },
    });
    ledger.append({
      type: "worker.exit",
      at: "2026-11-07T00:00:01.000Z",
      payload: {
        worker: "/w/demo/active/另一个计划::",
        planRef: "demo/active/另一个计划",
        reason: "uncaughtException: worker 炸了",
      },
    });
    const projection = createProjection(ledger, { pollMs: 1_000 });
    // 与 register.ts 注入编排方的三个入口同形。
    const interrupted = createInterruptedAccess(ledger, projection);
    const read = withInterrupted(interrupted);
    const text = await run(read, { op: "resume", plan: PLAN }, cwd);
    // 凭据的 at 取最后一次中断（两条 worker.exit 里更晚的那条）。
    expect(text).toContain("上次崩溃: 2026-11-07T00:00:01.000Z · uncaughtException: worker 炸了");
    expect(interrupted.read()?.plans).toEqual(["demo/active/另一个计划"]);
    projection.dispose();
  });
});

describe("notes.json 写回锁", () => {
  it("并发读改写同一份 notes 不丢更新", async () => {
    const cwd = await makeWorkspace();
    const tools = setup();
    await run(tools.write, { op: "init", domain: "demo", name: "2026-11-08-并发计划" }, cwd);
    const plan = "demo/active/2026-11-08-并发计划";
    await run(
      tools.write,
      { op: "create", plan, title: "甲", description: "甲", content: "甲" },
      cwd,
    );
    await run(
      tools.write,
      { op: "create", plan, title: "乙", description: "乙", content: "乙" },
      cwd,
    );

    // 三个 op 同时开工：没有锁的话「读→改→写」会互相覆盖。
    await Promise.all([
      run(tools.write, { op: "update", plan, note: "01", content: "甲改" }, cwd),
      run(tools.write, { op: "status", plan, note: "02", status: "in_progress" }, cwd),
      run(tools.write, { op: "set_index", plan, ids: ["01"] }, cwd),
    ]);

    const text = await readFile(
      join(cwd, ".agents/domains/demo/plans/active/2026-11-08-并发计划/notes.json"),
      "utf8",
    );
    const document = JSON.parse(text) as {
      index: string[];
      notes: { id: string; status: string; content: string }[];
    };
    expect(document.notes.find((note) => note.id === "01")?.content).toBe("甲改");
    expect(document.notes.find((note) => note.id === "02")?.status).toBe("in_progress");
    expect(document.index).toEqual(["01"]);
  });

  it("withDocumentLock 按路径串行，前一个失败不阻塞后一个", async () => {
    const { documentLockKey, withDocumentLock } = await import("./store.ts");
    const key = documentLockKey(join(tmpdir(), "pi-lock-serial"));
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 5 }, (_unused, index) =>
        withDocumentLock(key, async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 1));
          order.push(index);
          active -= 1;
          if (index === 1) throw new Error("模拟写失败");
        }).catch(() => undefined),
      ),
    );
    expect(peak).toBe(1);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("worker 在 worktree 里也能解析锚定的 Plan", () => {
  it("cwd 是 .worktrees/<名> 时，用 lockedPlan 反推工作区根", async () => {
    const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const join = (...parts: string[]): string => path.join(...parts);
    const { createToolRuntime } = await import("./tools/shared.ts");
    const { createReadTool } = await import("./tools/read.ts");
    const { DEFAULT_DOMAIN_ROOT, DEFAULT_ORCHESTRATOR_SETTINGS } = await import("./config.ts");
    const { serializeDocument, emptyDocument } = await import("./dag.ts");

    const root = await mkdtemp(join(tmpdir(), "pi-worktree-tools-"));
    const planDirectory = join(root, ".agents/domains/demo/plans/active/2026-01-01-x");
    await mkdir(planDirectory, { recursive: true });
    await writeFile(join(planDirectory, "notes.json"), serializeDocument(emptyDocument()), "utf8");
    // 模拟 worktree worker：cwd 在别处（没有 .agents/domains），Plan 锚定主工作区绝对路径。
    const worktree = join(root, ".worktrees", "plan");
    await mkdir(worktree, { recursive: true });

    const runtime = createToolRuntime({
      limits: () => DEFAULT_ORCHESTRATOR_SETTINGS,
      domainRoot: DEFAULT_DOMAIN_ROOT,
      role: "worker",
      lockedPlan: planDirectory,
    });
    expect(runtime.workspace({ cwd: worktree } as never)).toBe(root);

    const tool = createReadTool(runtime);
    const result = (await tool.execute?.("id", { op: "resume" }, undefined, undefined, {
      cwd: worktree,
    } as never)) as { content: { text: string }[] };
    expect(result.content[0]?.text).toContain("demo/active/2026-01-01-x");
  });
});
