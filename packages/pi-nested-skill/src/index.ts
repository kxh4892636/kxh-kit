/**
 * pi extension entry point. Contributes hidden nested skill directories through
 * `resources_discover`, registers a `$skill-name` autocomplete provider, and
 * expands every resolvable `$name` before the prompt reaches the agent.
 * @module @kxh4892636/pi-nested-skill
 */

import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findHiddenSkillDirs } from "./discover.ts";
import { expandSkillReferences, loadSkillReference, type SkillReference } from "./reference.ts";
import { createDollarAutocompleteProvider } from "./suggest.ts";

const knownSkillDirs = (pi: ExtensionAPI): string[] => {
  return pi
    .getCommands()
    .filter((command) => command.source === "skill")
    .map((command) => dirname(command.sourceInfo.path));
};

const lookupSkill = (pi: ExtensionAPI, name: string): SkillReference | undefined => {
  const command = pi
    .getCommands()
    .find((candidate) => candidate.source === "skill" && candidate.name === `skill:${name}`);
  if (command === undefined) return undefined;
  try {
    return loadSkillReference(name, command.sourceInfo.path);
  } catch {
    return undefined;
  }
};

/** Injectable overrides (used by tests to keep discovery hermetic). */
export interface NestedSkillOptions {
  readonly agentDir?: string;
  readonly homeDir?: string;
  readonly excludedDirs?: readonly string[];
}

/** Register nested-skill discovery, completion, and expansion. */
export default function piNestedSkill(pi: ExtensionAPI, options: NestedSkillOptions = {}): void {
  pi.on("resources_discover", (_event, ctx) => ({
    skillPaths: findHiddenSkillDirs({
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
      knownSkillDirs: knownSkillDirs(pi),
      ...options,
    }),
  }));

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.addAutocompleteProvider((current) => createDollarAutocompleteProvider(pi, current));
  });

  pi.on("input", (event) => {
    if (event.source === "extension") return { action: "continue" };
    const result = expandSkillReferences(event.text, (name) => lookupSkill(pi, name));
    if (result.expanded.length === 0) return { action: "continue" };
    return { action: "transform", text: result.text };
  });
}
