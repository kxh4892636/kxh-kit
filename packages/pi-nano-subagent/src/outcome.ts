import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";

export interface SubagentOutcome {
  readonly output: string;
  readonly usage: Usage;
}

const emptyUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
});

const addUsage = (total: Usage, usage: Usage): void => {
  total.input += usage.input;
  total.output += usage.output;
  total.cacheRead += usage.cacheRead;
  total.cacheWrite += usage.cacheWrite;
  total.totalTokens += usage.totalTokens;
  total.cost.input += usage.cost.input;
  total.cost.output += usage.cost.output;
  total.cost.cacheRead += usage.cost.cacheRead;
  total.cost.cacheWrite += usage.cost.cacheWrite;
  total.cost.total += usage.cost.total;
  if (usage.cacheWrite1h !== undefined) {
    total.cacheWrite1h = (total.cacheWrite1h ?? 0) + usage.cacheWrite1h;
  }
  if (usage.reasoning !== undefined) {
    total.reasoning = (total.reasoning ?? 0) + usage.reasoning;
  }
};

const assistantMessages = (messages: readonly AgentMessage[]): AssistantMessage[] =>
  messages.filter(
    (message: AgentMessage): message is AssistantMessage =>
      "role" in message && message.role === "assistant",
  );

const finalAssistantText = (messages: readonly AssistantMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = messages[index]?.content
      .filter(
        (
          part: AssistantMessage["content"][number],
        ): part is Extract<AssistantMessage["content"][number], { type: "text" }> =>
          part.type === "text",
      )
      .map(
        (part: Extract<AssistantMessage["content"][number], { type: "text" }>): string => part.text,
      )
      .join("");
    if (text !== undefined && text.trim().length > 0) return text;
  }
  return "";
};

const aggregateUsage = (messages: readonly AgentMessage[]): Usage => {
  const total = emptyUsage();
  for (const message of messages) {
    if (!("role" in message)) continue;
    if (message.role === "assistant") addUsage(total, message.usage);
    if (message.role === "toolResult" && message.usage !== undefined) {
      addUsage(total, message.usage);
    }
  }
  return total;
};

const failedRunError = (terminal: AssistantMessage, partialOutput: string): Error => {
  const reason = terminal.stopReason;
  const detail = terminal.errorMessage === undefined ? "" : `: ${terminal.errorMessage}`;
  const partial =
    partialOutput.length === 0 ? "" : `\nPartial output before the run ended:\n${partialOutput}`;
  return new Error(`subagent run ended with ${reason}${detail}${partial}`);
};

export const collectSubagentOutcome = (messages: readonly AgentMessage[]): SubagentOutcome => {
  const assistants = assistantMessages(messages);
  const terminal = assistants.at(-1);
  if (terminal === undefined) throw new Error("subagent run produced no assistant message");
  const output = finalAssistantText(assistants);
  if (terminal.stopReason !== "stop") throw failedRunError(terminal, output);
  return { output, usage: aggregateUsage(messages) };
};
