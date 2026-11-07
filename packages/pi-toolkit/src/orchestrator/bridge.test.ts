import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import { createRegistry, deliver, disposeAll, renderInput, type WorkerEntry } from "./handles.ts";
import type { WorkerReport } from "./types.ts";

const settings: ToolkitSettings = {
  ...DEFAULT_SETTINGS,
  tools: { ...DEFAULT_TOOLS, orchestrator: true },
};

interface FakeSession {
  isIdle: boolean;
  readonly prompts: string[];
  readonly followUps: string[];
  aborted: boolean;
  disposed: boolean;
  prompt(text: string): Promise<void>;
  steer(text: string): Promise<unknown>;
  followUp(text: string): Promise<unknown>;
  abort(): Promise<void>;
  dispose(): void;
}

const fakeSession = (isIdle = true): FakeSession => {
  const session: FakeSession = {
    isIdle,
    prompts: [],
    followUps: [],
    aborted: false,
    disposed: false,
    async prompt(text) {
      session.prompts.push(text);
    },
    async steer() {
      return "queued";
    },
    async followUp(text) {
      session.followUps.push(text);
      return "queued";
    },
    async abort() {
      session.aborted = true;
    },
    dispose() {
      session.disposed = true;
    },
  };
  return session;
};

const entry = (
  session: FakeSession,
  plan = "/w/.agents/domains/x/plans/active/p",
): WorkerEntry => ({
  planDirectory: plan,
  planRef: "x/active/p",
  startedAt: 1,
  released: new Set<string>(),
  session,
  inputs: 0,
});

const created: FakeSession[] = [];
afterEach(() => {
  created.splice(0);
});

describe("句柄表与输入投递", () => {
  it("同一 plan 只登记一次", () => {
    const registry = createRegistry();
    const session = fakeSession();
    const first = registry.add(entry(session));
    const second = registry.add(entry(fakeSession()));
    expect(second).toBe(first);
    expect(registry.size()).toBe(1);
  });

  it("空闲走 prompt，忙走 followUp，并渲染输入种类", async () => {
    const idle = fakeSession(true);
    const busy = fakeSession(false);
    expect(await deliver(entry(idle), "message", "开始做 05")).toEqual({ queued: false });
    expect(idle.prompts[0]).toBe("开始做 05");

    expect(await deliver(entry(busy), "pass", "", "05")).toEqual({ queued: true });
    expect(busy.followUps[0]).toContain("[pass] note 05");
  });

  it("pass / answer / fact 各自渲染成明确口径", () => {
    expect(renderInput("pass", "", "07")).toContain("已放行");
    expect(renderInput("rework", "测试没过", "07")).toContain("要求返工：测试没过");
    expect(renderInput("answer", "用方案 A", "07")).toContain("人的答复：用方案 A");
    expect(renderInput("fact", "另一个 plan 也在改这句", "07")).toContain("不授予权限");
  });

  it("disposeAll 中止并释放全部条目", async () => {
    const registry = createRegistry();
    const session = fakeSession();
    registry.add(entry(session));
    expect(await disposeAll(registry)).toBe(1);
    expect(registry.size()).toBe(0);
    expect(session.aborted).toBe(true);
    expect(session.disposed).toBe(true);
  });
});

describe("dispatch 与 workers 工具", () => {
  const setup = async () => {
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
    const messages: unknown[] = [];
    const handlers = new Map<string, ((payload: unknown) => unknown)[]>();
    const pi = {
      registerTool: (tool: { name: string } & Record<string, unknown>) => {
        tools.set(tool.name, tool as never);
      },
      registerFlag: () => undefined,
      registerCommand: () => undefined,
      getFlag: () => undefined,
      appendEntry: () => undefined,
      getActiveTools: () => ["read"],
      setActiveTools: () => undefined,
      sendMessage: (message: unknown) => messages.push(message),
      on: (event: string, handler: (payload: unknown) => unknown) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
    } as unknown as ExtensionAPI;

    const spawns: FakeSession[] = [];
    const { registerOrchestrator } = await import("./register.ts");
    registerOrchestrator(pi, {
      settings: () => settings,
      setAlways: () => undefined,
      spawn: async () => {
        const session = fakeSession();
        spawns.push(session);
        created.push(session);
        return { session, dispose: () => session.dispose() };
      },
    });
    return { tools, messages, spawns };
  };

  const ctx = (cwd: string) => ({ cwd }) as unknown as ExtensionContext;

  /** 造一个最小可解析的 Plan 目录。 */
  const planArgs = async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { emptyDocument, serializeDocument } = await import("./dag.ts");
    const { NOTES_FILE } = await import("./store.ts");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-"));
    const dir = path.join(root, ".agents", "domains", "etf", "plans", "active", "2026-11-07-示例");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, NOTES_FILE), serializeDocument(emptyDocument()), "utf8");
    return { root, ref: "etf/active/2026-11-07-示例" };
  };

  it("重复 dispatch 复用同一个 worker", async () => {
    const { tools, spawns } = await setup();
    const { root, ref } = await planArgs();
    const dispatch = tools.get("orchestrator_dispatch");
    await dispatch?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    await dispatch?.execute(
      "id",
      { plan: ref, message: "再做 02" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(1);
    expect(spawns[0]?.prompts).toEqual(["做 01", "再做 02"]);

    const workers = tools.get("orchestrator_workers");
    const listed = (await workers?.execute(
      "id",
      { op: "list" },
      undefined,
      undefined,
      ctx(root),
    )) as {
      content: { text: string }[];
    };
    expect(listed.content[0]?.text).toContain("etf/active/2026-11-07-示例");
  });

  it("pass 先放行再投递，abort 清空句柄表", async () => {
    const { tools, spawns } = await setup();
    const { root, ref } = await planArgs();
    const dispatch = tools.get("orchestrator_dispatch");
    await dispatch?.execute(
      "id",
      { plan: ref, kind: "pass", note: "01", message: "" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns[0]?.prompts[0]).toContain("[pass] note 01");

    const workers = tools.get("orchestrator_workers");
    await workers?.execute("id", { op: "abort", plan: ref }, undefined, undefined, ctx(root));
    expect(spawns[0]?.aborted).toBe(true);
    const listed = (await workers?.execute(
      "id",
      { op: "list" },
      undefined,
      undefined,
      ctx(root),
    )) as {
      content: { text: string }[];
    };
    expect(listed.content[0]?.text).toContain("没有 live worker");
  });
});

describe("report 注入", () => {
  it("worker 上报后编排方收到一条消息", async () => {
    const messages: unknown[] = [];
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
    const pi = {
      registerTool: (tool: { name: string }) => tools.set(tool.name, tool as never),
      registerFlag: () => undefined,
      registerCommand: () => undefined,
      getFlag: () => undefined,
      appendEntry: () => undefined,
      getActiveTools: () => ["read"],
      setActiveTools: () => undefined,
      sendMessage: (message: unknown) => messages.push(message),
      on: () => undefined,
    } as unknown as ExtensionAPI;
    const { registerOrchestrator } = await import("./register.ts");
    const captured: Array<(report: WorkerReport) => void> = [];
    registerOrchestrator(pi, {
      settings: () => settings,
      setAlways: () => undefined,
      spawn: async (options) => {
        captured.push(options.report);
        return { session: fakeSession(), dispose: () => undefined };
      },
    });

    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { emptyDocument, serializeDocument } = await import("./dag.ts");
    const { NOTES_FILE } = await import("./store.ts");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-report-"));
    const dir = path.join(root, ".agents", "domains", "etf", "plans", "active", "2026-11-07-示例");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, NOTES_FILE), serializeDocument(emptyDocument()), "utf8");

    await tools
      .get("orchestrator_dispatch")
      ?.execute(
        "id",
        { plan: "etf/active/2026-11-07-示例", message: "做 01" },
        undefined,
        undefined,
        { cwd: root } as unknown as ExtensionContext,
      );

    captured[0]?.({
      outcome: "needs_review",
      note: "01",
      summary: "改完了",
      plan: dir,
    });
    expect(messages).toHaveLength(1);
    const message = messages[0] as { content: string; customType: string };
    expect(message.customType).toBe("orchestrator-report");
    expect(message.content).toContain("needs_review");
    expect(message.content).toContain("改完了");
  });
});
