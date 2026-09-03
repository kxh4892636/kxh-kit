import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, type Usage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { collectSubagentOutcome } from "./outcome.js";

const usage = (input: number, output: number, cost: number): Usage => ({
  input,
  output,
  cacheRead: 2,
  cacheWrite: 3,
  cacheWrite1h: 1,
  reasoning: 4,
  totalTokens: input + output,
  cost: {
    input: cost / 2,
    output: cost / 2,
    cacheRead: 0,
    cacheWrite: 0,
    total: cost,
  },
});

const assistant = (
  text: string,
  messageUsage: Usage,
  stopReason: "stop" | "error" | "aborted" | "length" = "stop",
  errorMessage?: string,
): AgentMessage => ({
  ...fauxAssistantMessage(text, {
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
  }),
  usage: messageUsage,
});

describe("Subagent outcome", (): void => {
  it("returns the last non-empty assistant text and aggregates nested usage", (): void => {
    const messages: AgentMessage[] = [
      assistant("first", usage(10, 4, 0.2)),
      {
        role: "toolResult",
        toolCallId: "nested",
        toolName: "subagent",
        content: [{ type: "text", text: "nested" }],
        usage: usage(5, 2, 0.1),
        isError: false,
        timestamp: 1,
      },
      assistant("", usage(3, 1, 0.05)),
    ];

    expect(collectSubagentOutcome(messages)).toEqual({
      output: "first",
      usage: {
        input: 18,
        output: 7,
        cacheRead: 6,
        cacheWrite: 9,
        cacheWrite1h: 3,
        reasoning: 12,
        totalTokens: 25,
        cost: {
          input: 0.17500000000000002,
          output: 0.17500000000000002,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0.35000000000000003,
        },
      },
    });
  });

  it.each(["error", "aborted", "length"] as const)(
    "reports %s as failure and preserves partial output",
    (stopReason: "error" | "aborted" | "length"): void => {
      const messages = [assistant("partial answer", usage(1, 1, 0), stopReason, "provider detail")];

      expect((): unknown => collectSubagentOutcome(messages)).toThrow(
        new RegExp(`${stopReason}.*provider detail.*Partial output`, "s"),
      );
    },
  );

  it("rejects a run without an assistant message", (): void => {
    expect((): unknown => collectSubagentOutcome([])).toThrow("no assistant message");
  });
});
