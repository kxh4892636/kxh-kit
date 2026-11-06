import { describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { attachRotation } from "./rotate.js";
import type { HostServices } from "./services.js";

type Pressure = {
  pressureTokens?: number;
  projectedTokens?: number;
  contextWindow?: number;
};

const makeHarness = () => {
  let pressure: Pressure = { pressureTokens: 10, contextWindow: 1000 };
  const handlers: Array<(session: unknown, event: unknown) => void> = [];
  const create = vi.fn(async () => ({ sessionId: "session-new" }));
  const prompt = vi.fn(async () => ({ accepted: true }));
  const services = {
    get: (name: string) => {
      if (name === "tokenMeter") {
        return {
          contextPressure: () => pressure,
        };
      }
      if (name === "sessionController") return { create, prompt };
      return undefined;
    },
    on: (_event: string, handler: (session: unknown, event: unknown) => void) => {
      handlers.push(handler);
      return () => {};
    },
    logger: { warn: vi.fn() },
  } as unknown as HostServices;
  const dispose = attachRotation({
    services,
    config: { presetId: "nano-flow" },
    domainRoot: ".agents/domains",
    settings: () => ({ ...DEFAULT_NANO_FLOW_SETTINGS, rotateAt: 0.618 }),
  });
  const emit = (session: unknown, event: unknown): void => {
    for (const handler of handlers) handler(session, event);
  };
  return { create, prompt, emit, dispose, setPressure: (next: Pressure) => (pressure = next) };
};

const session = { id: "session-1", header: { cwd: "C:\\work", agentPreset: "nano-flow" } };
const completed = { type: "turn/end", data: { reason: { kind: "completed" } } };
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

describe("attachRotation", () => {
  it("re-checks every completed turn and rotates only once after crossing the threshold", async () => {
    const harness = makeHarness();
    harness.emit(session, completed);
    await settle();
    expect(harness.create).not.toHaveBeenCalled();

    harness.setPressure({ pressureTokens: 700, contextWindow: 1000 });
    harness.emit(session, completed);
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(1));

    harness.emit(session, completed);
    await settle();
    expect(harness.create).toHaveBeenCalledTimes(1);
  });

  it("uses projectedTokens before pressureTokens, matching the UI occupancy", async () => {
    const harness = makeHarness();
    harness.setPressure({ pressureTokens: 500, projectedTokens: 700, contextWindow: 1000 });
    harness.emit(session, completed);
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(1));
  });

  it("does not rotate on non-completed turn ends or subagent sessions", async () => {
    const harness = makeHarness();
    harness.setPressure({ pressureTokens: 700, contextWindow: 1000 });
    harness.emit(session, { type: "turn/end", data: { reason: { kind: "aborted" } } });
    harness.emit({ ...session, header: { cwd: "C:\\work", origin: "subagent" } }, completed);
    harness.emit({ ...session, header: { cwd: "C:\\work", agentPreset: "standard" } }, completed);
    await settle();
    expect(harness.create).not.toHaveBeenCalled();
  });
});
