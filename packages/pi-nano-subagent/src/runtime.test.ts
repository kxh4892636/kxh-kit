import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  fauxAssistantMessage,
  fauxProvider,
  type AssistantMessage,
  type Context as ModelContext,
  type SimpleStreamOptions,
  type Tool,
} from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import {
  runPiSubagent,
  type PiSubagentRunRequest,
  type SubagentParentSnapshot,
  type SubagentSession,
  type SubagentSessionFactory,
} from "./runtime.js";

const parent = {} as unknown as SubagentParentSnapshot;

const request = (signal?: AbortSignal): PiSubagentRunRequest => ({
  task: "complete this task",
  childTools: [],
  parent,
  signal,
});

const sessionFactory =
  (
    messages: readonly AgentMessage[],
    prompt: () => Promise<void> = async (): Promise<void> => undefined,
    abort: () => Promise<void> = async (): Promise<void> => undefined,
    dispose: () => void = (): void => undefined,
  ): SubagentSessionFactory =>
  async (): Promise<SubagentSession> => ({
    messages,
    prompt,
    abort,
    dispose,
  });

describe("Subagent run lifecycle", (): void => {
  it("prompts a fresh session once, returns its outcome, and disposes it", async (): Promise<void> => {
    const prompt = vi.fn(async (): Promise<void> => undefined);
    const dispose = vi.fn();
    const factory = sessionFactory(
      [fauxAssistantMessage("final answer")],
      prompt,
      undefined,
      dispose,
    );

    const outcome = await runPiSubagent(request(), factory);

    expect(prompt).toHaveBeenCalledWith("complete this task");
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(outcome.output).toBe("final answer");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("propagates cancellation through session abort and still disposes", async (): Promise<void> => {
    let settlePrompt: (() => void) | undefined;
    const prompt = (): Promise<void> =>
      new Promise<void>((resolve): void => {
        settlePrompt = resolve;
      });
    const abort = vi.fn(async (): Promise<void> => settlePrompt?.());
    const dispose = vi.fn();
    const controller = new AbortController();
    const running = runPiSubagent(
      request(controller.signal),
      sessionFactory([fauxAssistantMessage("partial")], prompt, abort, dispose),
    );

    await Promise.resolve();
    controller.abort();

    await expect(running).rejects.toThrow("cancelled");
    expect(abort).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not prompt when cancellation wins during initialization", async (): Promise<void> => {
    let finishInitialization: (() => void) | undefined;
    const initialization = new Promise<void>((resolve): void => {
      finishInitialization = resolve;
    });
    const prompt = vi.fn(async (): Promise<void> => undefined);
    const abort = vi.fn(async (): Promise<void> => undefined);
    const dispose = vi.fn();
    const factory: SubagentSessionFactory = async (): Promise<SubagentSession> => {
      await initialization;
      return { messages: [], prompt, abort, dispose };
    };
    const controller = new AbortController();
    const running = runPiSubagent(request(controller.signal), factory);

    controller.abort();
    finishInitialization?.();

    await expect(running).rejects.toThrow("cancelled during initialization");
    expect(prompt).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not create a session for a pre-cancelled call", async (): Promise<void> => {
    const controller = new AbortController();
    controller.abort();
    const factory = vi.fn<SubagentSessionFactory>();

    await expect(runPiSubagent(request(controller.signal), factory)).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it("aborts failed work and preserves both execution and cleanup failures", async (): Promise<void> => {
    const abort = vi.fn(async (): Promise<void> => undefined);
    const factory = sessionFactory(
      [],
      async (): Promise<void> => Promise.reject(new Error("prompt failed")),
      abort,
      (): never => {
        throw new Error("dispose failed");
      },
    );

    const error = await runPiSubagent(request(), factory).catch(
      (reason: unknown): unknown => reason,
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect(error).toMatchObject({ message: "subagent run and cleanup both failed" });
    expect((error as AggregateError).errors).toHaveLength(2);
    expect(abort).toHaveBeenCalledOnce();
  });
});

const parentSnapshotFor = async (
  faux: ReturnType<typeof fauxProvider>,
  thinkingLevel: "off" | "high" = "off",
): Promise<SubagentParentSnapshot> => {
  const runtime = await ModelRuntime.create({ refreshOnCreate: false });
  runtime.registerNativeProvider(faux.provider);
  return {
    cwd: process.cwd(),
    model: faux.getModel(),
    modelRegistry: new ModelRegistry(runtime),
    thinkingLevel,
  };
};

describe("Pi SDK integration", (): void => {
  it("runs with the inherited faux model and only the fixed working tools", async (): Promise<void> => {
    const faux = fauxProvider({
      provider: "nano-subagent-test",
      models: [{ id: "reasoning-faux", reasoning: true }],
    });
    let toolNames: string[] = [];
    let inheritedThinking: string | undefined;
    let loadedProjectInstructions = false;
    faux.setResponses([
      (
        modelContext: ModelContext,
        streamOptions: SimpleStreamOptions | undefined,
      ): AssistantMessage => {
        toolNames = modelContext.tools?.map((tool: Tool): string => tool.name).sort() ?? [];
        inheritedThinking = streamOptions?.reasoning;
        loadedProjectInstructions = modelContext.systemPrompt?.includes("第一性原理") ?? false;
        return fauxAssistantMessage("mock model answer");
      },
    ]);
    const parentSnapshot = await parentSnapshotFor(faux, "high");

    const outcome = await runPiSubagent({
      task: "respond from the mock model",
      childTools: [],
      parent: parentSnapshot,
      signal: undefined,
    });

    expect(outcome.output).toBe("mock model answer");
    expect(outcome.usage.totalTokens).toBeGreaterThan(0);
    expect(toolNames).toEqual(["bash", "edit", "find", "grep", "ls", "read", "write"]);
    expect(inheritedThinking).toBe("high");
    expect(loadedProjectInstructions).toBe(true);
    expect(faux.state.callCount).toBe(1);
  });

  it("surfaces a faux-model failure instead of returning partial output", async (): Promise<void> => {
    const faux = fauxProvider({ provider: "nano-subagent-failure-test" });
    faux.setResponses([
      fauxAssistantMessage("partial", {
        stopReason: "error",
        errorMessage: "mock provider failed",
      }),
    ]);
    const parentSnapshot = await parentSnapshotFor(faux);

    await expect(
      runPiSubagent({
        task: "fail from the mock model",
        childTools: [],
        parent: parentSnapshot,
        signal: undefined,
      }),
    ).rejects.toThrow(/mock provider failed.*Partial output/s);
  });

  it("cancels an active faux-model stream", async (): Promise<void> => {
    const faux = fauxProvider({
      provider: "nano-subagent-cancellation-test",
      tokensPerSecond: 1,
      tokenSize: { min: 1, max: 1 },
    });
    faux.setResponses([fauxAssistantMessage("a response that should be interrupted")]);
    const parentSnapshot = await parentSnapshotFor(faux);
    const controller = new AbortController();
    const running = runPiSubagent({
      task: "start the slow mock model",
      childTools: [],
      parent: parentSnapshot,
      signal: controller.signal,
    });

    while (faux.state.callCount === 0) await Promise.resolve();
    controller.abort();

    await expect(running).rejects.toThrow("cancelled");
  });
});
