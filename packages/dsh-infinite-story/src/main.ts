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
 * Only the services the runtime touches unconditionally.
 *
 * Cordis reads `inject` as a **map of service names**, and an array is the
 * shorthand for `{ name: null }`. An object shaped `{ required, optional }` is
 * not a dependency declaration: its two KEYS become the dependency names, so
 * the row waits for two services literally called `required` and `optional`.
 * Neither is ever provided, `auditRows` reports
 * `waiting for required, optional`, and `agent-preset-registry` marks the whole
 * preset `broken` — the session cannot start and the selector shows 加载失败.
 *
 * Host-optional services stay out on purpose: `llm`, `agentDefaultModel` and
 * `jobs` are read with `ctx.get(name)` inside the tools, which needs no
 * injection and yields `undefined` when the host does not provide them.
 * Reading them as `ctx.llm` instead would THROW (`cannot get property "llm"
 * without inject`) whenever the host omits them, so never promote them here.
 */
export const inject = ["tools", "systemPrompt"];

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
