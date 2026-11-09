/**
 * Wiring for the `ask_questions` tool: register it inactive and let the
 * `/toolkit` switch decide whether it is callable. The switch is re-checked on
 * every call, so a disabled tool that reaches `execute` another way fails with
 * an actionable message.
 * @module @kxh4892636/pi-toolkit/ask/register
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyToolActivation } from "../activation.ts";
import type { ToolkitSettings } from "../settings.ts";
import { createAskQuestionsTool } from "./ask.ts";

/** Tool names owned by the ask switch. */
export const ASK_TOOL_NAMES = ["ask_questions"] as const;

/** Dependencies supplied by the toolkit entry point. */
export interface AskToolDeps {
  /** Resolve settings at call time so `/toolkit` changes apply immediately. */
  readonly settings: () => ToolkitSettings;
}

/** Add or remove `ask_questions` to match `tools.askQuestions`. */
export const applyAskToolActivation = (pi: ExtensionAPI, settings: ToolkitSettings): void => {
  applyToolActivation(pi, ASK_TOOL_NAMES, settings.tools.askQuestions);
};

/** Register `ask_questions` inactive; the switch activates it. */
export const registerAskTool = (pi: ExtensionAPI, deps: AskToolDeps): void => {
  const tool = createAskQuestionsTool();
  if (tool.execute === undefined) throw new Error("ask_questions tool has no execute function");

  pi.registerTool({
    ...tool,
    defaultActive: false,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!deps.settings().tools.askQuestions) {
        throw new Error("ask_questions is disabled. Run /toolkit to enable it.");
      }
      return tool.execute?.(toolCallId, params, signal, onUpdate, ctx);
    },
  });
};
