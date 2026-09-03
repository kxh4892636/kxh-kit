import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type AgentToolResult,
  type AgentToolUpdateCallback,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

import { createParentConcurrencyLimiter } from "./concurrency.js";
import {
  runPiSubagent,
  type PiSubagentRunRequest,
  type SubagentParentSnapshot,
} from "./runtime.js";

export const MAX_DELEGATION_DEPTH = 2;

type DelegationDepth = 0 | 1 | 2;

const SUBAGENT_PARAMETERS = Type.Object(
  {
    task: Type.String({ minLength: 1, description: "Complete, self-contained task to delegate" }),
  },
  { additionalProperties: false },
);

type SubagentParameters = Static<typeof SUBAGENT_PARAMETERS>;

export interface SubagentDetails {
  readonly depth: number;
  readonly output: string;
  readonly truncated: boolean;
}

export interface SubagentToolOptions {
  readonly maxConcurrency: number;
  readonly parentDepth?: DelegationDepth;
  readonly runChild?: (request: PiSubagentRunRequest) => ReturnType<typeof runPiSubagent>;
}

type SubagentTool = ToolDefinition<typeof SUBAGENT_PARAMETERS, SubagentDetails> & ToolDefinition;

const formatOutput = (output: string): { readonly text: string; readonly truncated: boolean } => {
  const initial = truncateHead(output, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!initial.truncated) return { text: output, truncated: false };
  const truncation = truncateHead(output, {
    maxBytes: DEFAULT_MAX_BYTES - 512,
    maxLines: DEFAULT_MAX_LINES - 2,
  });
  const notice = [
    `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`,
    `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`,
    "Full output is preserved in tool details.]",
  ].join(" ");
  return { text: `${truncation.content}${notice}`, truncated: true };
};

const isDelegationDepth = (depth: number): depth is DelegationDepth =>
  depth === 0 || depth === 1 || depth === MAX_DELEGATION_DEPTH;

const nextDelegationDepth = (depth: 0 | 1): 1 | 2 => (depth === 0 ? 1 : 2);

export const createSubagentTool = (options: SubagentToolOptions): SubagentTool => {
  const runChild = options.runChild ?? runPiSubagent;

  const createAtDepth = (parentDepth: DelegationDepth): SubagentTool => {
    const limiter = createParentConcurrencyLimiter(options.maxConcurrency);
    const execute: SubagentTool["execute"] = async (
      _toolCallId: string,
      parameters: SubagentParameters,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<SubagentDetails> | undefined,
      context: ExtensionContext,
    ): Promise<AgentToolResult<SubagentDetails>> => {
      if (parentDepth === MAX_DELEGATION_DEPTH) {
        throw new Error(
          `subagent delegation depth ${parentDepth + 1} exceeds maximum ${MAX_DELEGATION_DEPTH}`,
        );
      }
      if (parameters.task.trim().length === 0) {
        throw new Error("subagent task must not be blank");
      }
      const childDepth = nextDelegationDepth(parentDepth);
      const parent: SubagentParentSnapshot = {
        cwd: context.cwd,
        model: context.model,
        modelRegistry: context.modelRegistry,
        thinkingLevel: context.thinkingLevel,
      };
      return limiter.run(signal, async (): Promise<AgentToolResult<SubagentDetails>> => {
        const childTools: ToolDefinition[] =
          childDepth < MAX_DELEGATION_DEPTH ? [createAtDepth(childDepth)] : [];
        const outcome = await runChild({
          task: parameters.task,
          childTools,
          parent,
          signal,
        });
        const formatted = formatOutput(outcome.output);
        return {
          content: [{ type: "text", text: formatted.text }],
          details: {
            depth: childDepth,
            output: outcome.output,
            truncated: formatted.truncated,
          },
          usage: outcome.usage,
        };
      });
    };

    return {
      name: "subagent",
      label: "Subagent",
      description:
        "Delegate one complete, self-contained task to a Fresh Subagent in the current workspace. " +
        "The call waits for its final answer; the Subagent can read and write files but does not see " +
        "this conversation or intermediate parent state.",
      promptSnippet: "Delegate a self-contained task to an isolated Fresh Subagent",
      promptGuidelines: [
        "Use subagent for focused independent work whose complete context fits in the task argument.",
        "Give subagent a self-contained task because it cannot see the parent conversation.",
        "Partition parallel subagent tasks so they do not write the same files.",
      ],
      parameters: SUBAGENT_PARAMETERS,
      executionMode: "parallel",
      execute,
    };
  };

  const configuredDepth: number = options.parentDepth ?? 0;
  if (!isDelegationDepth(configuredDepth)) {
    throw new RangeError(`invalid Subagent parent depth: ${configuredDepth}`);
  }
  return createAtDepth(configuredDepth);
};
