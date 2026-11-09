import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createPlanLogService, type PersistenceLike } from "./plan-log-service.js";
import { planRelativePath, readBindings, writeBindings } from "./plan-log.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-plan-log-service-"));
  roots.push(root);
  return root;
};

const event = (
  type: string,
  seq: number,
  data: Record<string, unknown>,
  time = 1_700_000_000_000,
): { type: string; seq: number; time: number; data: Record<string, unknown> } => ({
  type,
  seq,
  time,
  data,
});

const turn = (n: number, base: number) => [
  event("turn/start", base, { turn: n }),
  event("user/message", base + 1, { content: [{ type: "text", text: `问题${n}` }] }),
  event("assistant/message", base + 2, {
    turn: n,
    step: 1,
    message: { content: [{ type: "text", text: `回答${n}` }] },
  }),
  event("turn/end", base + 3, { turn: n, reason: { kind: "completed" } }),
];

const nanoFlowToolCall = (turnNumber: number, seq: number, name = "nano_flow_check") =>
  event("tool/call", seq, {
    turn: turnNumber,
    step: 1,
    callId: `call-${name}`,
    name,
    arguments: "{}",
  });

const makePersistence = (events: { seq: number }[]): PersistenceLike => ({
  async open() {
    return {
      async read(offset = 0, length?: number) {
        return {
          events: events.filter((item) => item.seq >= offset).slice(0, length) as never,
        };
      },
      close() {},
    };
  },
});

const makeService = (root: string): ReturnType<typeof createPlanLogService> =>
  createPlanLogService({
    home: root,
    logger: { warn: () => {} },
  });

const bindingsFile = (root: string): string =>
  join(root, "toolkit", "nano-flow-plan-bindings.json");

/** 绑定时间早于测试事件（事件时间固定为 2023），让回填把全部轮次视为已绑定后产生。 */
const BOUND_AT = "2020-01-01T00:00:00.000Z";

const bindTo = async (root: string, plan: string): Promise<void> => {
  await writeBindings(bindingsFile(root), {
    s1: { planPath: planRelativePath(root, plan), cwd: root, boundAt: BOUND_AT },
  });
};

let planCounter = 0;
const planFor = (root: string): string => {
  planCounter += 1;
  return join(root, `.agents/domains/dsh/plans/active/2026-11-08-demo-${planCounter}`);
};

const session = (root: string, header: Record<string, unknown> = {}) => ({
  id: "s1",
  header: { cwd: root, ...header },
});

const turnsIn = async (plan: string): Promise<number[]> =>
  (await readFile(join(plan, "log.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; turn?: number })
    .filter((line) => line.type === "turn")
    .map((line) => line.turn as number);

describe("createPlanLogService", () => {
  it("backfills a pre-existing binding and appends new turns", async () => {
    const root = await makeRoot();
    const plan = planFor(root);
    const events = [...turn(1, 0), nanoFlowToolCall(2, 100)];
    const service = makeService(root);
    service.attach(makePersistence(events));
    await bindTo(root, plan);
    const file = join(plan, "log.jsonl");
    service.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(file, "utf8")).toContain('"turn":1');
    });
    events.push(...turn(2, 200));
    service.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(file, "utf8")).toContain('"turn":2');
    });
    const lines = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; turn?: number; user?: string });
    expect(lines.filter((line) => line.type === "session")).toHaveLength(1);
    expect(lines.filter((line) => line.type === "turn").map((line) => line.turn)).toEqual([1, 2]);
    expect(lines.find((line) => line.turn === 1)?.user).toBe("问题1");
    await service.dispose();
  });

  it("does not create a binding on its own", async () => {
    const root = await makeRoot();
    const plan = planFor(root);
    const preset = event("agent-preset/selected", 0, { agentPreset: "nano-flow" });
    const events = [
      ...turn(1, 1),
      event("tool/call", 100, {
        turn: 2,
        step: 1,
        callId: "call-ptc",
        name: "run_code",
        arguments: "{}",
      }),
    ];
    const service = makeService(root);
    service.attach(makePersistence([preset, ...events]));
    service.onEvent(session(root), preset);
    service.onEvent(session(root), events[events.length - 1]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await readBindings(bindingsFile(root))).toEqual({});
    await expect(readFile(join(plan, "log.jsonl"), "utf8")).rejects.toThrow();
    await service.dispose();
  });

  it("ignores sessions whose selected preset is not nano-flow", async () => {
    const root = await makeRoot();
    const plan = planFor(root);
    const preset = event("agent-preset/selected", 0, { agentPreset: "standard" });
    const events = [...turn(1, 1), nanoFlowToolCall(2, 100)];
    const service = makeService(root);
    service.attach(makePersistence([preset, ...events]));
    service.onEvent(session(root), preset);
    service.onEvent(session(root), events[events.length - 1]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await readBindings(bindingsFile(root))).toEqual({});
    await expect(readFile(join(plan, "log.jsonl"), "utf8")).rejects.toThrow();
    await service.dispose();
  });

  it("keeps the binding turn whole and does not backfill earlier turns", async () => {
    const root = await makeRoot();
    const plan = planFor(root);
    const preset = event("agent-preset/selected", -1, { agentPreset: "nano-flow" });
    const partial = [
      ...turn(1, 0),
      event("turn/start", 100, { turn: 2 }),
      event("user/message", 101, { content: [{ type: "text", text: "问题2" }] }),
      event("tool/call", 102, {
        turn: 2,
        step: 1,
        callId: "call-read",
        name: "read",
        arguments: "{}",
      }),
      event("tool/result", 103, {
        turn: 2,
        message: { content: [{ type: "text", text: "内容" }], source: { callId: "call-read" } },
      }),
      nanoFlowToolCall(2, 104, "nano_flow_bind"),
    ];
    const events = [preset, ...partial];
    const service = makeService(root);
    service.attach(makePersistence(events));
    service.onEvent(session(root), preset);
    service.onEvent(session(root), partial[partial.length - 1]);
    await bindTo(root, plan);
    events.push(
      event("tool/result", 105, {
        turn: 2,
        message: {
          content: [{ type: "text", text: "ok" }],
          source: { callId: "call-nano_flow_bind" },
        },
      }),
      event("assistant/message", 106, {
        turn: 2,
        step: 2,
        message: { content: [{ type: "text", text: "回答2" }] },
      }),
      event("turn/end", 107, { turn: 2, reason: { kind: "completed" } }),
    );
    service.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(join(plan, "log.jsonl"), "utf8")).toContain('"turn":2');
    });
    // 绑定发生在 turn 1 之后：turn 1 不属于该 Plan，只有整轮 turn 2 被写入。
    expect(await turnsIn(plan)).toEqual([2]);
    const lines = (await readFile(join(plan, "log.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const second = lines.find((line) => line["turn"] === 2) as
      | { user: string; assistant: string; tools: { name: string }[] }
      | undefined;
    expect(second?.user).toBe("问题2");
    expect(second?.assistant).toBe("回答2");
    expect(second?.tools.map((tool) => tool.name)).toEqual(["read", "nano_flow_bind"]);
    await service.dispose();
  });

  it("discards completed turns while unbound and starts logging after bind", async () => {
    const root = await makeRoot();
    const plan = planFor(root);
    const events = [...turn(1, 0)];
    const service = makeService(root);
    service.attach(makePersistence(events));
    service.onEvent(session(root), events[events.length - 1]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(readFile(join(plan, "log.jsonl"), "utf8")).rejects.toThrow();

    await bindTo(root, plan);
    events.push(...turn(2, 100));
    service.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(join(plan, "log.jsonl"), "utf8")).toContain('"turn":2');
    });
    expect(await turnsIn(plan)).toEqual([2]);
    await service.dispose();
  });

  it("does not duplicate turns when the service restarts", async () => {
    const root = await makeRoot();
    const plan = planFor(root);
    const events = [...turn(1, 0), nanoFlowToolCall(2, 100)];
    const file = join(plan, "log.jsonl");
    await bindTo(root, plan);
    const first = makeService(root);
    first.attach(makePersistence(events));
    first.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(file, "utf8")).toContain('"turn":1');
    });
    await first.dispose();

    const second = makeService(root);
    second.attach(makePersistence(events));
    second.onEvent(session(root), events[events.length - 1]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const lines = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .filter((line) => line !== "");
    expect(lines.filter((line) => line.includes('"type":"turn"'))).toHaveLength(1);
    await second.dispose();
  });

  it("skips subagent sessions", async () => {
    const root = await makeRoot();
    const plan = planFor(root);
    const events = [nanoFlowToolCall(1, 10)];
    const service = makeService(root);
    service.attach(makePersistence(events));
    service.onEvent(session(root, { origin: "subagent" }), events[0]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(readFile(join(plan, "log.jsonl"), "utf8")).rejects.toThrow();
    expect(await readBindings(bindingsFile(root))).toEqual({});
    await service.dispose();
  });

  it("moves later turns to the new plan after an explicit binding switch", async () => {
    const root = await makeRoot();
    const planA = planFor(root);
    const planB = planFor(root);
    const events = [...turn(1, 0)];
    const service = makeService(root);
    service.attach(makePersistence(events));

    await bindTo(root, planA);
    service.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(join(planA, "log.jsonl"), "utf8")).toContain('"turn":1');
    });

    events.push(...turn(2, 100));
    service.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(join(planA, "log.jsonl"), "utf8")).toContain('"turn":2');
    });

    await bindTo(root, planB);
    events.push(...turn(3, 200));
    service.onEvent(session(root), events[events.length - 1]);
    await vi.waitFor(async () => {
      expect(await readFile(join(planB, "log.jsonl"), "utf8")).toContain('"turn":3');
    });

    expect(await turnsIn(planA)).toEqual([1, 2]);
    expect(await turnsIn(planB)).toEqual([3]);
    await service.dispose();
  });
});
