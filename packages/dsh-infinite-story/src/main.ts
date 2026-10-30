import z from "@deepseek-ai/schemastery";
import type Schema from "@deepseek-ai/schemastery";
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
 * Off by default at runtime: only `story_mode` is registered until a story is
 * bound. When on, the iron-rules section is injected into the system prompt and
 * the story tools appear. The section text is a byte-stable constant (see
 * prompt.ts) so every session shares one cached prefix — everything variable
 * travels in the Brief instead.
 */
export const apply = (ctx: any, config: Config = {}): void => {
  if (config.enabled === false) return;

  const workspace = (): string => config.workspace ?? process.cwd();
  const runtime = createRuntime(ctx, { workspace });

  ctx.effect(() => {
    void runtime.syncFromDisk();
    return () => runtime.disable();
  }, "infinite-story mode sync");
};
