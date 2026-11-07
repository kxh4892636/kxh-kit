import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SETTINGS, DEFAULT_TOOLS, type ToolkitSettings } from "../settings.ts";
import {
  applySessionEvent,
  attachInputAck,
  deliver,
  disposeEntry,
  INPUT_LOG_MAX,
  INPUT_STUCK_MS,
  pendingInputs,
  pendingLabel,
  pendingSummary,
  recordInput,
  type SessionLike,
  type WorkerEntry,
} from "./handles.ts";
import type { WorkerReport } from "./types.ts";

const settings: ToolkitSettings = {
  ...DEFAULT_SETTINGS,
  tools: { ...DEFAULT_TOOLS, orchestrator: true },
};

/** 能发会话事件的 session 替身：`emit` 就是宿主 `subscribe` 那条线。 */
interface AckSession extends SessionLike {
  isIdle: boolean;
  readonly prompts: string[];
  readonly followUps: string[];
  readonly steers: string[];
  readonly listeners: Set<(event: unknown) => void>;
  subscribed: number;
  unsubscribed: number;
  emit(event: unknown): void;
}

/**
 * 建一个 session 替身。
 * @param isIdle - 起始是否空闲。
 * @param withSubscribe - false 时模拟“宿主不给 subscribe”，用来验退化路径。
 * @param autoIdle - true 时 `prompt` 立刻回到空闲（不接受 `agent_start` 就能跑完的假象）。
 */
const ackSession = (isIdle = true, withSubscribe = true, autoIdle = false): AckSession => {
  const listeners = new Set<(event: unknown) => void>();
  const session: AckSession = {
    isIdle,
    prompts: [],
    followUps: [],
    steers: [],
    listeners,
    subscribed: 0,
    unsubscribed: 0,
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    async prompt(text) {
      session.prompts.push(text);
      session.isIdle = false;
      if (autoIdle) session.isIdle = true;
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
      session.isIdle = true;
    },
    dispose() {
      // 释放只清监听：台账与订阅状态由句柄层负责。
      listeners.clear();
    },
  };
  if (withSubscribe) {
    session.subscribe = (listener) => {
      listeners.add(listener);
      session.subscribed += 1;
      return () => {
        listeners.delete(listener);
        session.unsubscribed += 1;
      };
    };
  }
  return session;
};

const entry = (session: AckSession, plan = "/w/.agents/domains/x/plans/active/p"): WorkerEntry => ({
  planDirectory: plan,
  planRef: "x/active/p",
  startedAt: 1,
  released: new Set<string>(),
  session,
  inputs: 0,
});

/** `queue_update` 的样子：宿主在入队与出队时各发一次。 */
const queueUpdate = (steering: readonly string[], followUp: readonly string[]) => ({
  type: "queue_update",
  steering,
  followUp,
});

const createdDirs: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  const fs = await import("node:fs/promises");
  await Promise.all(
    createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("输入台账与待消费判定", () => {
  it("投递后待消费 1，agent_start 后归零（prompt 分支）", () => {
    const session = ackSession(true);
    const target = entry(session);

    deliver(target, "message", "做 note 42");
    expect(target.inputs).toBe(1);
    expect(target.inputLog).toHaveLength(1);
    expect(target.inputLog?.[0]).toMatchObject({ seq: 1, delivery: "prompt" });
    expect(pendingSummary(target).pending).toBe(1);
    expect(pendingLabel(pendingSummary(target))).toContain("待消费 1");

    // 宿主开跑：agent_start 就是那条 prompt 的消费点。
    session.emit({ type: "agent_start" });
    expect(pendingInputs(target)).toHaveLength(0);
    expect(pendingLabel(pendingSummary(target))).toBe("待消费 0");
    expect(target.inputLog?.[0]?.consumedAt).toBeTypeOf("number");
  });

  it("忙时排队：入队不消费，出队才消费（FIFO 精确）", () => {
    const session = ackSession(false);
    const target = entry(session);
    deliver(target, "message", "第一条");
    deliver(target, "pass", "", "07");

    // 宿主入队：队列变长不是消费。
    session.emit(queueUpdate([], ["第一条", "[pass] note 07 编排方已放行"]));
    expect(pendingSummary(target).pending).toBe(2);

    // 宿主把第一条拼进本轮（message_start 时从队列摘掉）→ 最老一条被消费。
    session.emit(queueUpdate([], ["[pass] note 07 编排方已放行"]));
    expect(pendingInputs(target)[0]?.text).toContain("[pass] note 07");
    expect(target.inputLog?.[0]?.consumedAt).toBeTypeOf("number");
    expect(target.inputLog?.[1]?.consumedAt).toBeUndefined();
    expect(pendingSummary(target).pending).toBe(1);

    session.emit(queueUpdate([], []));
    expect(pendingSummary(target).pending).toBe(0);
  });

  it("连投 3 条（1 prompt + 2 queued）按 FIFO 依次被标记", () => {
    const session = ackSession(true);
    const target = entry(session);
    deliver(target, "message", "开跑");
    session.isIdle = false;
    deliver(target, "fact", "另一组在改同一个文件");
    deliver(target, "message", "顺手把 43 也做了");

    expect(target.inputLog?.map((record) => record.delivery)).toEqual([
      "prompt",
      "queued",
      "queued",
    ]);

    session.emit({ type: "agent_start" });
    expect(pendingSummary(target).pending).toBe(2);
    expect(target.inputLog?.[0]?.consumedAt).toBeTypeOf("number");

    session.emit(queueUpdate([], ["a", "b"]));
    expect(pendingSummary(target).pending).toBe(2);
    session.emit(queueUpdate([], ["b"]));
    expect(target.inputLog?.[1]?.consumedAt).toBeTypeOf("number");
    expect(target.inputLog?.[2]?.consumedAt).toBeUndefined();
    session.emit(queueUpdate([], []));
    expect(pendingSummary(target).pending).toBe(0);
  });

  it("steered 按 steering 队列出队标记，不与 followUp 混算", () => {
    const session = ackSession(false);
    const target = entry(session);
    deliver(target, "message", "别动 register.ts", undefined, "steer");
    expect(target.inputLog?.[0]?.delivery).toBe("steered");

    session.emit(queueUpdate(["别动 register.ts"], []));
    expect(pendingSummary(target).pending).toBe(1);
    // followUp 出队不该消费 steering 那条。
    session.emit(queueUpdate(["别动 register.ts"], []));
    expect(pendingSummary(target).pending).toBe(1);

    session.emit(queueUpdate([], []));
    expect(pendingSummary(target).pending).toBe(0);
  });

  it("空闲时 steer 退化为 prompt：记 prompt 分支，agent_start 即消费", () => {
    const session = ackSession(true);
    const target = entry(session);
    const delivery = deliver(target, "message", "换方向", undefined, "steer");
    expect(delivery.delivered).toBe("prompt");
    expect(target.inputLog?.[0]?.delivery).toBe("prompt");
    session.emit({ type: "agent_start" });
    expect(pendingSummary(target).pending).toBe(0);
  });

  it("待消费久了显示 ⚠ 可能卡住；没到阈值不提示", () => {
    const session = ackSession(false);
    const target = entry(session);
    const sentAt = 1_000_000;
    recordInput(target, "message", "投了没人接", "queued", sentAt);

    const halfway = pendingSummary(target, sentAt + INPUT_STUCK_MS / 2);
    expect(halfway).toMatchObject({ pending: 1, stuck: false });
    expect(pendingLabel(halfway)).toContain("待消费 1");
    expect(pendingLabel(halfway)).not.toContain("⚠");

    const late = pendingSummary(target, sentAt + INPUT_STUCK_MS);
    expect(late.stuck).toBe(true);
    expect(pendingLabel(late)).toContain("⚠ 可能卡住");
    expect(pendingLabel(late)).toContain(`最老 ${INPUT_STUCK_MS / 60_000} 分钟`);
  });

  it("台账只保留最近 20 条，seq 继续单调递增", () => {
    const session = ackSession(false);
    const target = entry(session);
    for (let index = 0; index < INPUT_LOG_MAX + 5; index += 1) {
      deliver(target, "message", `第 ${index} 条`);
    }
    expect(target.inputLog).toHaveLength(INPUT_LOG_MAX);
    expect(target.inputLog?.[0]?.seq).toBe(6);
    expect(target.inputLog?.at(-1)?.seq).toBe(INPUT_LOG_MAX + 5);
    expect(target.inputs).toBe(INPUT_LOG_MAX + 5);
  });

  it("没有 subscribe 时退化成一次 agent_start 消费一条（近似）", () => {
    const session = ackSession(false, false);
    const target = entry(session);
    deliver(target, "message", "第一条");
    deliver(target, "message", "第二条");
    attachInputAck(target);
    expect(target.inputAck?.stop).toBeUndefined();

    // 没有 queue_update 可依据：只能按次数吃最老的一条，分不清谁真被消费。
    applySessionEvent(target, { type: "agent_start" });
    expect(target.inputLog?.[0]?.consumedAt).toBeTypeOf("number");
    expect(target.inputLog?.[1]?.consumedAt).toBeUndefined();
    applySessionEvent(target, { type: "agent_start" });
    expect(pendingSummary(target).pending).toBe(0);
  });

  it("订阅只挂一次，disposeEntry 退订阅", async () => {
    const session = ackSession(false);
    const target = entry(session);
    deliver(target, "message", "一");
    deliver(target, "message", "二");
    expect(session.subscribed).toBe(1);
    expect(session.listeners.size).toBe(1);

    await disposeEntry(target);
    expect(session.unsubscribed).toBe(1);
    expect(target.inputAck).toBeUndefined();
    // 退订阅之后事件不再推进状态（条目已被摘除）。
    session.emit(queueUpdate([], []));
    expect(pendingSummary(target).pending).toBe(2);
  });
});

describe("orchestrator_workers 展示待消费", () => {
  const textOf = (result: unknown): string =>
    (result as { content: { text: string }[] }).content[0]?.text ?? "";

  /** 造一个最小可解析的 Plan 目录。 */
  const makePlan = async (): Promise<{ root: string; ref: string }> => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { emptyDocument, serializeDocument } = await import("./dag.ts");
    const { NOTES_FILE } = await import("./store.ts");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-ack-"));
    createdDirs.push(root);
    const dir = path.join(root, ".agents", "domains", "etf", "plans", "active", "2026-11-07-示例");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, NOTES_FILE), serializeDocument(emptyDocument()), "utf8");
    return { root, ref: "etf/active/2026-11-07-示例" };
  };

  const setup = async (session: AckSession) => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-ack-state-"));
    createdDirs.push(stateRoot);
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
    const pi = {
      registerTool: (tool: { name: string }) => tools.set(tool.name, tool as never),
      registerFlag: () => undefined,
      registerCommand: () => undefined,
      getFlag: () => undefined,
      appendEntry: () => undefined,
      getActiveTools: () => ["read"],
      setActiveTools: () => undefined,
      sendMessage: () => undefined,
      on: () => undefined,
    } as unknown as ExtensionAPI;
    const { registerOrchestrator } = await import("./register.ts");
    registerOrchestrator(pi, {
      settings: () => settings,
      setAlways: () => undefined,
      stateDir: () => stateRoot,
      spawn: async (options): Promise<import("./spawn.ts").SpawnedWorker> => {
        void (options.report as (report: WorkerReport) => void);
        return { session, resumed: false, dispose: () => session.dispose() };
      },
    });
    return { tools };
  };

  const ctx = (cwd: string) => ({ cwd }) as unknown as ExtensionContext;

  it("投递后待消费 1，宿主消费后归零", async () => {
    const session = ackSession(false);
    const { tools } = await setup(session);
    const { root, ref } = await makePlan();
    const dispatch = tools.get("orchestrator_dispatch");

    await dispatch?.execute("id", { plan: ref, message: "做 42" }, undefined, undefined, ctx(root));
    const listed = textOf(
      await tools
        .get("orchestrator_workers")
        ?.execute("id", { op: "list" }, undefined, undefined, {}),
    );
    expect(listed).toContain("输入 1 次 · 待消费 1（最老");
    expect(listed).not.toContain("⚠");

    // 宿主入队（真实宿主在 `followUp` 里同步发），再把它拼进本轮（队列回到空）。
    session.emit(queueUpdate([], ["做 42"]));
    expect(
      textOf(
        await tools
          .get("orchestrator_workers")
          ?.execute("id", { op: "list" }, undefined, undefined, {}),
      ),
    ).toContain("待消费 1");
    session.emit(queueUpdate([], []));
    const after = textOf(
      await tools
        .get("orchestrator_workers")
        ?.execute("id", { op: "list" }, undefined, undefined, {}),
    );
    expect(after).toContain("输入 1 次 · 待消费 0");
    expect(after).not.toContain("待消费 1");
  });

  it("久未消费的条目在清单里带 ⚠ 可能卡住", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const started = new Date("2026-11-07T10:00:00.000Z");
    vi.setSystemTime(started);
    const session = ackSession(false);
    const { tools } = await setup(session);
    const { root, ref } = await makePlan();
    const dispatch = tools.get("orchestrator_dispatch");
    const list = async (): Promise<string> =>
      textOf(
        await tools
          .get("orchestrator_workers")
          ?.execute("id", { op: "list" }, undefined, undefined, {}),
      );

    await dispatch?.execute("id", { plan: ref, message: "做 42" }, undefined, undefined, ctx(root));
    const fresh = await list();
    expect(fresh).toContain("待消费 1（最老 1 秒）");
    expect(fresh).not.toContain("⚠");

    // 过了阈值还没有任何消费事件：清单要报可疑卡住。
    vi.setSystemTime(new Date(started.getTime() + INPUT_STUCK_MS));
    const stuck = await list();
    expect(stuck).toContain(`待消费 1（最老 ${INPUT_STUCK_MS / 60_000} 分钟） ⚠ 可能卡住`);
  });
});
