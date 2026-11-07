import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import {
  createRegistry,
  deliver,
  disposeAll,
  harvest,
  renderInput,
  type WorkerEntry,
} from "./handles.ts";
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
  /** 解掉 `prompt()` 的终态；测试用它模拟“worker 还在跑”。 */
  finish: (() => void) | undefined;
  prompt(text: string): Promise<void>;
  steer(text: string): Promise<unknown>;
  followUp(text: string): Promise<unknown>;
  waitForIdle(): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

/**
 * 可控的 session 替身。
 * @param isIdle - 起始是否空闲。
 * @param autoFinish - true 时 `prompt` 立刻 resolve；false 时挂在一个手动开关上，
 *   用来断言“入队立即返回、不等整轮”。
 */
const fakeSession = (isIdle = true, autoFinish = true): FakeSession => {
  const session: FakeSession = {
    isIdle,
    prompts: [],
    followUps: [],
    aborted: false,
    disposed: false,
    finish: undefined,
    prompt(text) {
      session.prompts.push(text);
      session.isIdle = false;
      if (autoFinish) {
        session.isIdle = true;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        session.finish = () => {
          session.isIdle = true;
          resolve();
        };
      });
    },
    async steer() {
      return "queued";
    },
    async followUp(text) {
      session.followUps.push(text);
      return "queued";
    },
    async waitForIdle() {
      return undefined;
    },
    async abort() {
      session.aborted = true;
      session.finish?.();
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
    const idleDelivery = deliver(entry(idle), "message", "开始做 05");
    expect(idleDelivery.queued).toBe(false);
    expect(idle.prompts[0]).toBe("开始做 05");
    await idleDelivery.settled;

    const busyDelivery = deliver(entry(busy), "pass", "", "05");
    expect(busyDelivery.queued).toBe(true);
    expect(busy.followUps[0]).toContain("[pass] note 05");
    await busyDelivery.settled;
  });

  it("入队不等整轮：prompt 未 settle 也立刻返回", async () => {
    const session = fakeSession(true, false);
    const target = entry(session);
    let settled = false;
    const delivery = deliver(target, "message", "做 01");
    void delivery.settled.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(session.prompts).toEqual(["做 01"]);
    expect(settled).toBe(false);
    session.finish?.();
    await delivery.settled;
    expect(settled).toBe(true);
  });

  it("pass / answer / fact 各自渲染成明确口径", () => {
    expect(renderInput("pass", "", "07")).toContain("已放行");
    expect(renderInput("rework", "测试没过", "07")).toContain("要求返工：测试没过");
    expect(renderInput("answer", "用方案 A", "07")).toContain("人的答复：用方案 A");
    expect(renderInput("fact", "另一个 plan 也在改这句", "07")).toContain("不授予权限");
  });

  it("disposeAll 中止并释放全部条目，清掉在途 job 与 watchdog", async () => {
    const registry = createRegistry();
    const session = fakeSession(true, false);
    const target = entry(session);
    registry.add(target);
    deliver(target, "message", "做 01");
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
    }, 1_000);
    target.job = {
      kind: "message",
      startedAt: 1,
      settled: Promise.resolve(),
      timer,
      notified: false,
    };
    expect(await disposeAll(registry)).toBe(1);
    expect(registry.size()).toBe(0);
    expect(target.job).toBeUndefined();
    expect(session.aborted).toBe(true);
    expect(session.disposed).toBe(true);
    // 定时器已被清掉：等一会儿也不会触发。
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fired).toBe(false);
  });

  it("harvest 幂等且不误杀新一代 job", () => {
    const session = fakeSession(true, false);
    const target = entry(session);
    const first = {
      kind: "message" as const,
      startedAt: 1,
      settled: Promise.resolve(),
      notified: false,
    };
    target.job = first;
    expect(harvest(target)).toBe(true);
    expect(harvest(target)).toBe(false);
    const second = {
      kind: "pass" as const,
      startedAt: 2,
      settled: Promise.resolve(),
      notified: false,
    };
    target.job = second;
    expect(harvest(target, first)).toBe(false);
    expect(target.job).toBe(second);
  });
});

describe("dispatch 与 workers 工具", () => {
  const setup = async (options: { timeoutMs?: number; makeSession?: () => FakeSession } = {}) => {
    const local: ToolkitSettings =
      options.timeoutMs === undefined
        ? settings
        : {
            ...settings,
            orchestrator: { ...settings.orchestrator, workerTimeoutMs: options.timeoutMs },
          };
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
      settings: () => local,
      setAlways: () => undefined,
      spawn: async () => {
        const session = (options.makeSession ?? (() => fakeSession()))();
        spawns.push(session);
        created.push(session);
        return { session, dispose: () => session.dispose() };
      },
    });
    return { tools, messages, spawns };
  };

  const ctx = (cwd: string) => ({ cwd }) as unknown as ExtensionContext;

  const textOf = (result: unknown): string =>
    (result as { content: { text: string }[] }).content[0]?.text ?? "";

  const timeouts = (messages: unknown[]): unknown[] =>
    messages.filter(
      (message) =>
        (message as { customType?: string }).customType === "orchestrator-worker-timeout",
    );

  /** 造一个最小可解析的 Plan 目录（同一 root 下可建多个）。 */
  const planArgs = async (name = "2026-11-07-示例", existingRoot?: string) => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { emptyDocument, serializeDocument } = await import("./dag.ts");
    const { NOTES_FILE } = await import("./store.ts");
    const root = existingRoot ?? (await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-")));
    const dir = path.join(root, ".agents", "domains", "etf", "plans", "active", name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, NOTES_FILE), serializeDocument(emptyDocument()), "utf8");
    return { root, ref: `etf/active/${name}` };
  };

  it("worker 运行中 dispatch 立即返回摘要，不等整轮", async () => {
    const sessions: FakeSession[] = [];
    const { tools } = await setup({
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    const text = textOf(
      await tools
        .get("orchestrator_dispatch")
        ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root)),
    );
    expect(text).toContain(`已起 worker 接手 ${ref}`);
    expect(text).toContain("kind: message");
    expect(text).toContain("完成后会有 report 推回；用 orchestrator_workers 查 live 清单。");
    // worker 还没跑完（终态开关未触发），dispatch 已经返回。
    expect(sessions[0]?.finish).toBeDefined();
    sessions[0]?.finish?.();
  });

  it("两个 Plan 连续派工，第二个不被第一个阻塞", async () => {
    const sessions: FakeSession[] = [];
    const { tools } = await setup({
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const first = await planArgs();
    const second = await planArgs("2026-11-07-另一个", first.root);
    const dispatch = tools.get("orchestrator_dispatch");
    const order: string[] = [];
    const run = async (ref: string): Promise<void> => {
      const result = await dispatch?.execute(
        "id",
        { plan: ref, message: `做 ${ref}` },
        undefined,
        undefined,
        ctx(first.root),
      );
      order.push(textOf(result).split("\n")[0] ?? "");
    };
    await run(first.ref);
    await run(second.ref);
    expect(order).toEqual([`已起 worker 接手 ${first.ref}`, `已起 worker 接手 ${second.ref}`]);
    expect(sessions).toHaveLength(2);
    // 两个 worker 都还在跑（没被当完），说明第二个没等第一个。
    expect(sessions.map((session) => session.finish !== undefined)).toEqual([true, true]);
    for (const session of sessions) session.finish?.();
  });

  it("超时由后台 watchdog abort 并只注入一条超时消息", async () => {
    const sessions: FakeSession[] = [];
    const { tools, messages } = await setup({
      timeoutMs: 10,
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    await tools
      .get("orchestrator_dispatch")
      ?.execute("id", { plan: ref, message: "做 01", note: "01" }, undefined, undefined, ctx(root));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(timeouts(messages)).toHaveLength(1);
    const message = timeouts(messages)[0] as { content: string; details: { timedOut?: boolean } };
    expect(message.content).toContain("超时");
    expect(message.content).toContain("note 状态未改动");
    expect(message.details.timedOut).toBe(true);
    expect(sessions[0]?.aborted).toBe(true);
    // 再等一会儿也不会重复提醒。
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(timeouts(messages)).toHaveLength(1);
  });

  it("worker 正常结束即收割，不会误报超时", async () => {
    const sessions: FakeSession[] = [];
    const { tools, messages } = await setup({
      timeoutMs: 10,
      makeSession: () => {
        const session = fakeSession();
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    await tools
      .get("orchestrator_dispatch")
      ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(timeouts(messages)).toHaveLength(0);
    expect(sessions[0]?.aborted).toBe(false);
  });

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
