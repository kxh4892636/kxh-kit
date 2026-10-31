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
/**
 * Cordis reads `inject` as a **map of service names** — an array is the
 * shorthand. An object shaped `{ required, optional }` is not a dependency
 * declaration: it registers two services literally named `required` and
 * `optional`, so the row waits forever, the preset audit reports it as
 * `waiting for required, optional`, and `agent-preset-registry` marks the whole
 * preset `broken` (a session cannot start on it).
 *
 * `jobs` stays out of the list on purpose: it is host-optional, and the runtime
 * reads it with `ctx.get("jobs")`, which needs no injection.
 */
export const inject = {
  required: ["tools", "systemPrompt"],
  optional: ["llm", "agentDefaultModel"],
};

/**
 * Story mode is a **preset**, not a toggle.
 *
 * This row is mounted by the `故事模式` agent preset and by nothing else, so
 * choosing that preset in the session's preset selector turns story mode on, and
 * choosing any other preset turns it off. There is no UI switch and no
 * per-session flag — the preset selector is the switch.
 *
 * Which story is bound lives in `.story/active.json`, separate from the switch, so
 * one workspace keeps one story across any number of sessions.
 *
 * The prompt section is a byte-stable constant (see prompt.ts): no story name,
 * chapter, clock reading or session id, so every session on this preset shares one
 * cached prefix. Everything variable travels in the Brief from `story_open`.
 */
export const apply = (ctx: any, config: Config = {}): void => {
  if (config.enabled === false) return;

  const workspace = (): string => config.workspace ?? process.cwd();
  const runtime = createRuntime({ workspace, fallbackCtx: ctx });

  ctx.effect(() => {
    return () => runtime.dispose();
  }, "infinite-story runtime");
};
