/**
 * Nested-skill wiring: contribute hidden skill directories through
 * `resources_discover`, offer `$skill-name` completion, and expand every
 * resolvable `$name` before the prompt reaches the agent. Each seam reads the
 * matching `/toolkit` switch at use time, so turning one off takes effect (or
 * stops new discoveries) without unloading the extension.
 * @module @kxh4892636/pi-toolkit/skills/register
 */

import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolkitSettings } from "../settings.ts";
import { findHiddenSkillDirs } from "./discover.ts";
import { expandSkillReferences, loadSkillReference, type SkillReference } from "./reference.ts";
import { createDollarAutocompleteProvider } from "./suggest.ts";

/** Dependencies supplied by the toolkit entry point. */
export interface SkillDeps {
  /** Resolve settings at use time so `/toolkit` changes apply immediately. */
  readonly settings: () => ToolkitSettings;
  /** Injectable overrides used by tests to keep discovery hermetic. */
  readonly agentDir?: string;
  readonly homeDir?: string;
}

/** Directories of skills pi already knows about, plus their nested children. */
const knownSkillDirs = (pi: ExtensionAPI): string[] => {
  return pi
    .getCommands()
    .filter((command) => command.source === "skill")
    .map((command) => dirname(command.sourceInfo.path));
};

/** Resolve one `$name` against pi's registered skill commands. */
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

/** Register nested-skill discovery, completion, and expansion. */
export const registerNestedSkills = (pi: ExtensionAPI, deps: SkillDeps): void => {
  pi.on("resources_discover", (_event, ctx) => {
    const settings = deps.settings();
    if (!settings.tools.nestedSkills) return undefined;
    return {
      skillPaths: findHiddenSkillDirs({
        cwd: ctx.cwd,
        projectTrusted: ctx.isProjectTrusted(),
        knownSkillDirs: knownSkillDirs(pi),
        excludedDirs: settings.nestedSkill.excludedDirs,
        ...(deps.agentDir !== undefined ? { agentDir: deps.agentDir } : {}),
        ...(deps.homeDir !== undefined ? { homeDir: deps.homeDir } : {}),
      }),
    };
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.addAutocompleteProvider((current) =>
      createDollarAutocompleteProvider(pi, current, () => deps.settings().tools.nestedSkills),
    );
  });

  pi.on("input", (event) => {
    if (!deps.settings().tools.nestedSkills) return { action: "continue" };
    if (event.source === "extension") return { action: "continue" };
    const result = expandSkillReferences(event.text, (name) => lookupSkill(pi, name));
    if (result.expanded.length === 0) return { action: "continue" };
    return { action: "transform", text: result.text };
  });
};
