import z from "@deepseek-ai/schemastery";
import type Schema from "@deepseek-ai/schemastery";
import { registerBridge } from "./bridge.js";
import { createRuntime } from "./tools.js";

export interface Config {
  /** Master switch for the whole plugin row. */
  enabled?: boolean;
  /** Workspace root holding `.story/`. Defaults to the process cwd. */
  workspace?: string;
}

export const Config: Schema<Config> = z.object({
  enabled: z.boolean().default(true),
  workspace: z.string(),
});

export const name = "infinite-story";
export const inject = ["tools", "systemPrompt"];

/**
 * Mount story mode.
 *
 * Scope is per session, not per workspace: the binding lives in
 * `.story/sessions/<id>.json`, the iron-rules section is registered on the
 * calling agent's context, and every tool body checks the caller's binding.
 *
 * The section text is a byte-stable constant (see prompt.ts) — no story name,
 * chapter, clock reading or session id — so every session that enables the mode
 * shares one cached prefix. Everything variable travels in the Brief instead.
 *
 * The HTTP bridge exists only when a webserver is composed; without one the GUI
 * switch stays dimmed and the tools remain the only way in.
 */
export const apply = (ctx: any, config: Config = {}): void => {
  if (config.enabled === false) return;

  const workspace = (): string => config.workspace ?? process.cwd();
  const runtime = createRuntime({ workspace, fallbackCtx: ctx });

  const disposeBridge = registerBridge({
    workspace,
    ctx,
    setSection: (session, enabled) => runtime.setSection(session, enabled),
    readBinding: (session) => runtime.readBinding(session),
    writeBinding: (session, next) =>
      runtime.writeBinding(session, { ...next, updatedAt: new Date().toISOString() }),
    listStories: () => runtime.listStories(),
  });

  ctx.effect(() => {
    return () => {
      disposeBridge();
      runtime.dispose();
    };
  }, "infinite-story runtime");
};
