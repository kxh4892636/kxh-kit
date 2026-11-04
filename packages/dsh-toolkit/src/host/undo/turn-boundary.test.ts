import { describe, expect, it } from "vite-plus/test";
import { findUndoTarget, type UndoSessionEvent } from "./turn-boundary.js";

const events = (spec: readonly [string, unknown?][]): UndoSessionEvent[] =>
  spec.map(([type, data], seq) => (data === undefined ? { type, seq } : { type, seq, data }));

const userMessage = (text: string, kind = "user"): unknown => ({
  role: "user",
  content: [{ type: "text", text }],
  source: { kind },
});

describe("findUndoTarget", () => {
  it("returns undefined for an empty or turn-less log", () => {
    expect(findUndoTarget([])).toBeUndefined();
    expect(findUndoTarget(events([["session/title", {}]]))).toBeUndefined();
  });

  it("refuses to undo the first turn", () => {
    const log = events([
      ["turn/start", { turn: 1 }],
      ["user/message", userMessage("你好")],
      ["assistant/message", { message: { role: "assistant", content: [] } }],
      ["turn/end", { turn: 1 }],
    ]);
    expect(findUndoTarget(log)).toBeUndefined();
  });

  it("cuts one event before the last turn starts", () => {
    const log = events([
      ["turn/start", { turn: 1 }],
      ["user/message", userMessage("第一轮")],
      ["turn/end", { turn: 1 }],
      ["turn/start", { turn: 2 }],
      ["user/message", userMessage("第二轮")],
    ]);
    const target = findUndoTarget(log);
    expect(target).toEqual({ turn: 2, turnStartSeq: 3, cutSeq: 2, prompt: "第二轮" });
  });

  it("handles a running turn after several completed turns", () => {
    const log = events([
      ["turn/start", { turn: 1 }],
      ["user/message", userMessage("a")],
      ["turn/end", { turn: 1 }],
      ["turn/start", { turn: 2 }],
      ["user/message", userMessage("b")],
      ["turn/end", { turn: 2 }],
      ["turn/start", { turn: 3 }],
      ["user/message", userMessage("c")],
      ["step/start", { turn: 3, step: 1 }],
    ]);
    const target = findUndoTarget(log);
    expect(target?.turn).toBe(3);
    expect(target?.cutSeq).toBe(5);
    expect(target?.prompt).toBe("c");
  });

  it("joins multiple user-authored messages and skips injected context", () => {
    const log = events([
      ["turn/start", { turn: 1 }],
      ["user/message", userMessage("one")],
      ["turn/end", { turn: 1 }],
      ["turn/start", { turn: 2 }],
      ["user/message", userMessage("two")],
      [
        "user/message",
        {
          role: "user",
          content: [{ type: "text", text: "运行时上下文" }],
          source: { kind: "runtime-context" },
        },
      ],
      ["user/message", userMessage("steer")],
    ]);
    expect(findUndoTarget(log)?.prompt).toBe("two\n\nsteer");
  });

  it("ignores non-text parts and messages without a source", () => {
    const log = events([
      ["turn/start", { turn: 1 }],
      ["user/message", userMessage("x")],
      ["turn/end", { turn: 1 }],
      ["turn/start", { turn: 2 }],
      ["user/message", { content: [{ type: "image" }, { type: "text", text: "png" }] }],
    ]);
    expect(findUndoTarget(log)?.prompt).toBe("png");
  });

  it("keeps an empty prompt when the turn carries no user text", () => {
    const log = events([
      ["turn/start", { turn: 1 }],
      ["turn/end", { turn: 1 }],
      ["turn/start", { turn: 2 }],
    ]);
    expect(findUndoTarget(log)?.prompt).toBe("");
  });

  it("returns undefined when seq values are not contiguous with the array", () => {
    const log: UndoSessionEvent[] = [
      { type: "turn/start", seq: 10, data: { turn: 1 } },
      { type: "turn/end", seq: 11, data: { turn: 1 } },
      { type: "turn/start", seq: 12, data: { turn: 2 } },
    ];
    expect(findUndoTarget(log)).toBeUndefined();
  });

  it("skips queued-input bookkeeping so a fork does not inherit the undone prompt", () => {
    // 真机日志形态：提示词先进 inbox（agent/inbox/spliced），随后才是 turn/start。
    const log = events([
      ["turn/start", { turn: 1 }],
      ["user/message", userMessage("one")],
      ["turn/end", { turn: 1 }],
      ["agent/inbox/spliced", { target: "next-turn", inserted: [{ content: [] }] }],
      ["turn/start", { turn: 2 }],
      ["agent/inbox/spliced", { target: "next-turn", removedCount: 1, inserted: [] }],
      ["user/message", userMessage("two")],
    ]);
    const target = findUndoTarget(log);
    expect(target?.cutSeq).toBe(2);
    expect(target?.prompt).toBe("two");
  });

  it("drops every trailing inbox event before the target turn", () => {
    const log = events([
      ["turn/start", { turn: 1 }],
      ["turn/end", { turn: 1 }],
      ["agent/inbox/spliced", {}],
      ["agent/inbox/spliced", {}],
      ["turn/start", { turn: 2 }],
    ]);
    expect(findUndoTarget(log)?.cutSeq).toBe(1);
  });
});
