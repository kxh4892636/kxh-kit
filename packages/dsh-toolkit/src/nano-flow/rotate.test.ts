import { describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { attachRotation, type PromptRequestLike, type RotationSession } from "./rotate.js";
import type { HostServices } from "./services.js";

type Pressure = {
  pressureTokens?: number;
  projectedTokens?: number;
  contextWindow?: number;
};

const signal = new AbortController().signal;

const makeHarness = () => {
  let pressure: Pressure = { pressureTokens: 10, contextWindow: 1000 };
  const create = vi.fn(async () => ({ sessionId: "session-new" }));
  const originalPrompt = vi.fn(async (_request: PromptRequestLike, _signal?: AbortSignal) => ({
    accepted: true,
  }));
  const controller = { create, prompt: originalPrompt };
  const services = {
    get: (name: string) => {
      if (name === "tokenMeter") {
        return { contextPressure: () => pressure };
      }
      if (name === "sessionController") return controller;
      return undefined;
    },
    logger: { warn: vi.fn() },
  } as unknown as HostServices;
  const session: RotationSession = { id: "session-1", header: { cwd: "C:\\work" } };
  const dispose = attachRotation({
    services,
    config: { presetId: "nano-flow" },
    domainRoot: ".agents/domains",
    settings: () => ({ ...DEFAULT_NANO_FLOW_SETTINGS, rotateAt: 0.618 }),
    session,
  });
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
    dispose,
    send,
    setPressure: (next: Pressure) => (pressure = next),
  };
};

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
    expect(String(redirected?.content[0]?.["text"])).toContain("继续执行当前 Plan");
    expect(redirected?.content[1]).toEqual({ type: "text", text: "用户消息" });
    expect(harness.originalPrompt.mock.calls.some(([item]) => item.sessionId === "session-1")).toBe(
      false,
    );
  });

  it("only redirects once, and only for this session's queue prompts", async () => {
    const harness = makeHarness();
    harness.setPressure({ pressureTokens: 700, contextWindow: 1000 });
    await harness.send({ sessionId: "session-other" });
    await harness.send({ mode: "steer" });
    expect(harness.create).not.toHaveBeenCalled();

    await harness.send();
    await harness.send();
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.originalPrompt).toHaveBeenCalledTimes(4);
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

  it("restores the original prompt on dispose", () => {
    const harness = makeHarness();
    const wrapped = harness.controller.prompt;
    harness.dispose();
    expect(harness.controller.prompt).toBe(harness.originalPrompt);
    expect(harness.controller.prompt).not.toBe(wrapped);
  });
});
