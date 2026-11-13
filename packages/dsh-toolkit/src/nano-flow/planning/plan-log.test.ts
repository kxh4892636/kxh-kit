import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  adoptBinding,
  appendJsonLine,
  BINDINGS_FILE,
  buildTurnRecord,
  groupByTurn,
  inheritedPlanDirectory,
  isNanoFlowPreset,
  planLogPath,
  planRelativePath,
  pruneBindings,
  readBindings,
  resolvePlanDirectory,
  truncateText,
  writeBindings,
  type SessionEventLike,
} from "./plan-log.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-plan-log-"));
  roots.push(root);
  return root;
};

const event = (
  type: string,
  seq: number,
  data: Record<string, unknown>,
  time = 1_700_000_000_000,
): SessionEventLike => ({ type, seq, time, data });

const turnEvents = (turn: number, base: number, user: string, assistant: string) => [
  event("turn/start", base, { turn }),
  event("user/message", base + 1, { content: [{ type: "text", text: user }] }),
  event("assistant/message", base + 2, {
    turn,
    step: 1,
    message: { content: [{ type: "text", text: assistant }] },
    usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
  }),
  event("tool/call", base + 3, {
    turn,
    step: 1,
    callId: "call-1",
    name: "pwsh",
    arguments: '{"command":"ls"}',
  }),
  event("tool/result", base + 4, {
    turn,
    step: 1,
    message: {
      content: [{ type: "text", text: "file-a\nfile-b" }],
      isError: false,
      source: { kind: "tool", callId: "call-1" },
    },
  }),
  event("turn/end", base + 5, { turn, reason: { kind: "completed" } }),
];

describe("truncateText", () => {
  it("keeps short text and reports original bytes", () => {
    expect(truncateText("abc", 8)).toEqual({ text: "abc", truncated: false, bytes: 3 });
  });

  it("truncates long text and keeps the original byte count", () => {
    const result = truncateText("一二三四五六七八", 6); // 每个汉字 3 字节
    expect(result.truncated).toBe(true);
    expect(result.bytes).toBe(24);
    expect(Buffer.byteLength(result.text, "utf8")).toBeLessThanOrEqual(6);
  });
});

describe("inheritedPlanDirectory", () => {
  const table = {
    "session-old": {
      planPath: ".agents/domains/dsh/plans/active/x",
      cwd: "C:\\work",
      boundAt: "2026-11-08T00:00:00.000Z",
    },
  };

  it("returns the previous session's bound plan when it still exists", () => {
    expect(inheritedPlanDirectory(table, "session-old", "C:\\work", () => true)).toBe(
      join("C:\\work", ".agents/domains/dsh/plans/active/x"),
    );
  });

  it("ignores sessions without a binding and stale plan directories", () => {
    expect(
      inheritedPlanDirectory(table, "session-unknown", "C:\\work", () => true),
    ).toBeUndefined();
    expect(inheritedPlanDirectory(table, "session-old", "C:\\work", () => false)).toBeUndefined();
  });

  it("finds the plan in the new workspace after the old cwd disappeared", () => {
    const newPlan = join("D:\\work", ".agents/domains/dsh/plans/active/x");
    expect(inheritedPlanDirectory(table, "session-old", "D:\\work", (dir) => dir === newPlan)).toBe(
      newPlan,
    );
    // 新旧路径都不存在：继承不出 Plan，seed 退回「没有绑定线索」。
    expect(inheritedPlanDirectory(table, "session-old", "D:\\work", () => false)).toBeUndefined();
  });
});

describe("adoptBinding", () => {
  const table = {
    "session-old": {
      planPath: ".agents/domains/dsh/plans/active/x",
      cwd: "C:\\work",
      boundAt: "2026-11-08T00:00:00.000Z",
    },
  };

  it("writes the previous plan onto the new session and keeps the old entry", () => {
    const adopted = adoptBinding(
      table,
      "session-old",
      "session-new",
      "C:\\work",
      () => true,
      new Date("2026-11-13T00:00:00.000Z"),
    );
    expect(adopted?.planDirectory).toBe(join("C:\\work", ".agents/domains/dsh/plans/active/x"));
    expect(adopted?.table["session-new"]).toEqual({
      planPath: ".agents/domains/dsh/plans/active/x",
      cwd: "C:\\work",
      boundAt: "2026-11-13T00:00:00.000Z",
    });
    // 旧条目保留：轮转失败回落到旧会话时，它还得有绑定。
    expect(adopted?.table["session-old"]).toEqual(table["session-old"]);
  });

  it("adopts nothing when the previous session has no usable binding", () => {
    expect(adoptBinding(table, "session-unknown", "session-new", "C:\\work")).toBeUndefined();
    expect(
      adoptBinding(table, "session-old", "session-new", "C:\\work", () => false),
    ).toBeUndefined();
  });
});

describe("buildTurnRecord", () => {
  it("compacts one turn into a single record", () => {
    const record = buildTurnRecord({
      sessionId: "session-1",
      turn: 3,
      events: turnEvents(3, 100, "你好", "已完成"),
    });
    expect(record).toMatchObject({
      type: "turn",
      v: 1,
      sessionId: "session-1",
      turn: 3,
      user: "你好",
      assistant: "已完成",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      seq: [100, 105],
    });
    expect(record?.tools).toEqual([
      {
        name: "pwsh",
        args: '{"command":"ls"}',
        ok: true,
        result: "file-a\nfile-b",
        truncated: { args: false, result: false },
        resultBytes: 13,
      },
    ]);
  });

  it("marks failed tools and missing results", () => {
    const events = [
      event("turn/start", 10, { turn: 1 }),
      event("tool/call", 11, { turn: 1, step: 1, callId: "a", name: "read", arguments: "{}" }),
      event("tool/result", 12, {
        turn: 1,
        step: 1,
        message: {
          content: [{ type: "text", text: "boom" }],
          isError: true,
          source: { callId: "a" },
        },
      }),
      event("tool/call", 13, { turn: 1, step: 1, callId: "b", name: "edit", arguments: "{}" }),
      event("turn/end", 14, { turn: 1 }),
    ];
    const record = buildTurnRecord({ sessionId: "s", turn: 1, events });
    expect(record?.tools.map((tool) => [tool.name, tool.ok])).toEqual([
      ["read", false],
      ["edit", false],
    ]);
  });

  it("returns null when the turn carries nothing recognizable", () => {
    expect(buildTurnRecord({ sessionId: "s", turn: 1, events: [] })).toBeNull();
  });
});

describe("groupByTurn", () => {
  it("groups events by their turn field", () => {
    const groups = groupByTurn([
      event("turn/start", 1, { turn: 1 }),
      event("user/message", 2, { turn: 1, content: [] }),
      event("turn/start", 3, { turn: 2 }),
    ]);
    expect([...groups.keys()].sort((left, right) => left - right)).toEqual([1, 2]);
    expect(groups.get(1)).toHaveLength(2);
  });

  it("keeps a chunk that starts mid-turn attributed to the ongoing turn", () => {
    const groups = groupByTurn([event("user/message", 11, { content: [] })], 3);
    expect(groups.get(3)).toHaveLength(1);
  });
});

describe("isNanoFlowPreset", () => {
  it("detects the nano-flow preset selection", () => {
    expect(
      isNanoFlowPreset([event("agent-preset/selected", 1, { agentPreset: "nano-flow" })]),
    ).toBe(true);
    expect(isNanoFlowPreset([event("agent-preset/selected", 1, { agentPreset: "standard" })])).toBe(
      false,
    );
  });
});

describe("bindings", () => {
  it("round-trips the binding table", async () => {
    const root = await makeRoot();
    const file = join(root, "toolkit", BINDINGS_FILE);
    await writeBindings(file, {
      "session-1": { planPath: ".agents/domains/dsh/plans/active/p", cwd: root, boundAt: "t" },
    });
    const table = await readBindings(file);
    expect(table["session-1"]?.planPath).toBe(".agents/domains/dsh/plans/active/p");
  });

  it("returns an empty table for missing or broken files", async () => {
    const root = await makeRoot();
    expect(await readBindings(join(root, "missing.json"))).toEqual({});
    const broken = join(root, "broken.json");
    await writeFile(broken, "{not json", "utf8");
    expect(await readBindings(broken)).toEqual({});
  });
});

describe("paths", () => {
  it("resolves the log path under the bound plan", async () => {
    const root = await makeRoot();
    const binding = {
      planPath: ".agents/domains/dsh/plans/active/demo",
      cwd: root,
      boundAt: "t",
    };
    expect(planLogPath(join(root, binding.planPath))).toBe(
      join(root, binding.planPath, "log.jsonl"),
    );
    expect(planRelativePath(root, join(root, binding.planPath))).toBe(binding.planPath);
  });
});

describe("resolvePlanDirectory", () => {
  const binding = {
    planPath: ".agents/domains/dsh/plans/active/demo",
    cwd: "/old/work",
    boundAt: "t",
  };

  it("prefers the cwd recorded at bind time while it still exists", () => {
    const boundDirectory = join("/old/work", binding.planPath);
    expect(
      resolvePlanDirectory(binding, "/new/work", (directory) => directory === boundDirectory),
    ).toBe(boundDirectory);
  });

  it("falls back to the current workspace when the bound cwd is gone", () => {
    expect(resolvePlanDirectory(binding, "/new/work", () => false)).toBe(
      join("/new/work", binding.planPath),
    );
  });

  it("keeps an absolute planPath as is", () => {
    const absolute = { ...binding, planPath: "/abs/plan" };
    expect(resolvePlanDirectory(absolute, "/new/work", () => false)).toBe("/abs/plan");
  });

  it("ignores an empty bound cwd", () => {
    const empty = { ...binding, cwd: "" };
    expect(resolvePlanDirectory(empty, "/new/work", () => false)).toBe(
      join("/new/work", binding.planPath),
    );
  });
});

describe("pruneBindings", () => {
  it("drops entries whose session no longer exists", () => {
    const table = {
      kept: { planPath: "p", cwd: "/w", boundAt: "t" },
      ghost: { planPath: "p", cwd: "/w", boundAt: "t" },
    };
    expect(pruneBindings(table, new Set(["kept"]))).toEqual({ kept: table.kept });
  });
});

describe("appendJsonLine", () => {
  it("appends one JSON line per call", async () => {
    const root = await makeRoot();
    const file = join(root, "nested", "log.jsonl");
    await appendJsonLine(file, { a: 1 });
    await appendJsonLine(file, { a: 2 });
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
