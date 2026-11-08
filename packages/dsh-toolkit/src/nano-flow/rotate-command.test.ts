import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vite-plus/test";

import type { RotationEngine, RotationSession } from "./rotate.js";
import { registerRotateCommand, type CommandsLike } from "./rotate-command.js";

const session = (preset = "nano-flow"): RotationSession => ({
  id: "session-1",
  header: { cwd: "C:\\work" },
  snapshotEvents: () => [{ type: "agent-preset/selected", data: { agentPreset: preset } }],
});

const makeCtx = () => {
  let definition: Parameters<CommandsLike["register"]>[0] | undefined;
  const commands = {
    register: vi.fn((next: Parameters<CommandsLike["register"]>[0]) => {
      definition = next;
      return () => {};
    }),
  };
  const ctx = {
    get: (name: string) => (name === "commands" ? commands : undefined),
  } as unknown as Context;
  return {
    ctx,
    commands,
    definition: () => {
      if (definition === undefined) throw new Error("command was not registered");
      return definition;
    },
  };
};

const makeEngine = (accepted = true) => {
  const rotate = vi.fn<
    (session: RotationSession, signal?: AbortSignal) => Promise<{ readonly accepted: boolean }>
  >(async () => ({ accepted }));
  const engine: RotationEngine = { attach: () => () => {}, rotate };
  return { engine, rotate };
};

describe("registerRotateCommand", () => {
  it("registers /rotate with a Chinese description", () => {
    const { ctx, commands, definition } = makeCtx();
    registerRotateCommand(ctx, makeEngine().engine, "nano-flow");
    expect(commands.register).toHaveBeenCalledTimes(1);
    expect(definition().name).toBe("rotate");
    expect(definition().description).toContain("轮转");
  });

  it("rejects arguments and non-nano-flow sessions", async () => {
    const { ctx, definition } = makeCtx();
    const { engine, rotate } = makeEngine();
    registerRotateCommand(ctx, engine, "nano-flow");
    const handler = definition().handler;

    const withArgs = await handler({ agent: { session: session() }, rawInput: " x" });
    expect(withArgs).toMatchObject({ kind: "error" });

    const other = await handler({ agent: { session: session("standard") } });
    expect(other).toMatchObject({ kind: "error" });
    expect(rotate).not.toHaveBeenCalled();
  });

  it("rotates the current session and reports success", async () => {
    const { ctx, definition } = makeCtx();
    const { engine, rotate } = makeEngine();
    registerRotateCommand(ctx, engine, "nano-flow");
    const current = session();
    const result = await definition().handler({ agent: { session: current }, rawInput: "" });
    expect(result).toMatchObject({ kind: "success" });
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(rotate.mock.calls[0]?.[0]).toBe(current);
    expect(rotate.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("reports an error when the rotation does not complete", async () => {
    const { ctx, definition } = makeCtx();
    registerRotateCommand(ctx, makeEngine(false).engine, "nano-flow");
    const result = await definition().handler({ agent: { session: session() } });
    expect(result).toMatchObject({ kind: "error" });
  });
});
