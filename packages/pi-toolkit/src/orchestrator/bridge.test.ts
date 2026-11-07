import { existsSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import type { NoteNode } from "./dag.ts";
import { CURRENT_PLAN_ENTRY, MODE_ENTRY } from "./mode.ts";
import {
  createRegistry,
  deliver,
  disposeAll,
  harvest,
  LAST_INPUT_SUMMARY_MAX,
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
  readonly steers: string[];
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
 * 最小 worktree 替身（模块级）：给“不关心 worktree”的 setup 用，
 * 避开默认开启 worktree 后真跑 git + pnpm（临时目录里根本没有仓库）。
 */
const silentWorktree = (): import("./worktree.ts").WorktreeHooks => ({
  ensure: async ({ workspace, name }) => ({
    name,
    directory: `${workspace}/.worktrees/${name}`,
    branch: `wt/${name}`,
    created: true,
  }),
  install: async () => ({ ok: true, command: "pnpm install --prefer-offline", durationMs: 1 }),
  remove: async () => ({ removed: true, branchDeleted: true, leftover: false, note: "已清理" }),
  merge: async ({ workspace, name, branch }) => ({
    merged: true,
    branch,
    directory: `${workspace}/.worktrees/${name}`,
    commit: "deadbeef",
  }),
});

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
    steers: [],
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
    async steer(text) {
      session.steers.push(text);
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
  session,
});

const created: FakeSession[] = [];
const createdDirs: string[] = [];
afterEach(async () => {
  created.splice(0);
  const { resetProjections } = await import("./projection.ts");
  const { resetLedgers } = await import("./ledger.ts");
  resetProjections();
  resetLedgers();
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

  it("忙时 queue 走 followUp、steer 走 steer；空闲时 steer 退化为 prompt", async () => {
    const busyQueue = fakeSession(false);
    const queuedDelivery = deliver(entry(busyQueue), "message", "顺手把 02 也做了");
    expect(queuedDelivery).toMatchObject({ queued: true, mode: "queue", delivered: "queued" });
    expect(busyQueue.followUps).toEqual(["顺手把 02 也做了"]);
    expect(busyQueue.steers).toHaveLength(0);
    await queuedDelivery.settled;

    const busySteer = fakeSession(false);
    const steered = deliver(entry(busySteer), "message", "别动 register.ts", undefined, "steer");
    expect(steered).toMatchObject({ queued: true, mode: "steer", delivered: "steered" });
    expect(busySteer.steers).toEqual(["别动 register.ts"]);
    expect(busySteer.followUps).toHaveLength(0);
    await steered.settled;

    const idleSteer = fakeSession(true);
    const degenerated = deliver(entry(idleSteer), "message", "换方向", undefined, "steer");
    expect(degenerated).toMatchObject({ queued: false, mode: "steer", delivered: "prompt" });
    expect(idleSteer.prompts).toEqual(["换方向"]);
    expect(idleSteer.steers).toHaveLength(0);
    await degenerated.settled;
  });

  it("投递只做投递：摘要与时刻由账本 input.sent 事件承载", () => {
    // 句柄不再自己记 lastInput（那是投影的活），这里只验证分支与正文渲染。
    const session = fakeSession(false);
    const target = entry(session);
    expect(deliver(target, "pass", "", "05").delivered).toBe("queued");
    expect(session.followUps[0]).toContain("[pass] note 05");
    expect(target.lastInput).toBeUndefined();

    const long = "长".repeat(200);
    expect(deliver(target, "message", long, undefined, "steer").delivered).toBe("steered");
    expect(session.steers[0]).toBe(long);
    // 摘要长度上限仍是原来的常量（事件侧用 SUMMARY_MAX=120 另外截）。
    expect(LAST_INPUT_SUMMARY_MAX).toBeLessThan(200);
  });

  it("投递只用 prompt / followUp / steer，不碰 nextTurn", async () => {
    const fs = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    for (const file of ["handles.ts", "register.ts", "subdispatch.ts"]) {
      const source = await fs.readFile(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(source).not.toContain("nextTurn(");
    }
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
  const setup = async (
    options: {
      timeoutMs?: number;
      /** 软提示阈值（只标“疑似停滞”，不杀）。 */
      softStallMs?: number;
      makeSession?: () => FakeSession;
      stateDir?: () => string;
      /** 模拟 `pi.sendMessage` 前几次抛错（report 注入失败）。 */
      failSendTimes?: number;
      /** 假 spawn 报出的会话文件路径。 */
      sessionPath?: string;
      /** worktree 操作替身（默认注入假的：默认开启 worktree 后真跑 git + pnpm 会把测试拖垮）。 */
      worktree?: import("./worktree.ts").WorktreeHooks;
      /** 第 n 次诊断（从 1 起）返回的 report；返回 undefined 表示“诊断没给结论”。 */
      diagnosis?: (call: number) => WorkerReport | undefined;
    } = {},
  ) => {
    const local: ToolkitSettings = {
      ...settings,
      orchestrator: {
        ...settings.orchestrator,
        ...(options.timeoutMs === undefined ? {} : { workerTimeoutMs: options.timeoutMs }),
        ...(options.softStallMs === undefined ? {} : { softStallMs: options.softStallMs }),
      },
    };
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
    const messages: unknown[] = [];
    const handlers = new Map<string, ((payload: unknown) => unknown)[]>();
    /** 会话里追加的 entry（`appendEntry` 的替身）；轮转种子的当前 Plan 从这里读。 */
    const entries: { customType: string; data: unknown }[] = [];
    const pi = {
      registerTool: (tool: { name: string } & Record<string, unknown>) => {
        tools.set(tool.name, tool as never);
      },
      registerFlag: () => undefined,
      registerCommand: () => undefined,
      getFlag: () => undefined,
      appendEntry: (customType: string, data: unknown) => {
        entries.push({ customType, data });
      },
      getActiveTools: () => ["read"],
      setActiveTools: () => undefined,
      sendMessage: (message: unknown) => {
        if (failSend > 0) {
          failSend -= 1;
          throw new Error("会话正在关闭");
        }
        messages.push(message);
      },
      on: (event: string, handler: (payload: unknown) => unknown) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
    } as unknown as ExtensionAPI;

    let failSend = options.failSendTimes ?? 0;
    const spawns: FakeSession[] = [];
    const reports: Array<(report: WorkerReport) => void> = [];
    /** 诊断 worker 收到的提示词与调用次数。 */
    const diagnosisPrompts: string[] = [];
    let diagnosisCalls = 0;
    const spawnOptions: Array<{ plan?: unknown; temp?: string; sessionKey?: string }> = [];
    /** 每次 spawn 的 cwd（验 worktree 是否真的换了目录）。 */
    const spawnCwds: string[] = [];
    // 状态目录（worker 会话索引 / 作废登记）落在临时目录：测试不能写真实的 ~/.pi。
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-state-"));
    createdDirs.push(stateRoot);
    const { registerOrchestrator } = await import("./register.ts");
    // 不传就注入假钩子：Plan 派工默认建 worktree，真跑 git + pnpm 会把测试拖成分钟级。
    const worktree = options.worktree ?? fakeWorktree().hooks;
    const handle = registerOrchestrator(pi, {
      settings: () => local,
      setAlways: () => undefined,
      stateDir: options.stateDir ?? (() => stateRoot),
      worktree,
      // 推送合并窗口给 0：测试要断言“推了 / 没推”，不能等 5 秒。
      digestWindowMs: 0,
      spawn: async (spawnOptionsInput) => {
        // 诊断 worker（temp:diag-*）：不落盘、跑一遍就把结论 report 回来。
        if ((spawnOptionsInput.temp ?? "").startsWith("diag-")) {
          diagnosisCalls += 1;
          const answer = options.diagnosis?.(diagnosisCalls);
          const session = {
            isIdle: true,
            prompts: [] as string[],
            followUps: [] as string[],
            steers: [] as string[],
            aborted: false,
            disposed: false,
            finish: undefined,
            prompt(text: string) {
              diagnosisPrompts.push(text);
              session.prompts.push(text);
              if (answer !== undefined) spawnOptionsInput.report(answer);
              return Promise.resolve();
            },
            async steer() {
              return "queued";
            },
            async followUp() {
              return "queued";
            },
            async waitForIdle() {
              return undefined;
            },
            async abort() {
              session.aborted = true;
            },
            dispose() {
              session.disposed = true;
            },
          };
          created.push(session);
          return { session, resumed: false, dispose: () => session.dispose() };
        }
        spawnCwds.push(spawnOptionsInput.cwd);
        spawnOptions.push({
          ...(spawnOptionsInput.plan === undefined ? {} : { plan: spawnOptionsInput.plan }),
          ...(spawnOptionsInput.temp === undefined ? {} : { temp: spawnOptionsInput.temp }),
          ...(spawnOptionsInput.sessionKey === undefined
            ? {}
            : { sessionKey: spawnOptionsInput.sessionKey }),
        });
        reports.push(spawnOptionsInput.report);
        const session = (options.makeSession ?? (() => fakeSession()))();
        spawns.push(session);
        created.push(session);
        return {
          session,
          resumed: false,
          ...(options.sessionPath === undefined ? {} : { sessionPath: options.sessionPath }),
          dispose: () => session.dispose(),
        };
      },
    });
    return {
      tools,
      messages,
      entries,
      handle,
      spawns,
      reports,
      spawnOptions,
      spawnCwds,
      handlers,
      stateRoot,
      diagnosisPrompts,
      diagnosisCalls: () => diagnosisCalls,
    };
  };

  const textOf = (result: unknown): string =>
    (result as { content: { text: string }[] }).content[0]?.text ?? "";

  const ctx = (cwd: string) => ({ cwd }) as unknown as ExtensionContext;

  /** `start`（真实 `session_start` 的入口）要的上下文：会话分支 + UI 替身。 */
  const sessionCtx = (cwd: string, branch: unknown[]) =>
    ({
      cwd,
      mode: "tui",
      hasUI: true,
      sessionManager: { getBranch: () => branch },
      getContextUsage: () => undefined,
      ui: {
        notify: () => undefined,
        setWidget: () => undefined,
        addAutocompleteProvider: () => undefined,
        select: async () => undefined,
        confirm: async () => false,
        custom: undefined,
      },
    }) as unknown as ExtensionContext;

  /** 等异步恢复落定（start 里的自动恢复到下一跳才起会话）。 */
  const waitUntil = async (predicate: () => boolean, timeoutMs = 1_000): Promise<void> => {
    const started = Date.now();
    while (!predicate() && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };

  /** 账本里的超时事件（取代旧的“注入一条超时消息”）。 */
  const timeoutEvents = async (stateRoot: string) => {
    const { openLedger } = await import("./ledger.ts");
    return openLedger(stateRoot)
      .events()
      .filter((event) => event.type === "timeout");
  };

  /** 账本里的退出事件。 */
  const exitEvents = async (stateRoot: string) => {
    const { openLedger } = await import("./ledger.ts");
    return openLedger(stateRoot)
      .events()
      .filter((event) => event.type === "worker.exit");
  };

  /** 等账本里出现指定类型的事件（自动合并挂在 settle 的下一跳，不能同步断言）。 */
  const waitForEvent = async (stateRoot: string, type: string, timeoutMs = 2_000) => {
    const { openLedger } = await import("./ledger.ts");
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = openLedger(stateRoot)
        .events()
        .find((event) => event.type === type);
      if (found !== undefined) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return undefined;
  };

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
    evidence: status === "completed" ? [`测试用 evidence ${id}`] : [],
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

  /** worktree 替身：记录 ensure / install / remove / merge 调用，不碰真 git 与 pnpm。 */
  const fakeWorktree = (
    options: {
      created?: boolean;
      installOk?: boolean;
      /** merge 的结论；false 时返回 blocked（现场保留）。 */
      merged?: boolean;
      /** true 时合并成功但目录残留（模拟 Windows 锁文件删不掉）。 */
      leftover?: boolean;
    } = {},
  ) => {
    const ensured: string[] = [];
    const installed: string[] = [];
    const removed: string[] = [];
    const merges: Array<{ name: string; branch: string }> = [];
    /** 已经存在的现场（真实实现里就是目录在不在）：决定本次是否“新建 + 装依赖”。 */
    const seen = new Set<string>();
    const hooks: import("./worktree.ts").WorktreeHooks = {
      ensure: async ({ workspace, name }) => {
        ensured.push(name);
        const created = options.created ?? !seen.has(name);
        seen.add(name);
        return {
          name,
          directory: `${workspace}/.worktrees/${name}`,
          branch: `wt/${name}`,
          created,
        };
      },
      install: async (directory) => {
        installed.push(directory);
        return options.installOk === false
          ? {
              ok: false,
              command: "pnpm install --prefer-offline",
              durationMs: 1200,
              reason: "ERR_PNPM_WORKSPACE_PKG_NOT_FOUND",
            }
          : { ok: true, command: "pnpm install --prefer-offline", durationMs: 13_500 };
      },
      remove: async ({ name }) => {
        removed.push(name);
        seen.delete(name);
        return { removed: true, branchDeleted: true, leftover: false, note: "已清理" };
      },
      merge: async ({ workspace, name, branch }) => {
        merges.push({ name, branch });
        const directory = `${workspace}/.worktrees/${name}`;
        if (options.merged === false) {
          return {
            merged: false,
            branch,
            directory,
            reason: "主分支已有自己的提交，不能 --ff-only；现场保留",
          };
        }
        if (options.leftover === true) {
          // 合并成功、分支删了，但目录删不掉：不能落 `worktree.removed`。
          return {
            merged: true,
            branch,
            directory,
            commit: "deadbeef",
            cleanup: "补删目录失败: EBUSY（锁文件）",
            removed: false,
          };
        }
        // 真实实现合并成功会顺手回收目录与分支，替身同样记账。
        removed.push(name);
        seen.delete(name);
        return { merged: true, branch, directory, commit: "deadbeef", cleanup: "已清理" };
      },
    };
    return { hooks, ensured, installed, removed, merges };
  };

  it("组派工把 worker 放进 .worktrees/<组键> 并先装依赖", async () => {
    const worktree = fakeWorktree();
    // worker 保持在跑：abort 不合并、也不删 worktree（现场留给人工看）。
    const { tools, spawnCwds } = await setup({
      worktree: worktree.hooks,
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planWithNotes([note("01")]);
    const text = textOf(
      await tools
        .get("orchestrator_command")
        ?.execute(
          "id",
          { plan: ref, notes: ["01"], message: "做 01" },
          undefined,
          undefined,
          ctx(root),
        ),
    );
    expect(text).toContain("worktree: note-01（wt/note-01）· 新建 · 依赖 13500ms");
    expect(text).toContain(`worker 的 cwd 是 ${root}/.worktrees/note-01`);
    expect(worktree.installed).toEqual([`${root}/.worktrees/note-01`]);
    // worker 的 cwd 真的是 worktree，Plan 仍是主工作区的绝对路径（由 lockedPlan/plan 决定）。
    expect(spawnCwds).toEqual([`${root}/.worktrees/note-01`]);
    // workers 清单展示 worktree 与分支。
    const list = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(list).toContain(`组键 note-01 · 现场 ${root}/.worktrees/note-01（存在）`);
    // abort 不删 worktree：现场留给合并或人工看。
    await tools
      .get("orchestrator_state")
      ?.execute("id", { op: "abort" }, undefined, undefined, ctx(root));
    expect(worktree.removed).toEqual([]);
  });

  it("复用已有现场时跳过 install", async () => {
    const worktree = fakeWorktree({ created: false });
    const { tools } = await setup({ worktree: worktree.hooks });
    const { root, ref } = await planWithNotes([note("02")]);
    const text = textOf(
      await tools
        .get("orchestrator_command")
        ?.execute("id", { plan: ref, notes: ["02"] }, undefined, undefined, ctx(root)),
    );
    expect(text).toContain("worktree: note-02（wt/note-02）· 复用现有现场");
    expect(worktree.installed).toEqual([]);
  });

  it("依赖装不上就中止派工，并把原因说清楚", async () => {
    const worktree = fakeWorktree({ installOk: false });
    const { tools, spawnCwds } = await setup({ worktree: worktree.hooks });
    const { root, ref } = await planWithNotes([note("03")]);
    await expect(
      tools
        .get("orchestrator_command")
        ?.execute(
          "id",
          { plan: ref, notes: ["03"], worktree: true },
          undefined,
          undefined,
          ctx(root),
        ),
    ).rejects.toThrow(/依赖安装失败.*ERR_PNPM_WORKSPACE_PKG_NOT_FOUND/u);
    // 没有起 worker：不许静默跳过测试。
    expect(spawnCwds).toEqual([]);
  });

  it("临时 worker 没有现场（worktree 开关已删）", async () => {
    const worktree = fakeWorktree();
    const { tools, spawnCwds } = await setup({ worktree: worktree.hooks });
    const { root } = await planArgs();
    const dispatch = tools.get("orchestrator_command");

    const plain = textOf(
      await dispatch?.execute("id", { message: "临时活" }, undefined, undefined, ctx(root)),
    );
    expect(plain).not.toContain("worktree:");
    // 临时 worker 没有 notes → 没有组键 → 不建现场、不装依赖。
    expect(worktree.ensured).toEqual([]);
    expect(worktree.installed).toEqual([]);
    expect(spawnCwds).toEqual([root]);
  });

  it("现场按组键命名：单 note / 组各自一个；Plan 级没有现场", async () => {
    const worktree = fakeWorktree();
    const { tools, spawnCwds, stateRoot } = await setup({ worktree: worktree.hooks });
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const dispatch = tools.get("orchestrator_command");
    const send = async (args: Record<string, unknown>) =>
      textOf(await dispatch?.execute("id", args, undefined, undefined, ctx(root)));

    const single = await send({ plan: ref, notes: ["01"], message: "做 01" });
    expect(single).toContain("worktree: note-01（wt/note-01）· 新建");
    await send({ plan: ref, notes: ["01", "02"], message: "做整组" });
    const planLevel = await send({ plan: ref, message: "Plan 级活" });

    expect(worktree.ensured).toEqual(["note-01", "grp-01-02"]);
    // Plan 级派工没有 notes → 没有组键 → 不建现场，仍在主工作区。
    expect(planLevel).not.toContain("worktree:");
    expect(spawnCwds).toEqual([`${root}/.worktrees/note-01`, `${root}/.worktrees/grp-01-02`, root]);
    // 账本里的 worker.spawned 也带上 worktree（投影 / 摘要靠它）。
    const { openLedger } = await import("./ledger.ts");
    const names = openLedger(stateRoot)
      .events()
      .filter((event) => event.type === "worker.spawned")
      .map((event) => (event.payload["worktree"] as { name?: string } | undefined)?.name);
    expect(names).toEqual(["note-01", "grp-01-02", undefined]);
  });

  it("同组共用现场：一次建、后续投递不碰现场", async () => {
    const worktree = fakeWorktree();
    const { tools, spawnCwds, spawnOptions } = await setup({
      worktree: worktree.hooks,
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planWithNotes([note("01", [], "in_progress"), note("02")]);
    const dispatch = tools.get("orchestrator_command");
    const send = async (args: Record<string, unknown>): Promise<string> =>
      textOf(await dispatch?.execute("id", args, undefined, undefined, ctx(root)));

    // 未分组的 note 第一次投递 → 自动成为单 note 组 [01] → 建现场 + 装依赖。
    const passed = await send({ plan: ref, kind: "pass", note: "01", message: "" });
    expect(passed).toContain("worktree: note-01（wt/note-01）· 新建 · 依赖 13500ms");
    expect(worktree.installed).toEqual([`${root}/.worktrees/note-01`]);
    expect(spawnCwds).toEqual([`${root}/.worktrees/note-01`]);
    expect(spawnOptions[0]?.sessionKey).toBeDefined();

    // 同一组再来 rework / answer / fact：命中 live 句柄，**不 ensure、不 install、不改 cwd**。
    const requests: Record<string, unknown>[] = [
      { plan: ref, kind: "rework", note: "01", message: "改一下" },
      { plan: ref, kind: "answer", note: "01", message: "按 A 做" },
      { plan: ref, kind: "fact", note: "01", message: "环境已经就绪" },
    ];
    for (const args of requests) {
      const text = await send({ ...args });
      expect(text).toContain(`cwd 未变：${root}/.worktrees/note-01`);
      expect(text).toContain(`已投递给 ${ref} 的 worker（组 [01]）`);
    }
    // 组键的现场只会在“新起 worker”时碰：这一轮一次都没再 ensure。
    expect(worktree.ensured).toEqual(["note-01"]);
    expect(worktree.installed).toEqual([`${root}/.worktrees/note-01`]);
    expect(spawnCwds).toEqual([`${root}/.worktrees/note-01`]);

    // 另一组（note 02）是另一个现场，各装一次。
    const worked = await send({ plan: ref, notes: ["02"], message: "做 02" });
    expect(worked).toContain("worktree: note-02（wt/note-02）· 新建");
    expect(worktree.installed).toEqual([
      `${root}/.worktrees/note-01`,
      `${root}/.worktrees/note-02`,
    ]);
    expect(spawnCwds[1]).toBe(`${root}/.worktrees/note-02`);
  });

  it("live worker 的追加输入不碰现场：cwd 不变、.worktrees 目录数不变、不 install", async () => {
    const worktree = fakeWorktree();
    const { tools, spawnCwds } = await setup({
      worktree: worktree.hooks,
      makeSession: () => fakeSession(true, false),
    });
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { root, ref } = await planWithNotes([note("08")]);
    const dispatch = tools.get("orchestrator_command");
    const workers = tools.get("orchestrator_state");
    const send = async (args: Record<string, unknown>) =>
      await dispatch?.execute("id", args, undefined, undefined, ctx(root));

    await send({ plan: ref, notes: ["08"], message: "做 08" });
    // 替身给的现场目录用 `/` 拼（与 `ensure` 的返回值一致），断言才对得上。
    const site = `${root}/.worktrees/note-08`;
    // 真实 ensure 会建出这个目录；替身不碰盘，这里手工摆出来当“现场已存在”。
    await fs.mkdir(site, { recursive: true });
    const dirsBefore = (await fs.readdir(path.join(root, ".worktrees"))).sort();
    expect(worktree.ensured).toEqual(["note-08"]);

    // 连发 steer / rework / answer / queue：全部命中 live 句柄。
    const requests: Record<string, unknown>[] = [
      { plan: ref, notes: ["08"], message: "顺手改一下", delivery: "steer" },
      { plan: ref, kind: "rework", note: "08", message: "测试没过" },
      { plan: ref, kind: "answer", note: "08", message: "按方案 A" },
      { plan: ref, notes: ["08"], message: "排在这轮后面", delivery: "queue" },
    ];
    for (const args of requests) {
      const result = await send(args);
      expect(textOf(result)).toContain(`cwd 未变：${site}`);
      expect((result as { details: { cwd?: string; started?: boolean } }).details).toMatchObject({
        started: false,
        cwd: site,
      });
    }
    // 一次 ensure / 一次 install 都没多出来，cwd 也没被切走。
    expect(worktree.ensured).toEqual(["note-08"]);
    expect(worktree.installed).toEqual([site]);
    expect(spawnCwds).toEqual([site]);
    expect((await fs.readdir(path.join(root, ".worktrees"))).sort()).toEqual(dirsBefore);

    // state 里也看得见 cwd（追加不改它）。
    const listed = textOf(
      await workers?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain(`cwd ${site}`);
  });

  it("对照组：worker 在主工作区、组现场已存在 → 追加仍用主工作区（不切 cwd）", async () => {
    const worktree = fakeWorktree({ created: false });
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { root, ref } = await planWithNotes([note("07")]);
    const { openLedger } = await import("./ledger.ts");
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-state-"));
    createdDirs.push(stateRoot);
    const planDirectory = path.join(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-分组",
    );
    // 今天的翻车场景：老账本里这一代没有 worktree 字段，cwd 就是主工作区。
    openLedger(stateRoot).append({
      type: "worker.spawned",
      payload: {
        worker: `${planDirectory}::07`,
        planRef: ref,
        kind: "plan",
        notes: ["07"],
        startedAt: new Date().toISOString(),
      },
    });
    // 组现场在盘上存在（上一代建好了，或别的路径建的）。
    const site = path.join(root, ".worktrees", "note-07");
    await fs.mkdir(site, { recursive: true });

    const { tools, spawnCwds } = await setup({
      stateDir: () => stateRoot,
      worktree: worktree.hooks,
      makeSession: () => fakeSession(true, false),
    });
    const workersAndResume = tools.get("orchestrator_state");
    // 恢复孤儿：没有 worktree 记录 → 回到主工作区。
    await workersAndResume?.execute(
      "id",
      { op: "resume", plan: ref },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawnCwds).toEqual([root]);

    // 追加输入命中 live 句柄：现场在也不 ensure，也不把 cwd 拉过去。
    const result = await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, kind: "rework", note: "07", message: "改一下" },
        undefined,
        undefined,
        ctx(root),
      );
    expect(textOf(result)).toContain(`cwd 未变：${root}`);
    expect((result as { details: { cwd?: string; started?: boolean } }).details).toMatchObject({
      started: false,
      cwd: root,
    });
    expect(worktree.ensured).toEqual([]);
    expect(worktree.installed).toEqual([]);
    expect(spawnCwds).toEqual([root]);
    expect(
      await fs.stat(site).then(
        () => true,
        () => false,
      ),
    ).toBe(true);

    const listed = textOf(
      await workersAndResume?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain(`cwd ${root}`);
  });

  it("abort 按组键：只摘目标组，别组继续跑、现场不动", async () => {
    const worktree = fakeWorktree();
    const { tools, stateRoot } = await setup({
      worktree: worktree.hooks,
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const path = await import("node:path");
    const directory = path.join(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-分组",
    );
    const dispatch = tools.get("orchestrator_command");
    const workers = tools.get("orchestrator_state");
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

    // 两组各自一个现场。
    expect(worktree.installed).toEqual([
      `${root}/.worktrees/note-01`,
      `${root}/.worktrees/note-02`,
    ]);

    const aborted = textOf(
      await workers?.execute(
        "id",
        { op: "abort", plan: ref, notes: ["01"] },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    expect(aborted).toContain("的组 [01] 的 worker（1 个）");
    expect(aborted).toContain("现场不动");

    // 账本里只有组 A 的 exit（组粒度的硬证据）。
    const { openLedger } = await import("./ledger.ts");
    const exits = openLedger(stateRoot)
      .events()
      .filter((event) => event.type === "worker.exit")
      .map((event) => event.payload["worker"]);
    expect(exits).toEqual([`${directory}::01`]);

    // 组 B 仍在跑，且现场没被动过。
    const listed = textOf(
      await workers?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("notes: 02");
    expect(listed).not.toContain("notes: 01");
    expect(listed).toContain(`组键 note-02 · 现场 ${root}/.worktrees/note-02（存在）`);
    expect(worktree.removed).toEqual([]);
  });

  it("abort 后同组再派：开新会话，现场目录不变、不再 install", async () => {
    const worktree = fakeWorktree();
    const { tools, spawnOptions } = await setup({
      worktree: worktree.hooks,
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planWithNotes([note("01")]);
    const dispatch = tools.get("orchestrator_command");
    const workers = tools.get("orchestrator_state");
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["01"], message: "做 01" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawnOptions[0]?.sessionKey).not.toContain("#");

    await workers?.execute(
      "id",
      { op: "abort", plan: ref, notes: ["01"] },
      undefined,
      undefined,
      ctx(root),
    );
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["01"], message: "接着做 01" },
      undefined,
      undefined,
      ctx(root),
    );
    // 新一代是**新**会话（旧上下文不接管），现场仍是同一个（只建过一次、只装过一次）。
    expect(spawnOptions[1]?.sessionKey).toContain("#");
    expect(worktree.ensured).toEqual(["note-01", "note-01"]);
    expect(worktree.installed).toEqual([`${root}/.worktrees/note-01`]);
  });

  it("settle 后代码自动 ff-only 合并并回收现场（组内 note 全 completed）", async () => {
    const worktree = fakeWorktree();
    const { tools, spawns, stateRoot } = await setup({ worktree: worktree.hooks });
    const { root, ref } = await planWithNotes([note("05", [], "completed")]);
    const dispatch = tools.get("orchestrator_command");
    const workers = tools.get("orchestrator_state");
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["05"], message: "做 05" },
      undefined,
      undefined,
      ctx(root),
    );

    const merged = await waitForEvent(stateRoot, "worktree.merged");
    expect(merged).toBeDefined();
    expect(merged?.payload).toMatchObject({
      key: "note-05",
      branch: "wt/note-05",
      commit: "deadbeef",
      cleanup: "已清理",
    });
    // 合并成功 = 目录与分支被回收，账本另落一条 removed。
    const removedEvent = await waitForEvent(stateRoot, "worktree.removed");
    expect(removedEvent?.payload).toMatchObject({ key: "note-05", reason: "merged" });
    expect(worktree.removed).toEqual(["note-05"]);

    const listed = textOf(
      await workers?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    // 合并成功 = 句柄收工，但现场那一行留在账本投影里（已回收，带上合并的 commit）。
    expect(listed).toContain("note-05 · wt/note-05 · 已回收（merged）");
    expect(listed).not.toContain("✗ 未合并");
    const details = (await workers?.execute(
      "id",
      { op: "list" },
      undefined,
      undefined,
      ctx(root),
    )) as {
      details: { worktrees: Array<{ key: string; phase: string; commit?: string }> };
    };
    const site = details.details.worktrees.find((item) => item.key === "note-05");
    expect(site).toMatchObject({ phase: "removed", commit: "deadbeef" });

    // 合并后现场被回收、句柄也收工（cwd 已不存在）：同一组再派 = 新 worker + 新现场。
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["05"], kind: "rework", message: "再改" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(worktree.ensured).toEqual(["note-05", "note-05"]);
    expect(worktree.installed).toEqual([
      `${root}/.worktrees/note-05`,
      `${root}/.worktrees/note-05`,
    ]);
    expect(spawns).toHaveLength(2);
  });

  it("不能 ff-only 时不合并、保留现场，摘要里标 ✗ 并给出原因", async () => {
    const worktree = fakeWorktree({ merged: false });
    const { tools, stateRoot } = await setup({ worktree: worktree.hooks });
    const { root, ref } = await planWithNotes([note("06", [], "completed")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["06"], message: "做 06" },
        undefined,
        undefined,
        ctx(root),
      );

    const blocked = await waitForEvent(stateRoot, "worker.merge_blocked");
    expect(blocked?.payload).toMatchObject({
      worktree: "note-06",
      branch: "wt/note-06",
      directory: `${root}/.worktrees/note-06`,
    });
    expect(String(blocked?.payload["reason"])).toContain("--ff-only");
    // 现场保留：不回收目录与分支。
    expect(worktree.removed).toEqual([]);

    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("✗ 未合并");
    expect(listed).toContain(`${root}/.worktrees/note-06`);
  });

  /** 一条等人验收的 note（`complete` 只接受 `waiting` + `needs=review`）。 */
  const reviewNote = (id: string): NoteNode => ({
    ...note(id),
    status: "waiting",
    needs: "review",
  });

  /**
   * 真 git 仓库 + 一个带 story / spec / notes 的 Plan。
   *
   * `complete` 会跑 Plan 校验（要求三个文件都在），所以不能只用 `planWithNotes`。
   * 现场回收必须验在真 git 上：目录、分支、主分支内容都要经得起 `git` 看。
   */
  const repoWithPlan = async (notes: NoteNode[]) => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { serializeDocument } = await import("./dag.ts");
    const { NOTES_FILE } = await import("./store.ts");
    const run = promisify(execFile);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-recycle-"));
    createdDirs.push(root);
    await run("git", ["init", "-q", "-b", "main"], { cwd: root });
    await run("git", ["config", "user.email", "t@example.com"], { cwd: root });
    await run("git", ["config", "user.name", "t"], { cwd: root });
    await run("git", ["config", "commit.gpgsign", "false"], { cwd: root });
    await fs.writeFile(path.join(root, "README.md"), "demo\n", "utf8");
    const name = "2026-11-07-回收";
    const directory = path.join(root, ".agents", "domains", "etf", "plans", "active", name);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, NOTES_FILE),
      serializeDocument({ version: 1, index: [], notes }),
      "utf8",
    );
    await fs.writeFile(
      path.join(directory, "story.md"),
      "# 用户故事\n\n组干完就回收现场。\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(directory, "spec.md"),
      "# 规格\n\n`complete` 即触发合并回收。\n",
      "utf8",
    );
    await run("git", ["add", "."], { cwd: root });
    await run("git", ["commit", "-qm", "plan"], { cwd: root });
    return { root, ref: `etf/active/${name}`, directory, run };
  };

  /** 真 git 的 worktree 钩子（`install` 只是 pnpm，测试里记一笔就跳过）。 */
  const realWorktree = async () => {
    const { ensureWorktree, mergeWorktree, removeWorktree } = await import("./worktree.ts");
    const installs: string[] = [];
    const hooks: import("./worktree.ts").WorktreeHooks = {
      ensure: ensureWorktree,
      install: async (directory) => {
        installs.push(directory);
        return { ok: true, command: "(test) 跳过 pnpm install", durationMs: 0 };
      },
      remove: removeWorktree,
      merge: mergeWorktree,
    };
    return { hooks, installs };
  };

  /** 路径比对：git / node 在 Windows 上一个给 `/` 一个给 `\`。 */
  const slash = (path: string): string => path.replaceAll("\\", "/");

  /** 账本里某类事件的条数（幂等断言用它）。 */
  const eventCount = async (stateRoot: string, type: string): Promise<number> => {
    const { openLedger } = await import("./ledger.ts");
    return openLedger(stateRoot)
      .events()
      .filter((event) => event.type === type).length;
  };

  it("complete 即触发：真 git 上 ff-only 合并 + 回收目录与分支", async () => {
    const { hooks } = await realWorktree();
    const { tools, stateRoot } = await setup({ worktree: hooks });
    const { root, ref, run } = await repoWithPlan([reviewNote("05")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["05"], message: "做 05" },
        undefined,
        undefined,
        ctx(root),
      );
    // worker 在隔离目录里提交一次（真 git）：合并后主工作区应该拿到这个文件。
    const site = `${root}/.worktrees/note-05`;
    await (
      await import("node:fs/promises")
    ).writeFile(`${site}/demo.txt`, "from worktree\n", "utf8");
    await run("git", ["add", "."], { cwd: site });
    await run("git", ["commit", "-qm", "worker"], { cwd: site });

    const completed = textOf(
      await tools
        .get("orchestrator_write")
        ?.execute(
          "id",
          { op: "complete", plan: ref, note: "05", evidence: ["真跑：complete 即回收"] },
          undefined,
          undefined,
          ctx(root),
        ),
    );
    expect(completed).toContain("已合并并回收现场 note-05");
    expect(await eventCount(stateRoot, "worktree.merged")).toBe(1);
    expect(await eventCount(stateRoot, "worktree.removed")).toBe(1);

    // 真 git：主分支拿到 worker 的文件，worktree 目录与分支都没了。
    const { stdout: content } = await run("git", ["show", "main:demo.txt"], { cwd: root });
    expect(content).toContain("from worktree");
    const { stdout: list } = await run("git", ["worktree", "list"], { cwd: root });
    expect(slash(list)).not.toContain(".worktrees/note-05");
    expect(existsSync(site)).toBe(false);
    // `git worktree remove` 不删未跟踪文件：`.worktrees` 里不能还留着旧名字。
    const leftovers = existsSync(`${root}/.worktrees`) ? readdirSync(`${root}/.worktrees`) : [];
    expect(leftovers).not.toContain("note-05");
    await expect(run("git", ["rev-parse", "wt/note-05"], { cwd: root })).rejects.toThrow();
  });

  it("合并成功但目录删不掉：不落 worktree.removed，改落 leftover 并在 state 标 ✗", async () => {
    const worktree = fakeWorktree({ leftover: true });
    const { tools, stateRoot } = await setup({ worktree: worktree.hooks });
    const { root, ref } = await planWithNotes([note("07", [], "completed")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["07"], message: "做 07" },
        undefined,
        undefined,
        ctx(root),
      );

    const leftover = await waitForEvent(stateRoot, "worktree.leftover");
    expect(leftover?.payload).toMatchObject({
      key: "note-07",
      directory: `${root}/.worktrees/note-07`,
    });
    // 账本不能谎报“已回收”：removed 一条都不许落。
    expect(await eventCount(stateRoot, "worktree.removed")).toBe(0);
    expect(worktree.removed).toEqual([]);
    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("✗ 现场残留");
    expect(listed).toContain(`${root}/.worktrees/note-07`);
  });

  it("组内还有未完成的 note：complete 不合并，现场照旧", async () => {
    const { hooks } = await realWorktree();
    const { tools, stateRoot } = await setup({ worktree: hooks });
    const { root, ref } = await repoWithPlan([reviewNote("05"), reviewNote("06")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["05", "06"], message: "两条一起做" },
        undefined,
        undefined,
        ctx(root),
      );
    const completed = textOf(
      await tools
        .get("orchestrator_write")
        ?.execute(
          "id",
          { op: "complete", plan: ref, note: "05", evidence: ["05 完成"] },
          undefined,
          undefined,
          ctx(root),
        ),
    );
    expect(completed).toContain("已完成 note 05");
    expect(completed).not.toContain("已合并");
    expect(completed).not.toContain("✗");
    expect(await eventCount(stateRoot, "worktree.merged")).toBe(0);
    expect(existsSync(`${root}/.worktrees/grp-05-06`)).toBe(true);
  });

  it("非 ff（主分支前进了）：complete 返回 ✗ + 现场保留 + merge_blocked", async () => {
    const { hooks } = await realWorktree();
    const { tools, stateRoot } = await setup({ worktree: hooks });
    const { root, ref, run } = await repoWithPlan([reviewNote("05")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["05"], message: "做 05" },
        undefined,
        undefined,
        ctx(root),
      );
    // 主分支自己往前走：合并只能被拒。
    await (await import("node:fs/promises")).writeFile(`${root}/main.txt`, "main\n", "utf8");
    await run("git", ["add", "."], { cwd: root });
    await run("git", ["commit", "-qm", "main 前进"], { cwd: root });

    const completed = textOf(
      await tools
        .get("orchestrator_write")
        ?.execute(
          "id",
          { op: "complete", plan: ref, note: "05", evidence: ["想合并但不 ff"] },
          undefined,
          undefined,
          ctx(root),
        ),
    );
    expect(completed).toContain("✗ 未合并");
    expect(slash(completed)).toContain(slash(`现场保留在 ${root}/.worktrees/note-05`));
    expect(await eventCount(stateRoot, "worker.merge_blocked")).toBe(1);
    expect(await eventCount(stateRoot, "worktree.merged")).toBe(0);
    expect(existsSync(`${root}/.worktrees/note-05`)).toBe(true);
    // 分支还在：现场原样留给 rework 或人。
    const { stdout: branch } = await run("git", ["rev-parse", "--verify", "wt/note-05"], {
      cwd: root,
    });
    expect(branch.trim()).not.toBe("");
  });

  it("幂等：complete 已回收，worker settle 再跑不重复合并", async () => {
    const { hooks } = await realWorktree();
    const sessions: FakeSession[] = [];
    const { tools, stateRoot } = await setup({
      worktree: hooks,
      makeSession: () => {
        // 不自动结束：让句柄在 `complete` 那一刻还活着，settle 留到后面手动触发。
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await repoWithPlan([reviewNote("05")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["05"], message: "做 05" },
        undefined,
        undefined,
        ctx(root),
      );
    const completed = textOf(
      await tools
        .get("orchestrator_write")
        ?.execute(
          "id",
          { op: "complete", plan: ref, note: "05", evidence: ["先 complete"] },
          undefined,
          undefined,
          ctx(root),
        ),
    );
    expect(completed).toContain("已合并并回收现场 note-05");
    expect(await eventCount(stateRoot, "worktree.merged")).toBe(1);

    // 句柄还活着：回收后必须已经收工（cwd 不存在了）。
    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("note-05 · wt/note-05 · 已回收（merged）");

    // 再触发一次 settle：现场已 removed，不许再合并、不许再落事件。
    sessions[0]?.finish?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await eventCount(stateRoot, "worktree.merged")).toBe(1);
    expect(await eventCount(stateRoot, "worktree.removed")).toBe(1);
  });

  it("回收后同组再派：重建现场（再落一条 worktree.created）", async () => {
    const { hooks, installs } = await realWorktree();
    const sessions: FakeSession[] = [];
    const { tools, stateRoot } = await setup({
      worktree: hooks,
      makeSession: () => {
        // 第一代自动结束（settle 不会触发合并：note 还没 completed）；第二代挂着不动。
        const session = sessions.length === 0 ? fakeSession() : fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await repoWithPlan([reviewNote("05")]);
    const dispatch = tools.get("orchestrator_command");
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["05"], message: "做 05" },
      undefined,
      undefined,
      ctx(root),
    );
    await tools
      .get("orchestrator_write")
      ?.execute(
        "id",
        { op: "complete", plan: ref, note: "05", evidence: ["完成并回收"] },
        undefined,
        undefined,
        ctx(root),
      );
    const site = `${root}/.worktrees/note-05`;
    expect(existsSync(site)).toBe(false);
    expect(await eventCount(stateRoot, "worktree.created")).toBe(1);

    // 同组再派（rework）：现场重建、再装一次依赖，不复用已删目录。
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["05"], kind: "rework", message: "再改" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(existsSync(site)).toBe(true);
    expect(await eventCount(stateRoot, "worktree.created")).toBe(2);
    expect(installs.map(slash)).toEqual([slash(site), slash(site)]);
  });

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
        .get("orchestrator_command")
        ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root)),
    );
    expect(text).toContain(`已起 worker 接手 ${ref}`);
    expect(text).toContain("kind: message");
    expect(text).toContain(
      "已记入账本：seq 2（事件账本不再推送 report，用 orchestrator_state 拉摘要）",
    );
    // worker 还没跑完（终态开关未触发），dispatch 已经返回。
    expect(sessions[0]?.finish).toBeDefined();
    sessions[0]?.finish?.();
  });

  it("delivery 默认 steer；显式 queue 才排队，空闲时 steer 退化", async () => {
    const busySessions: FakeSession[] = [];
    const busy = await setup({
      makeSession: () => {
        const session = fakeSession(false);
        busySessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    const dispatch = busy.tools.get("orchestrator_command");

    // 不传 delivery：默认 steer，插话进当前运行，不 followUp。
    const steered = await dispatch?.execute(
      "id",
      { plan: ref, message: "别动 register.ts" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(textOf(steered)).toContain("delivery: steer → steered");
    expect(textOf(steered)).toContain("已插话：下一次 LLM 调用前生效");
    expect((steered as { details: Record<string, unknown> }).details).toMatchObject({
      delivery: "steer",
      delivered: "steered",
      queued: true,
    });
    expect(busySessions[0]?.steers).toEqual(["别动 register.ts"]);
    expect(busySessions[0]?.followUps).toHaveLength(0);

    // 显式 delivery=queue：仍然排到当前轮之后，不打断。
    const queued = await dispatch?.execute(
      "id",
      { plan: ref, message: "做 01", delivery: "queue" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(textOf(queued)).toContain("delivery: queue → queued");
    expect(textOf(queued)).toContain("输入已排队：当前轮做完再消化");
    expect((queued as { details: Record<string, unknown> }).details).toMatchObject({
      delivery: "queue",
      delivered: "queued",
      queued: true,
    });
    expect(busySessions[0]?.followUps).toEqual(["做 01"]);
    expect(busySessions[0]?.steers).toEqual(["别动 register.ts"]);

    await expect(
      dispatch?.execute(
        "id",
        { plan: ref, message: "x", delivery: "abort" },
        undefined,
        undefined,
        ctx(root),
      ),
    ).rejects.toThrow(/delivery 必须是 queue \| steer/);

    // 空闲时默认的 steer 退化为直接开新一轮，返回值里注明。
    const idle = await setup({ makeSession: () => fakeSession(true) });
    const { root: idleRoot, ref: idleRef } = await planArgs("2026-11-07-空闲");
    const degenerate = await idle.tools
      .get("orchestrator_command")
      ?.execute("id", { plan: idleRef, message: "换方向" }, undefined, undefined, ctx(idleRoot));
    expect(textOf(degenerate)).toContain("delivery: steer → prompt");
    expect(textOf(degenerate)).toContain("插话退化为直接开新一轮");
    expect(idle.spawns[0]?.prompts).toEqual(["换方向"]);
    expect(idle.spawns[0]?.steers).toHaveLength(0);
  });

  it("workers 清单展示每个 worker 最近一次输入", async () => {
    const { tools, spawns } = await setup({ makeSession: () => fakeSession(false) });
    const { root, ref } = await planArgs();
    const dispatch = tools.get("orchestrator_command");
    await dispatch?.execute(
      "id",
      { plan: ref, message: "做 01", delivery: "queue" },
      undefined,
      undefined,
      ctx(root),
    );
    // 第二条不传 delivery：默认 steer。
    await dispatch?.execute(
      "id",
      { plan: ref, message: "  别动\nregister.ts  " },
      undefined,
      undefined,
      ctx(root),
    );
    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    // 最近一次输入：摘要（换行被折叠）+ 时刻 + 种类/方式。
    expect(listed).toContain("最近输入 刚刚 [message/steer] 别动 register.ts");
    expect(spawns[0]?.steers).toEqual(["  别动\nregister.ts  "]);
    expect(spawns[0]?.followUps).toEqual(["做 01"]);
  });

  it("临时 worker 只认 live 句柄：同 id 在跑就追加，abort 后再派是新 worker", async () => {
    const { tools, spawns, spawnOptions } = await setup({
      makeSession: () => fakeSession(true, false),
    });
    const { root } = await planArgs();
    const dispatch = tools.get("orchestrator_command");
    const workers = tools.get("orchestrator_state");

    await dispatch?.execute(
      "id",
      { message: "查 X", worker: "temp:7" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawnOptions[0]).toMatchObject({ temp: "7", sessionKey: "temp:7" });

    // 同 id 再派：句柄还在跑 → 追加给它，不再起新会话。
    await dispatch?.execute(
      "id",
      { message: "再看 Y", worker: "temp:7" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(1);

    // abort 后句柄没了：同 id 再派**不报错、不接管旧会话**，新建一个（会话键换一代）。
    await workers?.execute("id", { op: "abort", plan: "temp:7" }, undefined, undefined, ctx(root));
    await dispatch?.execute(
      "id",
      { message: "再来", worker: "temp:7" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(2);
    expect(spawnOptions[1]).toMatchObject({ temp: "7", sessionKey: "temp:7#2" });
  });

  it("同一个组键重派：上一代会话只当历史，换一代新开（不接管）", async () => {
    const { tools, spawns, spawnOptions } = await setup({
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planArgs();
    const dispatch = tools.get("orchestrator_command");
    const workers = tools.get("orchestrator_state");

    await dispatch?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    expect(spawnOptions[0]?.sessionKey).not.toContain("#");

    await workers?.execute("id", { op: "abort", plan: ref }, undefined, undefined, ctx(root));
    await dispatch?.execute(
      "id",
      { plan: ref, message: "重做 01" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(2);
    // 上一代会话只当历史（disk 上的 jsonl 不接管）：会话键换一代。
    expect(spawnOptions[1]?.sessionKey).toContain("#");
  });

  it("dispatch 返回会话文件路径，便于知道历史落在哪", async () => {
    const { tools } = await setup({
      makeSession: () => fakeSession(),
      sessionPath: "/tmp/sessions/worker-abc.jsonl",
    });
    const { root, ref } = await planArgs();
    const result = await tools
      .get("orchestrator_command")
      ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    expect(textOf(result)).toContain("会话：新建 jsonl /tmp/sessions/worker-abc.jsonl");
    expect((result as { details: Record<string, unknown> }).details).toMatchObject({
      sessionPath: "/tmp/sessions/worker-abc.jsonl",
      resumed: false,
    });
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
    const dispatch = tools.get("orchestrator_command");
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

  it("超时由后台 watchdog abort，并把判活事实记进 timeout 事件", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot } = await setup({
      timeoutMs: 10,
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    await tools
      .get("orchestrator_command")
      ?.execute("id", { plan: ref, message: "做 01", note: "01" }, undefined, undefined, ctx(root));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const timeouts = await timeoutEvents(stateRoot);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.payload).toMatchObject({ threshold: 10 });
    expect(timeouts[0]?.payload["lastProgressAt"]).toEqual(expect.any(String));
    expect(sessions[0]?.aborted).toBe(true);
    expect((await exitEvents(stateRoot)).map((event) => event.payload["reason"])).toContain(
      "timeout",
    );
    // 再等一会儿也不会重复落账。
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await timeoutEvents(stateRoot)).toHaveLength(1);
  });

  it("待消费再久也只是 ⚠ 疑似停滞：不杀、不落 timeout", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot } = await setup({
      // 软提示很小、终止阈值很大：只可能有 ⚠，不可能被中止。
      timeoutMs: 60_000,
      softStallMs: 20,
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    await tools
      .get("orchestrator_command")
      ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await timeoutEvents(stateRoot)).toHaveLength(0);
    expect(sessions[0]?.aborted).toBe(false);
    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("⚠ 疑似停滞");
    expect(listed).toContain("待消费 1");
  });

  /** 诊断 worker 的标准输出：结论 JSON 塞在 evidence[0] 里。 */
  const diagnosisAnswer = (
    suggestion: { adjust: string[]; retryMessage: string },
    cause = "卡在跑全量测试",
  ): WorkerReport => ({
    outcome: "done",
    note: "diagnose",
    summary: cause,
    evidence: [
      JSON.stringify({
        cause,
        evidence: ["最后一次 report 是 done", "jsonl 尾部停在 bash"],
        suggestion,
        confidence: 0.7,
      }),
    ],
  });

  it("超时后自动诊断并重派一代：timeout → timeout.diagnosed → retry.scheduled", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot, spawnOptions, diagnosisPrompts } = await setup({
      timeoutMs: 60,
      diagnosis: (call) =>
        call === 1
          ? diagnosisAnswer({ adjust: ["change-strategy"], retryMessage: "先跑单元测试再收尾" })
          : undefined,
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planWithNotes([note("01")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], note: "01", message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    // 证据包随诊断提示词一起发过去：note 摘要与阈值都在里面。
    const scheduled = await waitForEvent(stateRoot, "retry.scheduled");
    expect(scheduled).toBeDefined();
    expect(diagnosisPrompts[0]).toContain("正文 01");
    expect(diagnosisPrompts[0]).toContain('"threshold"');

    const { openLedger } = await import("./ledger.ts");
    const events = openLedger(stateRoot).events();
    const order = events
      .map((event) => event.type)
      .filter(
        (type) => type === "timeout" || type === "timeout.diagnosed" || type === "retry.scheduled",
      );
    expect(order).toEqual(["timeout", "timeout.diagnosed", "retry.scheduled"]);

    const diagnosed = events.find((event) => event.type === "timeout.diagnosed");
    expect(diagnosed?.payload).toMatchObject({
      note: "01",
      retryKey: "01",
      cause: "卡在跑全量测试",
      adjust: ["change-strategy"],
      confidence: 0.7,
      parsed: true,
    });
    expect(scheduled?.payload).toMatchObject({
      note: "01",
      retryKey: "01",
      attempt: 1,
      adjust: ["change-strategy"],
    });

    // 重派的是新一代会话（会话键带作废时刻），消息带上次原因与“不要重复”。
    const planSpawns = spawnOptions.filter(
      (option) => option.plan !== undefined || !(option.temp ?? "").startsWith("diag-"),
    );
    expect(planSpawns).toHaveLength(2);
    expect(planSpawns[1]?.sessionKey).not.toBe(planSpawns[0]?.sessionKey);
    const retried = sessions[sessions.length - 1];
    const prompt = retried?.prompts[0] ?? "";
    expect(prompt).toContain("[重试 1/2]");
    expect(prompt).toContain("卡在跑全量测试");
    expect(prompt).toContain("先跑单元测试再收尾");
    expect(prompt).toContain("不要重复已经完成的部分");
    retried?.finish?.();
  });

  it("连续两次超时后 retry.exhausted：不再重派，state 写明不再自动重试", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot, spawnOptions } = await setup({
      timeoutMs: 20,
      diagnosis: () => diagnosisAnswer({ adjust: ["narrow-scope"], retryMessage: "只改 pi 包" }),
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planWithNotes([note("01")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], note: "01", message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    const exhausted = await waitForEvent(stateRoot, "retry.exhausted", 3_000);
    expect(exhausted?.payload).toMatchObject({ note: "01", attempts: 2, reason: "exhausted" });

    const { openLedger } = await import("./ledger.ts");
    const events = openLedger(stateRoot).events();
    expect(events.filter((event) => event.type === "timeout")).toHaveLength(3);
    expect(events.filter((event) => event.type === "retry.scheduled")).toHaveLength(2);

    const planSpawns = spawnOptions.filter(
      (option) => option.plan !== undefined || !(option.temp ?? "").startsWith("diag-"),
    );
    expect(planSpawns).toHaveLength(3);
    // 再等一会儿也不会冒出第 3 次重派。
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(
      openLedger(stateRoot)
        .events()
        .filter((event) => event.type === "retry.scheduled"),
    ).toHaveLength(2);

    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("重试记录：01");
    expect(listed).toContain("✗ 不再自动重试（exhausted）");
  });

  it("诊断建议 needs-human 时不自动重试，转人工", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot, spawnOptions } = await setup({
      timeoutMs: 20,
      diagnosis: () => diagnosisAnswer({ adjust: ["needs-human"], retryMessage: "" }),
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planWithNotes([note("01")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], note: "01", message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    const exhausted = await waitForEvent(stateRoot, "retry.exhausted");
    expect(exhausted?.payload).toMatchObject({ reason: "needs-human", attempts: 0 });
    const { openLedger } = await import("./ledger.ts");
    expect(
      openLedger(stateRoot)
        .events()
        .filter((event) => event.type === "retry.scheduled"),
    ).toHaveLength(0);
    expect(spawnOptions.filter((option) => option.plan !== undefined)).toHaveLength(1);
  });

  it("诊断给不出可解析结论就不重试（parsed=false）", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot } = await setup({
      timeoutMs: 20,
      diagnosis: () => ({ outcome: "done", note: "diagnose", summary: "大概是环境问题" }),
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planWithNotes([note("01")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], note: "01", message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    const exhausted = await waitForEvent(stateRoot, "retry.exhausted");
    expect(exhausted?.payload).toMatchObject({ reason: "no-diagnosis" });
    const { openLedger } = await import("./ledger.ts");
    const diagnosed = openLedger(stateRoot)
      .events()
      .find((event) => event.type === "timeout.diagnosed");
    expect(diagnosed?.payload).toMatchObject({ parsed: false, adjust: [] });
  });

  it("临时 worker 超时不做诊断也不重派（没有 note 可重试）", async () => {
    const { tools, stateRoot, diagnosisCalls } = await setup({
      timeoutMs: 10,
      makeSession: () => fakeSession(true, false),
    });
    const { root } = await planArgs();
    await tools
      .get("orchestrator_command")
      ?.execute("id", { message: "查一下 X" }, undefined, undefined, ctx(root));
    await waitForEvent(stateRoot, "worker.exit");
    expect(diagnosisCalls()).toBe(0);
    const { openLedger } = await import("./ledger.ts");
    const types = openLedger(stateRoot)
      .events()
      .map((event) => event.type);
    expect(types).toContain("timeout");
    expect(types).not.toContain("timeout.diagnosed");
  });

  it("子 worker 带 parent 落账本，并在 state 里缩进列在父下面", async () => {
    const { tools, stateRoot } = await setup({ makeSession: () => fakeSession(true, false) });
    const { root, ref } = await planWithNotes([note("01")]);
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    const { openLedger } = await import("./ledger.ts");
    const { openProjection } = await import("./projection.ts");
    const ledger = openLedger(stateRoot);
    const parent = [...openProjection(ledger).state().workers.keys()][0] ?? "";
    const sub = `${parent}/sub:1`;
    ledger.append({
      type: "worker.spawned",
      payload: {
        worker: sub,
        planRef: sub,
        kind: "temp",
        parent,
        depth: 1,
        startedAt: new Date().toISOString(),
      },
    });
    ledger.append({
      type: "report.filed",
      payload: {
        worker: sub,
        parent,
        depth: 1,
        note: "01",
        outcome: "done",
        summary: "子任务查完了",
      },
    });
    const projected = openProjection(ledger).state().workers.get(sub);
    expect(projected).toMatchObject({ parent, depth: 1, status: "live" });

    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    const lines = listed.split("\n");
    const parentLine = lines.findIndex((line) => line.includes(ref));
    const subLine = lines.findIndex((line) => line.includes("/sub:1"));
    expect(subLine).toBeGreaterThan(parentLine);
    expect(lines[subLine]).toContain("↳");
    expect(lines[subLine]).toContain("sub ·");
  });

  it("ack 由 agent_start 写进账本：待消费归零", async () => {
    // 真 worker 的 agent_start 钩子会 append input.consumed；这里用账本端口模拟同一步。
    const { tools, stateRoot } = await setup({ makeSession: () => fakeSession(true, false) });
    const { root, ref } = await planArgs();
    await tools
      .get("orchestrator_command")
      ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    const { openLedger } = await import("./ledger.ts");
    const { openProjection } = await import("./projection.ts");
    const ledger = openLedger(stateRoot);
    const projection = openProjection(ledger);
    const key = [...projection.state().workers.keys()][0];
    expect(key).toBeDefined();
    const oldest = projection.oldestPendingOf(key ?? "");
    expect(oldest?.seq).toBeGreaterThan(0);
    ledger.append({
      type: "input.consumed",
      payload: { worker: key ?? "", seqOfSent: oldest?.seq ?? 0 },
    });
    expect(projection.pendingOf(key ?? "")).toHaveLength(0);
  });

  it("退出收尾前把 in_progress 的 note 记进账本（worker.suspended，可 resume）", async () => {
    // worker 随会话退出而消失，note 却还停在 in_progress：先留痕再摘句柄，note 不悬空。
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { stateDirectory } = await import("./errors.ts");
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bridge-shutdown-"));
    createdDirs.push(agentDir);
    const previous = process.env["PI_CODING_AGENT_DIR"];
    process.env["PI_CODING_AGENT_DIR"] = agentDir;
    try {
      const { tools, handlers } = await setup({
        makeSession: () => fakeSession(true, false),
        stateDir: () => stateDirectory(agentDir),
      });
      const { root, ref } = await planWithNotes([note("01", [], "in_progress"), note("02")]);
      await tools
        .get("orchestrator_command")
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
      const { openLedger } = await import("./ledger.ts");
      const suspended = openLedger(stateDirectory(agentDir))
        .events()
        .filter((event) => event.type === "worker.suspended");
      expect(suspended).toHaveLength(1);
      expect(suspended[0]?.payload["reason"]).toContain("session_shutdown");
      expect(suspended[0]?.payload["notes"]).toEqual([`${ref} · note 01`]);
      // 会话退出 ≠ 真结束：jsonl 还在，所以不写 worker.exit。
      expect(
        openLedger(stateDirectory(agentDir))
          .events()
          .filter((event) => event.type === "worker.exit"),
      ).toHaveLength(0);
      const { openProjection } = await import("./projection.ts");
      expect(
        openProjection(openLedger(stateDirectory(agentDir))).state().interrupted,
      ).toMatchObject({
        plans: [ref],
        notes: [`${ref} · note 01`],
      });
    } finally {
      if (previous === undefined) delete process.env["PI_CODING_AGENT_DIR"];
      else process.env["PI_CODING_AGENT_DIR"] = previous;
    }
  });

  it("重启后 resume 孤儿：复用同一份 jsonl、带 parent 的子任务写明丢失、重复调用幂等", async () => {
    const first = await setup({ makeSession: () => fakeSession(true, false) });
    const { root, ref } = await planWithNotes([note("01")]);
    await first.tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], note: "01", message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    const sessionKey = first.spawnOptions[0]?.sessionKey;
    expect(sessionKey).toBeDefined();

    // 手动记一个子 worker：它的会话不落盘，恢复时只能算“子任务丢失”。
    const { openLedger } = await import("./ledger.ts");
    const { openProjection } = await import("./projection.ts");
    const parentKey =
      [...openProjection(openLedger(first.stateRoot)).state().workers.keys()][0] ?? "";
    const subKey = `${parentKey}/sub:1`;
    openLedger(first.stateRoot).append({
      type: "worker.spawned",
      payload: {
        worker: subKey,
        planRef: subKey,
        kind: "temp",
        parent: parentKey,
        depth: 1,
        startedAt: new Date().toISOString(),
      },
    });
    // 模拟会话退出：写 suspended（不写 exit），jsonl 留在盘上。
    for (const handler of first.handlers.get("session_shutdown") ?? []) {
      await handler({ reason: "quit" });
    }
    const spawned = openLedger(first.stateRoot)
      .events()
      .find((event) => event.type === "worker.spawned");
    expect(spawned?.seq).toBeGreaterThan(0);

    // 第二次注册 = 重启后的同一个状态目录。
    const second = await setup({
      stateDir: () => first.stateRoot,
      makeSession: () => fakeSession(true, false),
    });
    const resume = second.tools.get("orchestrator_state");
    // 先列可恢复项（父 + 子），用户确认后再恢复。
    const listedBefore = textOf(
      await resume?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listedBefore).toContain("可恢复 worker（2");
    expect(listedBefore).toContain("⚠ 孤儿");
    expect(listedBefore).toContain("子 worker，由父重建");

    const resumed = await resume?.execute(
      "id",
      { op: "resume", plan: ref },
      undefined,
      undefined,
      ctx(root),
    );
    const resumedText = textOf(resumed);
    expect(resumedText).toContain("已恢复");
    expect(resumedText).toContain("同一份 jsonl");
    expect(resumedText).toContain("子任务丢失");
    expect((resumed as { details: Record<string, unknown> }).details).toMatchObject({
      orphans: 2,
    });
    // 恢复用的是原来的会话键（同一份 jsonl），消息极短且要求先核对工作区。
    expect(second.spawnOptions[0]?.sessionKey).toBe(sessionKey);
    expect(second.spawns[0]?.prompts[0]).toContain("继续上次未完成的工作");
    expect(second.spawns[0]?.prompts[0]).toContain("git status");

    // 账本：worker.resumed 带 resumeOf；子 worker 被记成 sub-lost。
    const events = openLedger(first.stateRoot).events();
    const resumedEvent = events.find((event) => event.type === "worker.resumed");
    expect(resumedEvent?.payload).toMatchObject({ worker: parentKey, resumeOf: spawned?.seq });
    const subExit = events.find(
      (event) => event.type === "worker.exit" && event.payload["worker"] === subKey,
    );
    expect(subExit?.payload["reason"]).toContain("sub-lost");

    // 幂等：再 resume 一次不再起会话（父已在进程内活着，不再是孤儿）。
    const before = second.spawnOptions.length;
    const again = textOf(
      await resume?.execute("id", { op: "resume", plan: ref }, undefined, undefined, ctx(root)),
    );
    expect(again).toContain("没有可恢复的孤儿 worker");
    expect(second.spawnOptions).toHaveLength(before);
  });

  it("resume 的 cwd：有现场回现场目录，Plan 级（无现场）回主工作区", async () => {
    const worktree = fakeWorktree({ created: false });
    const first = await setup({
      worktree: worktree.hooks,
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planWithNotes([note("01")]);
    await first.tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], note: "01", message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    expect(first.spawnCwds).toEqual([`${root}/.worktrees/note-01`]);
    for (const handler of first.handlers.get("session_shutdown") ?? []) {
      await handler({ reason: "quit" });
    }

    const second = await setup({
      stateDir: () => first.stateRoot,
      makeSession: () => fakeSession(true, false),
    });
    const text = textOf(
      await second.tools
        .get("orchestrator_state")
        ?.execute("id", { op: "resume", plan: ref }, undefined, undefined, ctx(root)),
    );
    expect(text).toContain("已恢复");
    // 有现场就回现场目录：隔离继续生效，Plan 仍锚定主工作区。
    expect(second.spawnCwds).toEqual([`${root}/.worktrees/note-01`]);
  });

  it("session_start（reload）自动恢复当前 Plan 的孤儿：无当前 Plan 不动、重复触发新增", async () => {
    // 一代：派工后会话退出 → 账本留下 worker.suspended。
    const first = await setup({
      worktree: fakeWorktree().hooks,
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planWithNotes([note("01")]);
    await first.tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: ref, notes: ["01"], message: "做 01" },
        undefined,
        undefined,
        ctx(root),
      );
    for (const handler of first.handlers.get("session_shutdown") ?? []) {
      await handler({ reason: "reload" });
    }
    const path = await import("node:path");
    const directory = path.join(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-分组",
    );
    const mode = { type: "custom", customType: MODE_ENTRY, data: { enabled: true } };
    const current = { type: "custom", customType: CURRENT_PLAN_ENTRY, data: { directory } };

    // 没有当前 Plan 记录：不猜 Plan、不做全局对账 —— 一个都不拉，仍列为手动可恢复。
    const blind = await setup({
      stateDir: () => first.stateRoot,
      worktree: fakeWorktree().hooks,
      makeSession: () => fakeSession(true, false),
    });
    blind.handle.start(sessionCtx(root, [mode]));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(blind.spawnOptions).toEqual([]);
    const stillOrphan = textOf(
      await blind.tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(stillOrphan).toContain("可恢复 worker");

    // reload 发 session_start：与 op=resume 同一个实现，自动把当前 Plan 的孤儿接回来。
    const revived = await setup({
      stateDir: () => first.stateRoot,
      worktree: fakeWorktree().hooks,
      makeSession: () => fakeSession(true, false),
    });
    revived.handle.start(sessionCtx(root, [mode, current]));
    await waitUntil(() => revived.spawnOptions.length > 0);
    expect(revived.spawnOptions).toHaveLength(1);
    // 同一份 jsonl（会话键没换一代），消息还是最短的“继续 + 先 git status 核对”。
    expect(revived.spawnOptions[0]?.sessionKey).toBe(first.spawnOptions[0]?.sessionKey);
    expect(revived.spawns[0]?.prompts[0]).toContain("git status");
    const listed = textOf(
      await revived.tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).not.toContain("可恢复 worker");

    // 再触发一次 session_start：已有 live 句柄 → 幂等，不新增会话、不重复落账。
    revived.handle.start(sessionCtx(root, [mode, current]));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(revived.spawnOptions).toHaveLength(1);
    const { openLedger } = await import("./ledger.ts");
    const resumedEvents = openLedger(first.stateRoot)
      .events()
      .filter((event) => event.type === "worker.resumed");
    expect(resumedEvents).toHaveLength(1);
  });

  it("resume 幂等键：同一代已经恢复过就跳过，不再起会话", async () => {
    const { tools, stateRoot, spawnOptions } = await setup();
    const { root, ref } = await planWithNotes([note("01")]);
    const path = await import("node:path");
    const directory = path.join(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-分组",
    );
    const key = `${directory}::01`;
    const { openLedger } = await import("./ledger.ts");
    const ledger = openLedger(stateRoot);
    const spawned = ledger.append({
      type: "worker.spawned",
      payload: { worker: key, planRef: ref, kind: "plan", sessionKey: key },
    });
    ledger.append({
      type: "worker.suspended",
      payload: { worker: key, reason: "crash" },
    });
    // 上一代已经恢复过一次（但进程又挂了）：幂等键还在账本里。
    ledger.append({
      type: "worker.resumed",
      idem: `resume:${key}:${spawned.seq}`,
      payload: { worker: key, resumeOf: spawned.seq },
    });

    const text = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "resume", plan: ref }, undefined, undefined, ctx(root)),
    );
    expect(text).toContain("跳过（已恢复过这一代）");
    expect(spawnOptions).toHaveLength(0);
    expect(ledger.events().filter((event) => event.type === "worker.resumed")).toHaveLength(1);
  });

  it("没有孤儿时 resume 直接说明（不无中生有起会话）", async () => {
    const { tools, stateRoot } = await setup();
    const { root } = await planArgs();
    const text = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "resume" }, undefined, undefined, ctx(root)),
    );
    expect(text).toContain("没有可恢复的孤儿 worker");
    const { openLedger } = await import("./ledger.ts");
    expect(
      openLedger(stateRoot)
        .events()
        .filter((event) => event.type === "worker.resumed"),
    ).toHaveLength(0);
  });

  it("worker 正常结束即收割，不会误报超时", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot } = await setup({
      timeoutMs: 10,
      makeSession: () => {
        const session = fakeSession();
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    await tools
      .get("orchestrator_command")
      ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(await timeoutEvents(stateRoot)).toHaveLength(0);
    expect(sessions[0]?.aborted).toBe(false);
  });

  it("上报即续期：窗口内报过进展就不 abort，随后静默到点才中止", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot, reports } = await setup({
      timeoutMs: 60,
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    await tools
      .get("orchestrator_command")
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
    expect(await timeoutEvents(stateRoot)).toHaveLength(0);
    expect(sessions[0]?.aborted).toBe(false);

    // 此后不再上报：续期后的窗口到点才中止。
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await timeoutEvents(stateRoot)).toHaveLength(1);
    expect(sessions[0]?.aborted).toBe(true);
  });

  it("超时后摘除句柄：worker 清单不再列出，再次派工起新 session", async () => {
    const sessions: FakeSession[] = [];
    const { tools, stateRoot, spawns, spawnOptions, diagnosisCalls } = await setup({
      timeoutMs: 20,
      makeSession: () => {
        const session = fakeSession(true, false);
        sessions.push(session);
        return session;
      },
    });
    const { root, ref } = await planArgs();
    const dispatch = tools.get("orchestrator_command");
    const workers = tools.get("orchestrator_state");
    await dispatch?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));
    expect(spawns).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await timeoutEvents(stateRoot)).toHaveLength(1);
    expect(sessions[0]?.aborted).toBe(true);
    expect(sessions[0]?.disposed).toBe(true);
    // 超时后代码会起一个只读诊断 worker（temp:diag-*）；它不算 Plan worker。
    expect(diagnosisCalls()).toBe(1);

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
    const planSpawns = spawnOptions.filter(
      (option) => option.plan !== undefined || !(option.temp ?? "").startsWith("diag-"),
    );
    expect(planSpawns).toHaveLength(2);
    const redone = spawns[spawns.length - 1];
    expect(redone?.prompts).toEqual(["重做 01"]);
    expect(redone).not.toBe(sessions[0]);
    redone?.finish?.();
  });

  it("没有 plan 时起临时 worker：键 temp:N，跑完即摘除", async () => {
    const { tools, spawns, spawnOptions } = await setup();
    const { root } = await planArgs();
    const dispatch = tools.get("orchestrator_command");
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
      .get("orchestrator_state")
      ?.execute("id", { op: "list" }, undefined, undefined, ctx(root))) as {
      content: { text: string }[];
    };
    expect(listed.content[0]?.text).toContain("没有 live worker");

    // 下一次临时派工拿新 id，不复用上一次的键。
    await dispatch?.execute("id", { message: "再看一下 Y" }, undefined, undefined, ctx(root));
    expect(spawnOptions[1]).toMatchObject({ temp: "2" });
  });

  it("临时 worker 超时同样 abort 并摘除句柄", async () => {
    const { tools, stateRoot, spawns } = await setup({
      timeoutMs: 10,
      makeSession: () => fakeSession(true, false),
    });
    const { root } = await planArgs();
    await tools
      .get("orchestrator_command")
      ?.execute("id", { message: "查一下 X" }, undefined, undefined, ctx(root));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const timeouts = await timeoutEvents(stateRoot);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.payload).toMatchObject({ worker: "temp:1" });
    expect(spawns[0]?.aborted).toBe(true);
    expect(spawns[0]?.disposed).toBe(true);
    const listed = (await tools
      .get("orchestrator_state")
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
      .get("orchestrator_command")
      ?.execute("id", { message: "查一下 X" }, undefined, undefined, ctx(root));
    const listed = (await tools
      .get("orchestrator_state")
      ?.execute("id", { op: "list" }, undefined, undefined, ctx(root))) as {
      content: { text: string }[];
    };
    expect(listed.content[0]?.text).toContain("temp:1 · temp ·");

    await tools
      .get("orchestrator_state")
      ?.execute("id", { op: "abort", plan: "temp:1" }, undefined, undefined, ctx(root));
    expect(spawns[0]?.aborted).toBe(true);
    expect(spawns[0]?.disposed).toBe(true);
  });

  it("同一 Plan 两组同时派工，第二个不等第一个", async () => {
    const { tools, spawns } = await setup({ makeSession: () => fakeSession(true, false) });
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const dispatch = tools.get("orchestrator_command");
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
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("notes: 01 ·");
    expect(listed).toContain("notes: 02 ·");
    for (const session of spawns) session.finish?.();
  });

  it("未分组的 note 直接 pass：自动以该 note 单独成组", async () => {
    const { tools, spawns } = await setup();
    const { root, ref } = await planWithNotes([note("07", [], "in_progress")]);
    const dispatch = tools.get("orchestrator_command");
    const first = textOf(
      await dispatch?.execute(
        "id",
        { plan: ref, kind: "pass", note: "07", message: "" },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    expect(first).toContain(`已起 worker 接手 ${ref} 的组 [07]`);
    expect(first).toContain("原本不属于任何组，已单独成组");
    expect(spawns).toHaveLength(1);
    expect(spawns[0]?.prompts[0]).toContain("[pass] note 07");

    // 同一 note 再来一次：复用同一个组（不新建会话）。
    const second = textOf(
      await dispatch?.execute(
        "id",
        { plan: ref, kind: "pass", note: "07", message: "" },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    expect(second).toContain(`已投递给 ${ref} 的 worker（组 [07]）`);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]?.prompts).toHaveLength(2);

    // 组已经出现在 live 清单里，后续 rework / answer 也能路由到它。
    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("notes: 07");
    await dispatch?.execute(
      "id",
      { plan: ref, kind: "rework", note: "07", message: "改一下" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(1);
    await dispatch?.execute(
      "id",
      { plan: ref, kind: "answer", note: "07", message: "按 A 做" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns).toHaveLength(1);
    for (const session of spawns) session.finish?.();
  });

  it("已有别的组时，未分组的 note 直接 pass 也单独成组（原“不知道投给哪一组”的坑）", async () => {
    const { tools, spawns } = await setup();
    // 01 已经成组；07 从未分组（就是 note 34 / 37 那种 plan 级 worker 跑出来的 note）。
    const { root, ref } = await planWithNotes([note("01"), note("07")]);
    const dispatch = tools.get("orchestrator_command");
    await dispatch?.execute(
      "id",
      { plan: ref, notes: ["01"], message: "做 01" },
      undefined,
      undefined,
      ctx(root),
    );
    const passed = textOf(
      await dispatch?.execute(
        "id",
        { plan: ref, kind: "pass", note: "07", message: "" },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    expect(passed).toContain(`已起 worker 接手 ${ref} 的组 [07]`);
    expect(passed).toContain("原本不属于任何组，已单独成组");
    expect(spawns).toHaveLength(2);
    // 原来的 01 组没被打扰，pass 落到新建的 07 组。
    expect(spawns[0]?.followUps).toHaveLength(0);
    expect(spawns[1]?.prompts[0]).toContain("[pass] note 07");

    // 再次 pass 同一个 note：复用 07 组，不再新建会话。
    const again = textOf(
      await dispatch?.execute(
        "id",
        { plan: ref, kind: "pass", note: "07", message: "" },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    expect(again).toContain(`已投递给 ${ref} 的 worker（组 [07]）`);
    expect(spawns).toHaveLength(2);
    for (const session of spawns) session.finish?.();
  });

  it("显式给 notes 时不拆成单 note 组", async () => {
    const { tools, spawns } = await setup();
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const dispatch = tools.get("orchestrator_command");
    const result = textOf(
      await dispatch?.execute(
        "id",
        { plan: ref, notes: ["01", "02"], kind: "pass", note: "02", message: "" },
        undefined,
        undefined,
        ctx(root),
      ),
    );
    expect(result).toContain(`已起 worker 接手 ${ref} 的组 [01, 02]`);
    expect(result).not.toContain("已单独成组");
    expect(spawns).toHaveLength(1);
    for (const session of spawns) session.finish?.();
  });

  it("pass 按 note 路由到含它的组；note 本身不存在才报错", async () => {
    const { tools, spawns } = await setup({ makeSession: () => fakeSession(true, false) });
    const { root, ref } = await planWithNotes([note("01"), note("02")]);
    const dispatch = tools.get("orchestrator_command");
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
    // 默认 steer：pass 插进 02 组当前运行，不去打扰 01 组。
    expect(spawns[0]?.steers).toHaveLength(0);
    expect(spawns[1]?.steers[0]).toContain("[pass] note 02");

    await expect(
      dispatch?.execute(
        "id",
        { plan: ref, kind: "pass", note: "99", message: "" },
        undefined,
        undefined,
        ctx(root),
      ),
    ).rejects.toThrow(/note 99 不在 .* 里/u);
    for (const session of spawns) session.finish?.();
  });

  it("组内有 blocked_by 依赖或 note 不存在时拒绝派工", async () => {
    const { tools, spawns } = await setup();
    const { root, ref } = await planWithNotes([note("01"), note("02", ["01"])]);
    const dispatch = tools.get("orchestrator_command");
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
    const { tools, stateRoot, reports } = await setup({
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
    const dispatch = tools.get("orchestrator_command");
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
    const first = await timeoutEvents(stateRoot);
    expect(first).toHaveLength(1);
    expect(first[0]?.payload["worker"]).toContain("02");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await timeoutEvents(stateRoot)).toHaveLength(2);
  });

  it("重复 dispatch 复用同一个 worker", async () => {
    const { tools, spawns } = await setup();
    const { root, ref } = await planArgs();
    const dispatch = tools.get("orchestrator_command");
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

    const workers = tools.get("orchestrator_state");
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
    const { root, ref } = await planWithNotes([note("01")], "2026-11-07-示例");
    const dispatch = tools.get("orchestrator_command");
    await dispatch?.execute(
      "id",
      { plan: ref, kind: "pass", note: "01", message: "" },
      undefined,
      undefined,
      ctx(root),
    );
    expect(spawns[0]?.prompts[0]).toContain("[pass] note 01");

    const workers = tools.get("orchestrator_state");
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

  it("report 只落账本、不注入；state 读一次即把未读清掉", async () => {
    const { tools, messages, reports, stateRoot } = await setup({
      makeSession: () => fakeSession(true, false),
    });
    const { root, ref } = await planArgs();
    const path = await import("node:path");
    const planDirectory = path.resolve(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-示例",
    );
    await tools
      .get("orchestrator_command")
      ?.execute("id", { plan: ref, message: "做 01" }, undefined, undefined, ctx(root));

    reports[0]?.({ outcome: "needs_review", note: "01", summary: "改完了", plan: planDirectory });
    // needs_review 是重要口径：推一条并开回合；未读计数仍然靠账本。
    expect(messages).toHaveLength(1);
    expect((messages[0] as { customType: string }).customType).toBe("orchestrator-important");
    const listed = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(listed).toContain("未读 report 1");
    expect(listed).toContain("未读 report：");
    expect(listed).toContain("改完了");

    // 读一次就把未读消费掉（落 state.pulled），跨重启仍然成立。
    const again = textOf(
      await tools
        .get("orchestrator_state")
        ?.execute("id", { op: "list" }, undefined, undefined, ctx(root)),
    );
    expect(again).toContain("未读 report 0");
    const { openLedger } = await import("./ledger.ts");
    expect(
      openLedger(stateRoot)
        .events()
        .map((event) => event.type),
    ).toContain("state.pulled");
  });
  it("命中过哪个 Plan 就记住哪个；清空上下文时种子直接恢复它，不问用户挑", async () => {
    const { tools, handlers, entries } = await setup({
      makeSession: () => fakeSession(true, false),
    });
    const { root } = await planArgs("2026-11-07-甲");
    await planArgs("2026-11-07-乙", root);
    // 多个 active 时也不该让用户挑：谁被命中过，谁就是“当前 Plan”。
    await tools
      .get("orchestrator_read")
      ?.execute(
        "id",
        { op: "index", plan: "etf/active/2026-11-07-乙" },
        undefined,
        undefined,
        ctx(root),
      );
    const recorded = entries.filter((entry) => entry.customType === "orchestrator-current-plan");
    expect(recorded).toHaveLength(1);
    const first = recorded[0] as { data: { directory: string } };
    expect(first.data.directory).toContain("2026-11-07-乙");

    const at = Date.now() - 1_000;
    const branch = [
      { type: "custom", customType: "orchestrator-mode", data: { enabled: true } },
      { type: "custom", customType: "orchestrator-reset", data: { at } },
      ...recorded.map((entry) => ({ type: "custom", ...entry })),
    ];
    const resetCtx = {
      cwd: root,
      sessionManager: { getBranch: () => branch },
    } as unknown as ExtensionContext;
    const resetContext = handlers.get("context")?.[0] as unknown as
      | ((event: { messages: unknown[] }, context: unknown) => Promise<unknown>)
      | undefined;
    const result = (await resetContext?.({ messages: [] }, resetCtx)) as
      | { messages: { content: { text: string }[] }[] }
      | undefined;
    const seed = result?.messages[0]?.content[0]?.text ?? "";
    expect(seed).toContain("恢复当前 Plan：etf/active/2026-11-07-乙");
    expect(seed).not.toContain("先问用户");
  });
});

describe("report 落账本", () => {
  const harness = async (digestWindowMs = 0) => {
    const local: ToolkitSettings = settings;
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
    const messages: unknown[] = [];
    /** 每次推送的 `sendMessage` 选项：验 `triggerTurn` / 投递方式。 */
    const sends: unknown[] = [];
    const pi = {
      registerTool: (tool: { name: string }) => tools.set(tool.name, tool as never),
      registerFlag: () => undefined,
      registerCommand: () => undefined,
      getFlag: () => undefined,
      appendEntry: () => undefined,
      getActiveTools: () => ["read"],
      setActiveTools: () => undefined,
      sendMessage: (message: unknown, options?: unknown) => {
        messages.push(message);
        sends.push(options);
      },
      on: () => undefined,
    } as unknown as ExtensionAPI;
    const captured: Array<(report: WorkerReport) => void> = [];
    const stateFs = await import("node:fs/promises");
    const stateOs = await import("node:os");
    const statePath = await import("node:path");
    const stateRoot = await stateFs.mkdtemp(statePath.join(stateOs.tmpdir(), "pi-bridge-state-"));
    createdDirs.push(stateRoot);
    const root = await stateFs.mkdtemp(statePath.join(stateOs.tmpdir(), "pi-bridge-report-"));
    createdDirs.push(root);
    const { registerOrchestrator } = await import("./register.ts");
    registerOrchestrator(pi, {
      settings: () => local,
      setAlways: () => undefined,
      stateDir: () => stateRoot,
      // Plan 派工默认建 worktree，这里给替身（临时目录不是 git 仓库）。
      worktree: silentWorktree(),
      digestWindowMs,
      spawn: async (spawnOptions) => {
        captured.push(spawnOptions.report);
        return { session: fakeSession(), resumed: false, dispose: () => undefined };
      },
    });
    const { emptyDocument, serializeDocument } = await import("./dag.ts");
    const { NOTES_FILE } = await import("./store.ts");
    const dir = statePath.join(
      root,
      ".agents",
      "domains",
      "etf",
      "plans",
      "active",
      "2026-11-07-示例",
    );
    await stateFs.mkdir(dir, { recursive: true });
    await stateFs.writeFile(
      statePath.join(dir, NOTES_FILE),
      serializeDocument(emptyDocument()),
      "utf8",
    );
    await tools
      .get("orchestrator_command")
      ?.execute(
        "id",
        { plan: "etf/active/2026-11-07-示例", message: "做 01" },
        undefined,
        undefined,
        { cwd: root } as unknown as ExtensionContext,
      );
    return { tools, messages, sends, captured, stateRoot, root, dir };
  };

  it("重要上报推送并开回合：账本里仍有 report.filed，摘要也能用 state 拉", async () => {
    const { tools, messages, captured, stateRoot, root } = await harness();
    captured[0]?.({
      outcome: "needs_review",
      note: "01",
      summary: "改完了",
      evidence: ["npm test: 430 passed"],
      plan: `${root}/.agents/domains/etf/plans/active/2026-11-07-示例`,
    } as WorkerReport);
    // needs_review 是重要口径：推一条 digest 并开回合。
    expect(messages).toHaveLength(1);
    expect((messages[0] as { customType: string }).customType).toBe("orchestrator-important");
    expect((messages[0] as { content: string }).content).toContain("改完了");

    const { openLedger } = await import("./ledger.ts");
    const filed = openLedger(stateRoot)
      .events()
      .filter((event) => event.type === "report.filed");
    expect(filed).toHaveLength(1);
    expect(filed[0]?.payload).toMatchObject({
      note: "01",
      outcome: "needs_review",
      summary: "改完了",
      evidence: ["npm test: 430 passed"],
    });

    const listed = (await tools
      .get("orchestrator_state")
      ?.execute("id", { op: "list" }, undefined, undefined, {
        cwd: root,
      } as ExtensionContext)) as { content: { text: string }[] } | undefined;
    const summary = listed?.content[0]?.text ?? "";
    expect(summary).toContain("needs_review · note 01");
    expect(summary).toContain("改完了");
  });

  it("超长 summary 落账时截断，并记 summaryTruncated / summaryLength（不存全文）", async () => {
    const { captured, stateRoot, root } = await harness();
    const long = "很长的结论".repeat(40);
    captured[0]?.({
      outcome: "needs_review",
      note: "01",
      summary: long,
      summaryTruncated: true,
      summaryLength: long.length,
      plan: `${root}/.agents/domains/etf/plans/active/2026-11-07-示例`,
    } as WorkerReport);
    const { openLedger } = await import("./ledger.ts");
    const filed = openLedger(stateRoot)
      .events()
      .find((event) => event.type === "report.filed");
    const summary = filed?.payload["summary"] as string;
    expect(summary.length).toBeLessThanOrEqual(120);
    expect(filed?.payload).toMatchObject({
      summaryTruncated: true,
      summaryLength: long.length,
    });
    // 不存全文：事件里除了截断后的摘要没有原始长文。
    expect(JSON.stringify(filed)).not.toContain(long);
  });

  it("正常长度的 summary 不带宽限字段", async () => {
    const { captured, stateRoot, root } = await harness();
    captured[0]?.({
      outcome: "needs_review",
      note: "01",
      summary: "改完了",
      plan: `${root}/.agents/domains/etf/plans/active/2026-11-07-示例`,
    } as WorkerReport);
    const { openLedger } = await import("./ledger.ts");
    const filed = openLedger(stateRoot)
      .events()
      .find((event) => event.type === "report.filed");
    expect(filed?.payload["summary"]).toBe("改完了");
    expect(filed?.payload["summaryTruncated"]).toBeUndefined();
    expect(filed?.payload["summaryLength"]).toBeUndefined();
  });

  it("done 也推送并开回合（旧口径「done 零推送」已废弃）", async () => {
    const { messages, sends, captured, stateRoot, root } = await harness();
    captured[0]?.({
      outcome: "done",
      note: "01",
      summary: "临时 worker 查完了",
      plan: `${root}/.agents/domains/etf/plans/active/2026-11-07-示例`,
    });
    // 临时 worker 没有 Plan，它的结论只有这一条 report：必须推到编排方。
    expect(messages).toHaveLength(1);
    expect((messages[0] as { customType: string }).customType).toBe("orchestrator-important");
    expect((messages[0] as { content: string }).content).toContain("[done]");
    expect((messages[0] as { content: string }).content).toContain("临时 worker 查完了");
    expect(sends[0]).toMatchObject({ triggerTurn: true, deliverAs: "steer" });
    const { openLedger } = await import("./ledger.ts");
    expect(
      openLedger(stateRoot)
        .events()
        .map((event) => event.type),
    ).toContain("report.filed");
  });

  it("5 秒窗口内多条 report（含 done）合并成一条 digest", async () => {
    const { messages, sends, captured, root } = await harness(40);
    const plan = `${root}/.agents/domains/etf/plans/active/2026-11-07-示例`;
    captured[0]?.({ outcome: "done", note: "01", summary: "A 段跑完", plan });
    captured[0]?.({ outcome: "done", note: "02", summary: "B 段跑完", plan });
    captured[0]?.({ outcome: "needs_review", note: "03", summary: "C 段待验", plan });
    // 窗口内不推：批量派工的 done 不能把上下文刷满。
    expect(messages).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(messages).toHaveLength(1);
    const content = (messages[0] as { content: string }).content;
    expect(content).toContain("[done]");
    expect(content).toContain("A 段跑完");
    expect(content).toContain("B 段跑完");
    expect(content).toContain("[needs_review]");
    expect(content.split(String.fromCharCode(10))).toHaveLength(3);
    expect(sends[0]).toMatchObject({ triggerTurn: true, deliverAs: "steer" });
  });
});
