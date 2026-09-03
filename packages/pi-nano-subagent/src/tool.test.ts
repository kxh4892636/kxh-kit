import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import type { SubagentOutcome } from "./outcome.js";
import type { PiSubagentRunRequest } from "./runtime.js";
import { createSubagentTool, MAX_DELEGATION_DEPTH } from "./tool.js";

const context = {} as unknown as ExtensionContext;

const zeroUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

describe("Subagent tool", (): void => {
  it("creates one recursive tool below main and returns final output with usage", async (): Promise<void> => {
    const requests: PiSubagentRunRequest[] = [];
    const expectedUsage = zeroUsage();
    const tool = createSubagentTool({
      maxConcurrency: 5,
      runChild: async (request: PiSubagentRunRequest): Promise<SubagentOutcome> => {
        requests.push(request);
        return { output: "delegated result", usage: expectedUsage };
      },
    });

    const result = await tool.execute(
      "call",
      { task: "inspect project" },
      undefined,
      undefined,
      context,
    );

    expect(result.content).toEqual([{ type: "text", text: "delegated result" }]);
    expect(result.details).toEqual({ depth: 1, output: "delegated result", truncated: false });
    expect(result.usage).toBe(expectedUsage);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.childTools.map((child: ToolDefinition): string => child.name)).toEqual([
      "subagent",
    ]);
  });

  it("snapshots the calling model before a concurrency wait", async (): Promise<void> => {
    const firstModel = { id: "first" } as unknown as ExtensionContext["model"];
    const secondModel = { id: "second" } as unknown as ExtensionContext["model"];
    const mutableContext = {
      cwd: "/workspace",
      model: firstModel,
      modelRegistry: {},
      thinkingLevel: "high",
    } as unknown as ExtensionContext;
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve): void => {
      releaseFirst = resolve;
    });
    const inheritedModels: ExtensionContext["model"][] = [];
    const tool = createSubagentTool({
      maxConcurrency: 1,
      runChild: async (childRequest: PiSubagentRunRequest): Promise<SubagentOutcome> => {
        inheritedModels.push(childRequest.parent.model);
        if (childRequest.task === "first") await firstGate;
        return { output: "done", usage: zeroUsage() };
      },
    });

    const first = tool.execute("first", { task: "first" }, undefined, undefined, mutableContext);
    await Promise.resolve();
    const second = tool.execute("second", { task: "second" }, undefined, undefined, mutableContext);
    Object.assign(mutableContext, { model: secondModel });
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(inheritedModels).toEqual([firstModel, firstModel]);
  });

  it("does not expose delegation to a depth-two Subagent", async (): Promise<void> => {
    let childToolCount = -1;
    const tool = createSubagentTool({
      maxConcurrency: 5,
      parentDepth: 1,
      runChild: async (request: PiSubagentRunRequest): Promise<SubagentOutcome> => {
        childToolCount = request.childTools.length;
        return { output: "done", usage: zeroUsage() };
      },
    });

    const result = await tool.execute("call", { task: "finish" }, undefined, undefined, context);

    expect(result.details?.depth).toBe(MAX_DELEGATION_DEPTH);
    expect(childToolCount).toBe(0);
  });

  it("rejects an invalid parent depth at construction", (): void => {
    expect((): unknown =>
      createSubagentTool({ maxConcurrency: 5, parentDepth: -1 } as unknown as Parameters<
        typeof createSubagentTool
      >[0]),
    ).toThrow("invalid Subagent parent depth");
  });

  it("rejects a fourth level at the execution boundary", async (): Promise<void> => {
    const tool = createSubagentTool({
      maxConcurrency: 5,
      parentDepth: MAX_DELEGATION_DEPTH,
      runChild: async (): Promise<SubagentOutcome> => ({
        output: "unreachable",
        usage: zeroUsage(),
      }),
    });

    await expect(
      tool.execute("call", { task: "recurse" }, undefined, undefined, context),
    ).rejects.toThrow("exceeds maximum 2");
  });

  it("rejects a blank task", async (): Promise<void> => {
    const tool = createSubagentTool({ maxConcurrency: 5 });

    await expect(
      tool.execute("call", { task: "   " }, undefined, undefined, context),
    ).rejects.toThrow("must not be blank");
  });

  it("bounds model-visible output while preserving full details", async (): Promise<void> => {
    const output = Array.from(
      { length: 2_100 },
      (_value: unknown, index: number): string => `line ${index}`,
    ).join("\n");
    const tool = createSubagentTool({
      maxConcurrency: 5,
      runChild: async (): Promise<SubagentOutcome> => ({ output, usage: zeroUsage() }),
    });

    const result = await tool.execute(
      "call",
      { task: "large result" },
      undefined,
      undefined,
      context,
    );
    const visible = result.content[0];

    expect(visible?.type).toBe("text");
    const visibleText = visible?.type === "text" ? visible.text : "";
    expect(visibleText).toContain("Output truncated");
    expect(visibleText.split("\n")).toHaveLength(2_000);
    expect(Buffer.byteLength(visibleText)).toBeLessThanOrEqual(50 * 1024);
    expect(result.details).toEqual({ depth: 1, output, truncated: true });
  });
});
