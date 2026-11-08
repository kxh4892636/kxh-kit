import { describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import {
  createRotation,
  selectedPreset,
  wrapPriorInput,
  type PromptRequestLike,
  type RotationSession,
} from "./rotate.js";
import type { HostServices } from "./services.js";

type Pressure = {
  pressureTokens?: number;
  projectedTokens?: number;
  contextWindow?: number;
};

const signal = new AbortController().signal;

/** 会话形状：预设以日志里最后一条 `agent-preset/selected` 为准。 */
const sessionOf = (
  id: string,
  preset = "nano-flow",
  header: RotationSession["header"] = {},
): RotationSession => ({
  id,
  header: { cwd: "C:\\work", ...header },
  snapshotEvents: () => [{ type: "agent-preset/selected", data: { agentPreset: preset } }],
});

const makeHarness = (
  workspaceRegistry?: unknown,
  autoCheck?: (params: { sessionId: string; workspace: string }) => Promise<string | undefined>,
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
    rotation,
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

describe("wrapPriorInput", () => {
  it("在用户内容前后各加一个 XML 标记与一句说明", () => {
    const wrapped = wrapPriorInput([{ type: "text", text: "用户消息" }]);
    expect(wrapped.map((block) => block["text"])).toEqual([
      "以下 XML 块是轮转前用户在旧会话发出的输入：",
      "<rotation-prior-input>",
      "用户消息",
      "</rotation-prior-input>",
    ]);
  });
});

describe("rotation engine", () => {
  it("rotates on demand: the new session receives only the seed", async () => {
    const harness = makeHarness();
    const session = harness.sessions.get("session-1");
    const result = await harness.rotation.rotate(session!);
    expect(result.accepted).toBe(true);
    expect(harness.create).toHaveBeenCalledTimes(1);
    const prompted = harness.originalPrompt.mock.calls[0]?.[0];
    expect(prompted?.sessionId).toBe("session-new");
    expect(prompted?.content).toHaveLength(1);
    expect(String(prompted?.content[0]?.["text"])).toContain("只读报告");
  });

  it("does nothing for a non-nano-flow session", async () => {
    const harness = makeHarness();
    const session = harness.sessions.get("session-other");
    const result = await harness.rotation.rotate(session!);
    expect(result.accepted).toBe(false);
    expect(harness.create).not.toHaveBeenCalled();
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

  it("redirects the user prompt to a new session with the seed before the user content", async () => {
    const harness = makeHarness();
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    expect(harness.create).toHaveBeenCalledTimes(1);
    const redirected = harness.originalPrompt.mock.calls[0]?.[0];
    expect(redirected?.sessionId).toBe("session-new");
    expect(redirected?.mode).toBe("queue");
    expect(redirected?.content[0]).toMatchObject({ type: "text" });
    expect(String(redirected?.content[0]?.["text"])).toContain("只读报告");
    const texts = (redirected?.content ?? []).map((block) => String(block["text"]));
    expect(texts).toContain("用户消息");
    expect(texts).toContain("<rotation-prior-input>");
    expect(texts).toContain("</rotation-prior-input>");
    expect(texts.indexOf("<rotation-prior-input>")).toBeLessThan(texts.indexOf("用户消息"));
    expect(texts.indexOf("用户消息")).toBeLessThan(texts.indexOf("</rotation-prior-input>"));
    expect(harness.originalPrompt.mock.calls.some(([item]) => item.sessionId === "session-1")).toBe(
      false,
    );
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
    "轮转后自动执行 `nano_flow_check`：领域文档校验通过，索引已刷新。\n本会话的 Note 看板绑定已建立，无需再跑一次。";

  it("runs the check for the new session and appends the result to the seed", async () => {
    const autoCheck = vi.fn(async () => summary);
    const harness = makeHarness(undefined, autoCheck);
    const session = harness.sessions.get("session-1");
    const result = await harness.rotation.rotate(session!);
    expect(result.accepted).toBe(true);
    expect(autoCheck).toHaveBeenCalledTimes(1);
    expect(autoCheck).toHaveBeenCalledWith({ sessionId: "session-new", workspace: "C:\\work" });
    const prompted = harness.originalPrompt.mock.calls[0]?.[0];
    const text = String(prompted?.content[0]?.["text"]);
    expect(text).toContain("只读报告");
    expect(text.endsWith(summary)).toBe(true);
  });

  it("also runs on the pressure path, keeping the prior input wrapped", async () => {
    const autoCheck = vi.fn(
      async () => "轮转后自动执行 `nano_flow_check`：领域文档校验通过，索引已刷新。",
    );
    const harness = makeHarness(undefined, autoCheck);
    harness.setPressure({ projectedTokens: 700, contextWindow: 1000 });
    await harness.send();
    expect(autoCheck).toHaveBeenCalledWith({ sessionId: "session-new", workspace: "C:\\work" });
    const redirected = harness.originalPrompt.mock.calls[0]?.[0];
    const texts = (redirected?.content ?? []).map((block) => String(block["text"]));
    expect(texts[0]).toContain("nano_flow_check");
    expect(texts).toContain("<rotation-prior-input>");
    expect(texts).toContain("用户消息");
  });

  it("keeps rotating and notes the failure when the check throws", async () => {
    const autoCheck = vi.fn(async () => {
      throw new Error("node 挂了");
    });
    const harness = makeHarness(undefined, autoCheck);
    const session = harness.sessions.get("session-1");
    const result = await harness.rotation.rotate(session!);
    expect(result.accepted).toBe(true);
    const prompted = harness.originalPrompt.mock.calls[0]?.[0];
    const text = String(prompted?.content[0]?.["text"]);
    expect(text).toContain("nano_flow_check");
    expect(text).toContain("node 挂了");
    expect(harness.warn).toHaveBeenCalled();
  });
});
