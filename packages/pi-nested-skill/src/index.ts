import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  InputEvent,
  InputEventResult,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { createSkillMarkerAutocomplete } from "./autocomplete.ts";
import { summarizeSkillBlocksForMarkdown } from "./display.ts";
import { discoverNestedSkillPaths } from "./discovery.ts";
import { expandSkillMarkers, type SkillReadWarning } from "./expansion.ts";

type ResourcesDiscoverEvent = Extract<ExtensionEvent, { type: "resources_discover" }>;

const piNestedSkill = (pi: ExtensionAPI): void => {
  pi.registerMarkdownTransformer(summarizeSkillBlocksForMarkdown);

  pi.on("session_start", (_event: ExtensionEvent, context: ExtensionContext): void => {
    context.ui.addAutocompleteProvider(
      createSkillMarkerAutocomplete((): SlashCommandInfo[] => pi.getCommands()),
    );
  });

  pi.on(
    "resources_discover",
    async (_event: ResourcesDiscoverEvent): Promise<{ skillPaths: string[] }> => {
      const nativeSkillPaths = pi
        .getCommands()
        .filter((command: SlashCommandInfo): boolean => command.source === "skill")
        .map((command: SlashCommandInfo): string => command.sourceInfo.path);
      return { skillPaths: await discoverNestedSkillPaths(nativeSkillPaths) };
    },
  );

  pi.on(
    "input",
    async (event: InputEvent, context: ExtensionContext): Promise<InputEventResult> => {
      if (event.source === "extension") return { action: "continue" };
      const catalog = new Map<string, string>();
      for (const command of pi.getCommands()) {
        if (command.source !== "skill" || !command.name.startsWith("skill:")) continue;
        const name = command.name.slice("skill:".length);
        if (!catalog.has(name)) catalog.set(name, command.sourceInfo.path);
      }
      const result = await expandSkillMarkers(
        event.text,
        catalog,
        (warning: SkillReadWarning): void => {
          context.ui.notify(`Unable to read skill ${warning.name} at ${warning.path}`, "warning");
        },
      );
      if (!result.changed) return { action: "continue" };
      return event.images === undefined
        ? { action: "transform", text: result.text }
        : { action: "transform", text: result.text, images: event.images };
    },
  );
};

export default piNestedSkill;
