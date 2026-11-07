import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import type { NoteNode } from "./dag.ts";
import {
  createRegistry,
  deliver,
  disposeAll,
  harvest,
  renew,
  renderInput,
  type WorkerEntry,
  type WorkerJob,
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
const createdDirs: string[] = [];
afterEach(async () => {
  created.splice(0);
  const fs = await import("node:fs/promises");
  await Promise.all(
    createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
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
      progressAt: 1,
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
      progressAt: 1,
      settled: Promise.resolve(),
      notified: false,
    };
    target.job = first;
    expect(harvest(target)).toBe(true);
    expect(harvest(target)).toBe(false);
    const second = {
      kind: "pass" as const,
      startedAt: 2,
      progressAt: 2,
      settled: Promise.resolve(),
      notified: false,
    };
    target.job = second;
    expect(harvest(target, first)).toBe(false);
    expect(target.job).toBe(second);
  });

  it("renew 只对当前 job 生效，已通知过的不再续，收割后不残留 timer", async () => {
    const session = fakeSession(true, false);
    const target = entry(session);
    let fired = 0;
    const job = {
      kind: "message" as const,
      startedAt: 1,
      progressAt: 1,
      settled: Promise.resolve(),
      notified: false,
    } as WorkerJob;
    target.job = job;
    expect(renew(target, job, 1_000, () => (fired += 1))).toBe(true);
    expect(job.progressAt).toBeGreaterThan(1);

    // 换代以后再续旧 job：不生效，也不给旧 job 上新 timer。
    const next = {
      kind: "pass" as const,
      startedAt: 2,
      progressAt: 2,
      settled: Promise.resolve(),
      notified: false,
    };
    target.job = next;
    const stale = job.timer;
    expect(renew(target, job, 1_000, () => (fired += 1))).toBe(false);
    expect(job.timer).toBe(stale);

    // 已经通知过超时的 job 不再续。
    next.notified = true;
    expect(renew(target, next, 1_000, () => (fired += 1))).toBe(false);

    // 收割后定时器被清掉：等一会儿也不触发。
    next.notified = false;
    expect(renew(target, next, 5, () => (fired += 1))).toBe(true);
    harvest(target, next);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(0);
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
    const reports: Array<(report: WorkerReport) => void> = [];
    const spawnOptions: Array<{ plan?: unknown; temp?: string }> = [];
    const { registerOrchestrator } = await import("./register.ts");
    registerOrchestrator(pi, {
      settings: () => local,
      setAlways: () => undefined,
      spawn: async (spawnOptionsInput) => {
        spawnOptions.push({
          ...(spawnOptionsInput.plan === undefined ? {} : { plan: spawnOptionsInput.plan }),
          ...(spawnOptionsInput.temp === undefined ? {} : { temp: spawnOptionsInput.temp }),
        });
        reports.push(spawnOptionsInput.report);
        const session = (options.makeSession ?? (() => fakeSession()))();
        spawns.push(session);
        created.push(session);
        return { session, dispose: () => session.dispose() };
      },
    });
    return { tools, messages, spawns, reports, spawnOptions, handlers };
  };

  const textOf = (result: unknown): string =>
    (result as { content: { text: string }[] }).content[0]?.text ?? "";

  const ctx = (cwd: string) => ({ cwd }) as unknown as ExtensionContext;

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

  /** 一条最小 note。 */
  const note = (
    id: string,
    blockedBy: readonly string[] = [],
    status: NoteNode["status"] = "pending",
  ) => ({
    id,
    title: `note ${id}`,
    description: `摘要 ${id}`,
    status,
    blocked_by: [...blockedBy],
    evidence: [],
    updated_at: "2026-11-07T00:00:00.000Z",
    content: `正文 ${id}`,
  });

  /** 造一个带指定 notes 的 Plan（组派工用）。 */
  const planWithNotes = async (notes: ReturnType<typeof note>[], name = "2026-11-07-分组") => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { serializeDocument } = await import("./dag.ts");
    const { NOTES_FILE } = await import("./store.ts");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-groups-"));
    const dir = path.join(root, ".agents", "domains", "etf", "plans", "active", name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, NOTES_FILE),
      serializeDocument({ version: 1, index: [], notes }),
      "utf8",
    );
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

  it("退出收尾前把 in_progress 的 note 记进中断凭据", async () => {
    // worker 随会话退出而消失，note 却还停在 in_progress：先留痕再摘句柄，note 不悬空。
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { readInterrupted, stateDirectory } = await import("./errors.ts");
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-shutdown-"));
    createdDirs.push(agentDir);
    const previous = process.env["PI_CODING_AGENT_DIR"];
    process.env["PI_CODING_AGENT_DIR"] = agentDir;
    try {
      const { tools, handlers } = await setup({ makeSession: () => fakeSession(true, false) });
      const { root, ref } = await planWithNotes([note("01", [], "in_progress"), note("02")]);
      await tools
        .get("orchestrator_dispatch")
        ?.execute(
          "id",
          { plan: ref, message: "做 01", note: "01" },
          undefined,
          undefined,
          ctx(root),
        );
      for (const handler of handlers.get("session_shutdown") ?? []) {
        await handler({ reason: "quit" });
      }
      const state = readInterrupted(stateDirectory(agentDir));
      expect(state?.plans).toEqual([ref]);
      expect(state?.notes).toEqual([`${ref} · note 01`]);
      expect(state?.reason).toContain("session_shutdown");
    } finally {
      if (previous === undefined) delete process.env["PI_CODING_AGENT_DIR"];
      else process.env["PI_CODING_AGENT_DIR"] = previous;
    }
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

  it("上报即续期：窗口内报过进展就不 abort，随后静默到点才中止", async () => {
    const sessions: FakeSession[] = [];
    const { tools, messages, reports } = await setup({
      timeoutMs: 60,
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
    const planDirectory = (await import("node:path")).resolve(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-示例",
    );

    // 第一个窗口过半时上报一次进展（done 也算）。
    await new Promise((resolve) => setTimeout(resolve, 30));
    reports[0]?.({ outcome: "done", note: "01", summary: "还在跑", plan: planDirectory });
    // 原定超时点已过，但因为续期了仍然活着。
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(timeouts(messages)).toHaveLength(0);
    expect(sessions[0]?.aborted).toBe(false);

    // 此后不再上报：续期后的窗口到点才中止。
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(timeouts(messages)).toHaveLength(1);
    expect(sessions[0]?.aborted).toBe(true);
  });

  it("超时后摘除句柄：worker 清单不再列出，再次派工起新 session", async () => {
    const sessions: FakeSession[] = [];
    const { tools, messages, spawns } = await setup({
      timeoutMs: 20,
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    const dispatch = tools.get("orchestrator_dispatch");
    const workers = tools.get("orchestrator_workers");
    await dispatch?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    expect(spawns).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(timeouts(messages)).toHaveLength(1);
    expect(sessions[0]?.aborted).toBe(true);
    expect(sessions[0]?.disposed).toBe(true);

    // 句柄已摘除：live 清单不再列出该 Plan。
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

    // 再次派工不再复用被 abort 的 session，而是起一个新的。
    await dispatch?.execute(
      "id",
      { plan: ref, message: "重做 01" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(2);
    expect(spawns[1]?.prompts).toEqual(["重做 01"]);
    expect(spawns[1]).not.toBe(sessions[0]);
    sessions[1]?.finish?.();
  });

  it("没有 plan 时起临时 worker：键 temp:N，跑完即摘除", async () => {
    const { tools, spawns, spawnOptions } = await setup();
    const { root } = await planArgs();
    const dispatch = tools.get("orchestrator_dispatch");
    const text = textOf(
      await dispatch?.execute("id", { message: "查一下 X" }, undefined, undefined, ctx(root)),
    );
    expect(text).toContain("已起临时 worker temp:1");
    expect(text).toContain("跑完即弃");
    expect(spawnOptions[0]).toMatchObject({ temp: "1" });
    expect(spawnOptions[0]?.plan).toBeUndefined();
    expect(spawns[0]?.prompts).toEqual(["查一下 X"]);

    // 跑完即摘除：live 清单不再列出，session 已 dispose。
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(spawns[0]?.disposed).toBe(true);
    const listed = (await tools
      .get("orchestrator_workers")
      ?.execute("id", { op: "list" }, undefined, undefined, ctx(root))) as {
      content: { text: string }[];
    };
    expect(listed.content[0]?.text).toContain("没有 live worker");

    // 下一次临时派工拿新 id，不复用上一次的键。
    await dispatch?.execute("id", { message: "再看一下 Y" }, undefined, undefined, ctx(root));
    expect(spawnOptions[1]).toMatchObject({ temp: "2" });
  });

  it("临时 worker 超时同样 abort 并摘除句柄", async () => {
    const { tools, messages, spawns } = await setup({
      timeoutMs: 10,
      makeSession: () => fakeSession(true, false),
    });
    const { root } = await planArgs();
    await tools
      .get("orchestrator_dispatch")
      ?.execute("id", { message: "查一下 X" }, undefined, undefined, ctx(root));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(timeouts(messages)).toHaveLength(1);
    expect((timeouts(messages)[0] as { content: string }).content).toContain("temp:1");
    expect(spawns[0]?.aborted).toBe(true);
    expect(spawns[0]?.disposed).toBe(true);
    const listed = (await tools
      .get("orchestrator_workers")
      ?.execute("id", { op: "list" }, undefined, undefined, ctx(root))) as {
      content: { text: string }[];
    };
    expect(listed.content[0]?.text).toContain("没有 live worker");
  });

  it("workers 清单展示临时条目的 kind，可单独 abort", async () => {
    const { tools, spawns } = await setup({
      makeSession: () => fakeSession(true, false),
    });
    const { root } = await planArgs();
    await tools
      .get("orchestrator_dispatch")
      ?.execute("id", { message: "查一下 X" }, undefined, undefined, ctx(root));
    const listed = (await tools
      .get("orchestrator_workers")
      ?.execute("id", { op: "list" }, undefined, undefined, ctx(root))) as {
      content: { text: string }[];
    };
    expect(listed.content[0]?.text).toContain("temp:1 · temp ·");

    await tools
      .get("orchestrator_workers")
      ?.execute("id", { op: "abort", plan: "temp:1" }, undefined, undefined, ctx(root));
    expect(spawns[0]?.aborted).toBe(true);
    expect(spawns[0]?.disposed).toBe(true);
  });

  it("同一 Plan 两组同时派工，第二个不等第一个", async () => {
    const { tools, spawns } = await setup({ makeSession: () => fakeSession(true, false) });
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const dispatch = tools.get("orchestrator_dispatch");
    const first = textOf(
      await dispatch?.execute(
        "id",
        { plan: ref, notes: ["01"], message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    const second = textOf(
      await dispatch?.execute(
        "id",
        { plan: ref, notes: ["02"], message: "做 02" },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    expect(first).toContain(`${ref} 的组 [01]`);
    expect(second).toContain(`${ref} 的组 [02]`);
    expect(spawns).toHaveLength(2);
    expect(spawns[0]?.prompts).toEqual(["做 01"]);
    expect(spawns[1]?.prompts).toEqual(["做 02"]);
    // 两个都在跑：第二个没被第一个堵住。
    expect(spawns.map((session) => session.finish !== undefined)).toEqual([true, true]);

    // 同一组重复派工复用既有 worker。
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["01"], message: "再做 01" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(2);

    const listed = textOf(
      await tools
        .get("orchestrator_workers")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("notes: 01 ·");
    expect(listed).toContain("notes: 02 ·");
    for (const session of spawns) session.finish?.();
  });

  it("pass 按 note 路由到含它的组，找不到就报错", async () => {
    const { tools, spawns } = await setup({ makeSession: () => fakeSession(true, false) });
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const dispatch = tools.get("orchestrator_dispatch");
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["01"], message: "做 01" },
      undefined,
      undefined,
      ctx(root),
    );
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["02"], message: "做 02" },
      undefined,
      undefined,
      ctx(root),
    );
    await dispatch?.execute(
      "id",
      { plan: ref, kind: "pass", note: "02", message: "" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(2);
    expect(spawns[0]?.followUps).toHaveLength(0);
    expect(spawns[1]?.followUps[0]).toContain("[pass] note 02");

    await expect(
      dispatch?.execute(
        "id",
        { plan: ref, kind: "pass", note: "99", message: "" },
        undefined,
        undefined,
        ctx(root),
      ),
    ).rejects.toThrow(/没有包含 note 99 的 worker 组/);
    for (const session of spawns) session.finish?.();
  });

  it("组内有 blocked_by 依赖或 note 不存在时拒绝派工", async () => {
    const { tools, spawns } = await setup();
    const { root, ref } = await planWithNotes([note("01"), note("02", ["01"])]);
    const dispatch = tools.get("orchestrator_dispatch");
    await expect(
      dispatch?.execute(
        "id",
        { plan: ref, notes: ["01", "02"], message: "并行做" },
        undefined,
        undefined,
        ctx(root),
      ),
    ).rejects.toThrow(/blocked_by 依赖（01 → 02）/);
    await expect(
      dispatch?.execute(
        "id",
        { plan: ref, notes: ["77"], message: "做 77" },
        undefined,
        undefined,
        ctx(root),
      ),
    ).rejects.toThrow(/没有 note 77/);
    expect(spawns).toHaveLength(0);
  });

  it("report 按 note 只续期它所在的组", async () => {
    const { tools, messages, reports } = await setup({
      timeoutMs: 60,
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const path = await import("node:path");
    const planDirectory = path.resolve(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-分组",
    );
    const dispatch = tools.get("orchestrator_dispatch");
    for (const id of ["01", "02"]) {
      await dispatch?.execute(
        "id",
        { plan: ref, notes: [id], message: `做 ${id}` },
        undefined,
        undefined,
        ctx(root),
      );
    }
    // 只给 01 组报进展。
    await new Promise((resolve) => setTimeout(resolve, 30));
    reports[0]?.({ outcome: "done", note: "01", summary: "还在跑", plan: planDirectory });
    await new Promise((resolve) => setTimeout(resolve, 45));
    // 01 组续期后仍活着，02 组静默到点被中止。
    expect(timeouts(messages)).toHaveLength(1);
    expect((timeouts(messages)[0] as { content: string }).content).toContain("notes 02");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(timeouts(messages)).toHaveLength(2);
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
