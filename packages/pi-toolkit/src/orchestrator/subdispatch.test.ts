import { describe, expect, it } from "vite-plus/test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import type { SessionLike } from "./handles.ts";
import { createSubDispatchTool, SUB_REPORT_TYPE, SUB_TIMEOUT_TYPE } from "./subdispatch.ts";
import type { SpawnWorkerOptions, SpawnedWorker } from "./spawn.ts";
import { workerSessionName } from "./spawn.ts";
import type { WorkerReport } from "./types.ts";

const settings = (workerTimeoutMs?: number): ToolkitSettings => ({
  ...DEFAULT_SETTINGS,
  tools: { ...DEFAULT_TOOLS, orchestrator: true },
  orchestrator:
    workerTimeoutMs === undefined
      ? DEFAULT_SETTINGS.orchestrator
      : { ...DEFAULT_SETTINGS.orchestrator, workerTimeoutMs },
});

interface FakeSession {
  isIdle: boolean;
  readonly prompts: string[];
  aborted: boolean;
  disposed: boolean;
  finish: (() => void) | undefined;
  prompt(text: string): Promise<void>;
  steer(text: string): Promise<unknown>;
  followUp(text: string): Promise<unknown>;
  waitForIdle(): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

/**
 * 可控的 session 替身：`autoFinish` 为 false 时 `prompt()` 挂在手动开关上，
 * 用来模拟「子 worker 还在跑」。
 * @param autoFinish - 是否让 `prompt()` 立刻结束。
 * @returns 会话替身。
 */
const fakeSession = (autoFinish = true): FakeSession => {
  const session: FakeSession = {
    isIdle: true,
    prompts: [],
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
    async followUp() {
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

interface Injected {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

interface Harness {
  readonly dispatch: { execute: (...args: unknown[]) => Promise<unknown> };
  /** 注入上级 worker 会话的消息。 */
  readonly injected: Injected[];
  /** 每次起 session 的参数。 */
  readonly spawns: SpawnWorkerOptions[];
  readonly sessions: FakeSession[];
}

/**
 * 搭一个上层 worker 的替身：`pi.sendMessage` 收集注入，`spawn` 换成替身会话。
 * @param options - 超时窗口与 session 行为。
 * @returns 工具与观测面。
 */
const setup = (options: { timeoutMs?: number; autoFinish?: boolean } = {}): Harness => {
  const injected: Injected[] = [];
  const spawns: SpawnWorkerOptions[] = [];
  const sessions: FakeSession[] = [];
  const pi = {
    registerTool: () => undefined,
    sendMessage: (message: Injected) => injected.push(message),
  } as unknown as ExtensionAPI;
  const tool = createSubDispatchTool({
    pi,
    parentRoute: "/w/.agents/domains/x/plans/active/p",
    parentRef: "x/active/p",
    depth: 0,
    settings: () => settings(options.timeoutMs),
    spawn: async (spawnOptions: SpawnWorkerOptions): Promise<SpawnedWorker> => {
      spawns.push(spawnOptions);
      const session = fakeSession(options.autoFinish ?? true);
      sessions.push(session);
      return { session: session as unknown as SessionLike, dispose: () => session.dispose() };
    },
  });
  return {
    dispatch: tool as unknown as { execute: (...args: unknown[]) => Promise<unknown> },
    injected,
    spawns,
    sessions,
  };
};

const ctx = { cwd: "/w" } as never;

const textOf = (result: unknown): string =>
  (result as { content: { text: string }[] }).content[0]?.text ?? "";

const flush = async (ms = 10): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe("worker 侧子派工", () => {
  it("一次调用起一个 depth 1 的子 worker，键是 <parent>/sub:<n>", async () => {
    const harness = setup();
    const first = textOf(
      await harness.dispatch.execute("id", { message: "查一下 X" }, undefined, undefined, ctx),
    );
    expect(first).toContain("sub:1");
    expect(first).toContain("depth 1");
    expect(harness.spawns).toHaveLength(1);
    expect(harness.spawns[0]?.depth).toBe(1);
    expect(harness.spawns[0]?.sub).toEqual({ parentRef: "x/active/p", index: 1 });
    expect(harness.spawns[0]?.plan).toBeUndefined();
    expect(harness.spawns[0]?.temp).toBeUndefined();
    expect(harness.spawns[0]?.cwd).toBe("/w");
    expect(harness.spawns[0]?.released.size).toBe(0);
    expect(harness.sessions[0]?.prompts).toEqual(["查一下 X"]);

    // 不复用：第二次就是 sub:2。
    const second = textOf(
      await harness.dispatch.execute("id", { message: "再看一下 Y" }, undefined, undefined, ctx),
    );
    expect(second).toContain("sub:2");
    expect(harness.spawns).toHaveLength(2);
  });

  it("session 名带上级标识：worker:<上级>/sub:<n>", () => {
    expect(workerSessionName({ sub: { parentRef: "x/active/p", index: 2 } })).toBe(
      "worker:x/active/p/sub:2",
    );
    expect(workerSessionName({ temp: "3" })).toBe("worker:temp:3");
    expect(
      workerSessionName({
        plan: { domain: "x", lifecycle: "active", name: "p", directory: "/d" },
      }),
    ).toBe("worker:x/p");
  });

  it("跑完即摘除：会话结束即 dispose", async () => {
    const harness = setup();
    await harness.dispatch.execute("id", { message: "查一下 X" }, undefined, undefined, ctx);
    await flush();
    expect(harness.sessions[0]?.disposed).toBe(true);
  });

  it("子 worker 的 report 注入上级 worker 的会话", async () => {
    const harness = setup({ autoFinish: false });
    await harness.dispatch.execute("id", { message: "查一下 X" }, undefined, undefined, ctx);
    const report: WorkerReport = {
      outcome: "needs_review",
      note: "-",
      summary: "查完了",
      plan: "ignored",
      at: "2026-11-07T00:00:00.000Z",
    };
    harness.spawns[0]?.report(report);
    expect(harness.injected).toHaveLength(1);
    const message = harness.injected[0];
    expect(message?.customType).toBe(SUB_REPORT_TYPE);
    expect(message?.content).toContain("needs_review");
    expect(message?.content).toContain("查完了");
    expect(message?.content).toContain("sub:1");
    expect(message?.details).toMatchObject({ sub: expect.stringContaining("sub:1"), depth: 1 });
  });

  it("任意 report 都续期：窗口内报过进展就不会被中止", async () => {
    const harness = setup({ timeoutMs: 60, autoFinish: false });
    await harness.dispatch.execute("id", { message: "查一下 X" }, undefined, undefined, ctx);
    await flush(30);
    harness.spawns[0]?.report({ outcome: "done", note: "-", summary: "还在跑" });
    // 原定 60ms 的窗口被续上，这时不该中止。
    await flush(45);
    expect(harness.sessions[0]?.aborted).toBe(false);
    expect(harness.injected.filter((m) => m.customType === SUB_TIMEOUT_TYPE)).toHaveLength(0);
    harness.sessions[0]?.finish?.();
  });

  it("超时只注入上级会话一次，并中止 + dispose", async () => {
    const harness = setup({ timeoutMs: 10, autoFinish: false });
    await harness.dispatch.execute("id", { message: "查一下 X" }, undefined, undefined, ctx);
    await flush(40);
    const timeouts = harness.injected.filter((m) => m.customType === SUB_TIMEOUT_TYPE);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.content).toContain("超时");
    expect(timeouts[0]?.content).toContain("sub:1");
    expect(timeouts[0]?.content).toContain("note 状态未改动");
    expect(harness.sessions[0]?.aborted).toBe(true);
    expect(harness.sessions[0]?.disposed).toBe(true);

    // 同一次派工只报一条。
    await flush(30);
    expect(harness.injected.filter((m) => m.customType === SUB_TIMEOUT_TYPE)).toHaveLength(1);
  });

  it("message 为空时拒绝派工，不起 session", async () => {
    const harness = setup();
    await expect(
      harness.dispatch.execute("id", { message: "  " }, undefined, undefined, ctx),
    ).rejects.toThrow(/message 必填/);
    expect(harness.spawns).toHaveLength(0);
  });
});
