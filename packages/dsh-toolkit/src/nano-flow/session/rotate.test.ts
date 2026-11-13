import { describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../../contract.js";
import {
  createRotation,
  LAST_OUTPUT_TAG,
  lastAssistantText,
  PRIOR_INPUT_TAG,
  selectedPreset,
  truncateTail,
  type PromptRequestLike,
  type RotationSession,
} from "./rotate.js";
import type { HostServices } from "./services.js";

type Pressure = {
  pressureTokens?: number;
  projectedTokens?: number;
  contextWindow?: number;
};

type EventLike = { type: string; data?: unknown };

const signal = new AbortController().signal;

/** 一轮事件：turn/start + 若干 assistant 消息 + turn/end。 */
const turnEvents = (
  turn: number,
  messages: readonly (readonly { type: string; text?: string }[])[],
): readonly EventLike[] => {
  const events: EventLike[] = [{ type: "turn/start", data: { turn } }];
  for (const content of messages) {
    events.push({ type: "assistant/message", data: { turn, message: { content } } });
  }
  events.push({ type: "turn/end", data: { turn, reason: { kind: "completed" } } });
  return events;
};

/** 会话形状：预设以日志里最后一条 `agent-preset/selected` 为准。 */
const sessionOf = (
  id: string,
  preset = "nano-flow",
  header: RotationSession["header"] = {},
  extra: readonly EventLike[] = [],
): RotationSession => ({
  id,
  header: { cwd: "C:\\work", ...header },
  snapshotEvents: () => [
    { type: "agent-preset/selected", data: { agentPreset: preset } },
    ...extra,
  ],
});

const makeHarness = (
  workspaceRegistry?: unknown,
  autoCheck?: (params: {
    sessionId: string;
    previousSessionId: string;
    workspace: string;
  }) => Promise<{ readonly text: string; readonly planReference?: string } | undefined>,
) => {
  let pressure: Pressure = { pressureTokens: 10, contextWindow: 1000 };
  const sessions = new Map<string, RotationSession>([
    ["session-1", sessionOf("session-1")],
    ["session-other", sessionOf("session-other", "standard")],
  ]);
  const create = vi.fn(async () => ({ sessionId: "session-new" }));
  const originalPrompt = vi.fn(async (_request: PromptRequestLike, _signal?: AbortSignal) => ({
    accepted: true,
  }));
  const controller = { create, prompt: originalPrompt };
  const warn = vi.fn();
  const services = {
    get: (name: string) => {
      if (name === "tokenMeter") {
        return { contextPressure: () => pressure };
      }
      if (name === "sessionController") return controller;
      if (name === "workspaceRegistry") return workspaceRegistry;
      return undefined;
    },
    logger: { warn },
  } as unknown as HostServices;
  const rotation = createRotation({
    services,
    config: { presetId: "nano-flow" },
    domainRoot: ".agents/domains",
    settings: () => ({ ...DEFAULT_NANO_FLOW_SETTINGS, rotateAt: 0.618 }),
    sessionOf: (id) => sessions.get(id),
    ...(autoCheck === undefined ? {} : { autoCheck }),
  });
  const dispose = rotation.attach();
  const request = (overrides: Partial<PromptRequestLike> = {}): PromptRequestLike => ({
    requestId: "request-1",
    sessionId: "session-1",
    mode: "queue",
    content: [{ type: "text", text: "用户消息" }],
    ...overrides,
  });
  const send = (overrides: Partial<PromptRequestLike> = {}): Promise<{ accepted: boolean }> =>
    controller.prompt(request(overrides), signal);
  return {
    controller,
    create,
    originalPrompt,
    services,
    warn,
    dispose,
    send,
    sessions,
    setPressure: (next: Pressure) => (pressure = next),
  };
};

const makeWorkspaceRegistry = () => {
  const ids = ["session-older", "session-1", "session-later"];
  const pinned = ["session-1"];
  const record = {
    get sessionIds() {
      return [...ids];
    },
    attachSession: vi.fn(async (sessionId: string) => {
      if (!ids.includes(sessionId)) ids.unshift(sessionId);
    }),
    insertSessionBefore: vi.fn(async (sessionId: string, beforeSessionId?: string) => {
      const without = ids.filter((id) => id !== sessionId);
      const at = beforeSessionId === undefined ? without.length : without.indexOf(beforeSessionId);
      const next = [...without.slice(0, at), sessionId, ...without.slice(at)];
      ids.splice(0, ids.length, ...next);
    }),
    detachSession: vi.fn(async (sessionId: string) => {
      const at = ids.indexOf(sessionId);
      if (at >= 0) ids.splice(at, 1);
    }),
  };
  const registry = {
    list: () => [record],
    archiveSession: vi.fn(async () => {}),
    unarchiveSession: vi.fn(async () => {}),
    pinnedSessionIds: pinned,
    pinSession: vi.fn(async (sessionId: string) => {
      if (!pinned.includes(sessionId)) pinned.unshift(sessionId);
    }),
    unpinSession: vi.fn(async (sessionId: string) => {
      const at = pinned.indexOf(sessionId);
      if (at >= 0) pinned.splice(at, 1);
    }),
  };
  return { registry, record, ids, pinned };
};

const textsOf = (request: PromptRequestLike | undefined): readonly string[] =>
  (request?.content ?? []).map((block) => String(block["text"]));

describe("selectedPreset", () => {
  it("以日志里最后一条预设选择为准，而不是 live header", () => {
    const session: RotationSession = {
      id: "session-1",
      header: { agentPreset: "standard" },
      snapshotEvents: () => [
        { type: "agent-preset/selected", data: { agentPreset: "nano-flow" } },
        { type: "turn/start" },
      ],
    };
    expect(selectedPreset(session)).toBe("nano-flow");
  });

  it("没有事件时退回 header，两者都没有时 undefined", () => {
    expect(selectedPreset({ id: "a", header: { agentPreset: "nano-flow" } })).toBe("nano-flow");
    expect(selectedPreset({ id: "a" })).toBeUndefined();
  });
});

describe("lastAssistantText", () => {
  it("取最后一个已结束轮里最后一条含文本的 assistant 消息", () => {
    const session = sessionOf("session-1", "nano-flow", {}, [
      ...turnEvents(1, [[{ type: "text", text: "第一轮结论" }]]),
      ...turnEvents(2, [
        [{ type: "reasoning", text: "内部推理" }],
        [{ type: "text", text: "第二轮中间文本" }],
        [{ type: "text", text: "第二轮最终答复" }],
      ]),
    ]);
    expect(lastAssistantText(session)).toBe("第二轮最终答复");
  });

  it("没有已结束轮或没有文本时为 undefined", () => {
    expect(lastAssistantText(sessionOf("session-1"))).toBeUndefined();
    const pendingOnly = sessionOf("session-1", "nano-flow", {}, [
      { type: "turn/start", data: { turn: 1 } },
    ]);
    expect(lastAssistantText(pendingOnly)).toBeUndefined();
  });

  it("超长输出保尾并标注截断字节数", () => {
    const long = "甲".repeat(5000);
    const clipped = lastAssistantText(
      sessionOf("session-1", "nano-flow", {}, turnEvents(1, [[{ type: "text", text: long }]])),
    );
    expect(clipped).toBeDefined();
    expect(String(clipped).startsWith("…（前 ")).toBe(true);
    expect(String(clipped).endsWith("甲")).toBe(true);
    expect(String(clipped)).not.toContain("\uFFFD");
  });
});

describe("truncateTail", () => {
  it("未超过上限时原样返回", () => {
    expect(truncateTail("短文本", 100)).toBe("短文本");
  });

  it("超过上限时保留尾部", () => {
    const out = truncateTail("abcdef", 3);
    expect(out.endsWith("def")).toBe(true);
    expect(out).toContain("已截断");
  });

  it("多字节切口不残留替换字符", () => {
    const out = truncateTail("甲".repeat(4000), 1000);
    expect(out).not.toContain("\uFFFD");
    expect(out).toContain("已截断");
  });
});

describe("attachRotation", () => {
  it("delegates to the old session while below the threshold", async () => {
    const harness = makeHarness();
    await harness.send();
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.originalPrompt).toHaveBeenCalledTimes(1);
    expect(harness.originalPrompt.mock.calls[0]?.[0].sessionId).toBe("session-1");
  });

  it("redirects the user prompt to a new session with the seed, then the wrapped user input", async () => {
    const harness = makeHarness();
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    expect(harness.create).toHaveBeenCalledTimes(1);
    const redirected = harness.originalPrompt.mock.calls[0]?.[0];
    expect(redirected?.sessionId).toBe("session-new");
    expect(redirected?.mode).toBe("queue");
    expect(redirected?.content[0]).toMatchObject({ type: "text" });
    expect(String(redirected?.content[0]?.["text"])).toContain("只读报告");
    const texts = textsOf(redirected);
    expect(texts).toContain("用户消息");
    expect(texts).toContain(`<${PRIOR_INPUT_TAG}>`);
    expect(texts.at(-1)).toBe(`</${PRIOR_INPUT_TAG}>`);
    expect(texts.at(-2)).toBe("用户消息");
    expect(harness.originalPrompt.mock.calls.some(([item]) => item.sessionId === "session-1")).toBe(
      false,
    );
  });

  it("keeps non-text blocks inside the wrapped user input", async () => {
    const harness = makeHarness();
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send({
      content: [
        { type: "text", text: "看这张图" },
        { type: "image", source: { kind: "path", path: "a.png" } },
      ],
    });
    const redirected = harness.originalPrompt.mock.calls[0]?.[0];
    expect(redirected?.content.map((block) => block.type)).toEqual([
      "text",
      "text",
      "text",
      "text",
      "image",
      "text",
    ]);
    expect(redirected?.content[2]).toMatchObject({ type: "text", text: `<${PRIOR_INPUT_TAG}>` });
    expect(redirected?.content[4]).toMatchObject({ type: "image" });
    expect(redirected?.content.at(-1)).toMatchObject({
      type: "text",
      text: `</${PRIOR_INPUT_TAG}>`,
    });
  });

  it("appends the last turn's assistant output to the end of the seed", async () => {
    const harness = makeHarness();
    harness.sessions.set(
      "session-1",
      sessionOf(
        "session-1",
        "nano-flow",
        {},
        turnEvents(1, [[{ type: "text", text: "上一轮结论" }]]),
      ),
    );
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    const redirected = harness.originalPrompt.mock.calls[0]?.[0];
    const seed = String(redirected?.content[0]?.["text"]);
    expect(seed).toContain(`<${LAST_OUTPUT_TAG}>`);
    expect(seed).toContain("上一轮结论");
    expect(seed.trimEnd().endsWith(`</${LAST_OUTPUT_TAG}>`)).toBe(true);
    // 输出块之后才是用户原文，两者一起落在消息最末。
    const texts = textsOf(redirected);
    expect(texts.at(-1)).toBe(`</${PRIOR_INPUT_TAG}>`);
  });

  it("omits the output block when the old session has no completed turn", async () => {
    const harness = makeHarness();
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    const seed = String(harness.originalPrompt.mock.calls[0]?.[0].content[0]?.["text"]);
    expect(seed).not.toContain(LAST_OUTPUT_TAG);
  });

  it("only redirects once, and only for Nano Flow queue prompts", async () => {
    const harness = makeHarness();
    harness.setPressure({ pressureTokens: 700, contextWindow: 1000 });
    await harness.send({ sessionId: "session-other" });
    await harness.send({ sessionId: "session-unknown" });
    await harness.send({ mode: "steer" });
    expect(harness.create).not.toHaveBeenCalled();

    await harness.send();
    await harness.send();
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.originalPrompt).toHaveBeenCalledTimes(5);
  });

  it("leaves subagent sessions alone", async () => {
    const harness = makeHarness();
    harness.sessions.set("session-1", sessionOf("session-1", "nano-flow", { origin: "subagent" }));
    harness.setPressure({ pressureTokens: 700, contextWindow: 1000 });
    await harness.send();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("falls back to the old session when the redirected prompt fails", async () => {
    const harness = makeHarness();
    harness.setPressure({ pressureTokens: 700, contextWindow: 1000 });
    harness.originalPrompt.mockRejectedValueOnce(new Error("new session rejected"));
    await harness.send();
    expect(harness.create).toHaveBeenCalledTimes(1);
    const last = harness.originalPrompt.mock.calls.at(-1)?.[0];
    expect(last?.sessionId).toBe("session-1");
  });

  it("carries the old session's workspace slot and pin to the new session", async () => {
    const workspace = makeWorkspaceRegistry();
    const harness = makeHarness(workspace.registry);
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    expect(workspace.record.attachSession).toHaveBeenCalledWith("session-new");
    expect(workspace.ids).toEqual(["session-older", "session-1", "session-new", "session-later"]);
    expect(workspace.registry.pinSession).toHaveBeenCalledWith("session-new");
    expect(workspace.pinned).toEqual(["session-new"]);
  });

  it("keeps the rotation when workspace bookkeeping throws", async () => {
    const failing = {
      list: () => [
        {
          sessionIds: ["session-1"],
          attachSession: async () => {
            throw new Error("attach failed");
          },
          insertSessionBefore: async () => {
            throw new Error("insert failed");
          },
          detachSession: async () => {},
        },
      ],
      pinnedSessionIds: ["session-1"],
      archiveSession: async () => {},
      unarchiveSession: async () => {},
      pinSession: async () => {
        throw new Error("pin failed");
      },
      unpinSession: async () => {
        throw new Error("unpin failed");
      },
    };
    const harness = makeHarness(failing);
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    // 工作区记账失败只 warn，轮转本身照常完成。
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.warn).toHaveBeenCalled();
    expect(String(harness.originalPrompt.mock.calls[0]?.[0].sessionId)).toBe("session-new");
  });

  it("restores the original prompt on dispose", () => {
    const harness = makeHarness();
    const wrapped = harness.controller.prompt;
    harness.dispose();
    expect(harness.controller.prompt).toBe(harness.originalPrompt);
    expect(harness.controller.prompt).not.toBe(wrapped);
  });
});

describe("autoCheck after rotation", () => {
  const summary =
    "轮转后自动执行 `nano_flow_check`：领域文档校验通过，索引已刷新。\n新会话不会自动绑定，恢复时先调用 `nano_flow_bind`。";

  it("runs the check for the new session and appends the result to the seed", async () => {
    const autoCheck = vi.fn(async () => ({ text: summary }));
    const harness = makeHarness(undefined, autoCheck);
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    expect(autoCheck).toHaveBeenCalledTimes(1);
    expect(autoCheck).toHaveBeenCalledWith({
      sessionId: "session-new",
      previousSessionId: "session-1",
      workspace: "C:\\work",
    });
    const redirected = harness.originalPrompt.mock.calls[0]?.[0];
    const seed = String(redirected?.content[0]?.["text"]);
    expect(seed).toContain("只读报告");
    expect(seed.endsWith(summary)).toBe(true);
    expect(textsOf(redirected)).toContain("用户消息");
  });

  it("keeps the check summary before the output block", async () => {
    const autoCheck = vi.fn(async () => ({ text: summary }));
    const harness = makeHarness(undefined, autoCheck);
    harness.sessions.set(
      "session-1",
      sessionOf(
        "session-1",
        "nano-flow",
        {},
        turnEvents(1, [[{ type: "text", text: "上一轮结论" }]]),
      ),
    );
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    const seed = String(harness.originalPrompt.mock.calls[0]?.[0].content[0]?.["text"]);
    expect(seed.indexOf(summary)).toBeLessThan(seed.indexOf(`<${LAST_OUTPUT_TAG}>`));
    expect(seed.trimEnd().endsWith(`</${LAST_OUTPUT_TAG}>`)).toBe(true);
  });

  it("uses the previous binding as a read-only seed plan reference", async () => {
    const autoCheck = vi.fn(async () => ({
      text: summary,
      planReference: "dsh/active/2026-11-08-示例",
    }));
    const harness = makeHarness(undefined, autoCheck);
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    const seed = String(harness.originalPrompt.mock.calls[0]?.[0].content[0]?.["text"]);
    expect(seed).toContain("恢复当前 Plan：dsh/active/2026-11-08-示例");
  });

  it("keeps rotating and notes the failure when the check throws", async () => {
    const autoCheck = vi.fn(async () => {
      throw new Error("node 挂了");
    });
    const harness = makeHarness(undefined, autoCheck);
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    const seed = String(harness.originalPrompt.mock.calls[0]?.[0].content[0]?.["text"]);
    expect(seed).toContain("nano_flow_check");
    expect(seed).toContain("node 挂了");
    expect(harness.warn).toHaveBeenCalled();
  });
});
