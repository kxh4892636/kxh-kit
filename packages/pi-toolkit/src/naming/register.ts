/**
 * Session naming wiring: on the first user input of a session, generate a short
 * title with the current model (falling back to a deterministic truncation) and
 * store it through the same API as the built-in `/name`. Gated by the
 * `/toolkit` session-naming switch, which applies to the next input.
 * @module @kxh4892636/pi-toolkit/naming/register
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SessionNameSettings, ToolkitSettings } from "../settings.ts";
import { buildNamePrompt, cleanModelOutput, fallbackName, namingInput } from "./name.ts";

/** Dependencies supplied by the toolkit entry point. */
export interface NamingDeps {
  /** Resolve settings at input time so `/toolkit` changes apply immediately. */
  readonly settings: () => ToolkitSettings;
}

/** A stored name counts only when it is a non-empty string. */
const hasSessionName = (pi: ExtensionAPI): boolean => {
  const name = pi.getSessionName();
  return typeof name === "string" && name.length > 0;
};

/** Whether any user message already reached the active branch. */
const hasUserMessage = (ctx: ExtensionContext): boolean =>
  ctx.sessionManager
    .getBranch()
    .some((entry) => entry.type === "message" && entry.message.role === "user");

/** First non-empty text block of a model reply, without depending on its exact type. */
const extractText = (blocks: readonly unknown[]): string => {
  for (const block of blocks) {
    if (typeof block !== "object" || block === null || !("type" in block) || !("text" in block)) {
      continue;
    }
    const candidate = block as { type: unknown; text: unknown };
    if (
      candidate.type === "text" &&
      typeof candidate.text === "string" &&
      candidate.text.trim().length > 0
    ) {
      return candidate.text;
    }
  }
  return "";
};

/** Ask the current model for a title; return "" whenever it is unavailable. */
const generateName = async (
  ctx: ExtensionContext,
  input: string,
  limits: SessionNameSettings,
): Promise<string> => {
  try {
    const model = ctx.model;
    if (model === undefined || !ctx.modelRegistry.hasConfiguredAuth(model)) return "";
    const response = await ctx.modelRegistry.complete(
      model,
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: buildNamePrompt(input, limits.maxLength) }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        maxTokens: limits.maxTokens,
        timeoutMs: limits.timeoutMs,
        // Session-based providers (e.g. opencode) reject requests without an id;
        // reuse the pi session id, and providers that ignore it are unaffected.
        sessionId: ctx.sessionManager.getSessionId(),
      },
    );
    return cleanModelOutput(extractText(response.content), limits.maxLength);
  } catch {
    // Naming is best-effort: model/auth/transport failures fall back below.
    return "";
  }
};

/** Resolve a name in the background and set it unless one appeared meanwhile. */
const nameSession = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  input: string,
  fallback: string,
  limits: SessionNameSettings,
  isCurrentSession: () => boolean,
): Promise<void> => {
  const generated = await generateName(ctx, input, limits);
  const name = generated.length > 0 ? generated : fallback;
  if (!isCurrentSession() || name.length === 0 || hasSessionName(pi)) return;
  pi.setSessionName(name);
};

/** Register first-input session naming. */
export const registerSessionNaming = (pi: ExtensionAPI, deps: NamingDeps): void => {
  let namingStarted = false;
  let generation = 0;

  pi.on("session_start", () => {
    namingStarted = false;
    generation += 1;
  });

  pi.on("input", (event, ctx) => {
    const settings = deps.settings();
    if (!settings.tools.sessionName) return { action: "continue" };
    if (event.source === "extension" || namingStarted) return { action: "continue" };
    if (hasSessionName(pi)) return { action: "continue" };
    if (hasUserMessage(ctx)) return { action: "continue" };
    const input = namingInput(event.text);
    const fallback = fallbackName(input, settings.sessionName.maxLength);
    if (fallback.length === 0) return { action: "continue" };
    namingStarted = true;
    const startedAt = generation;
    const isCurrentSession = (): boolean => startedAt === generation;
    // Never let a background naming failure surface as an unhandled rejection.
    void nameSession(pi, ctx, input, fallback, settings.sessionName, isCurrentSession).catch(
      () => undefined,
    );
    return { action: "continue" };
  });
};
