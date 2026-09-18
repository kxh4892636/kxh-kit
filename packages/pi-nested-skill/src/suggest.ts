/**
 * `$skill-name` autocomplete. Mirrors pi's built-in slash-command completion:
 * candidates come from `pi.getCommands()`, ranking reuses
 * `@earendil-works/pi-tui`'s `fuzzyFilter`, and completion inserts `$name `.
 */

import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";

/** One selectable skill. */
export interface SkillEntry {
  readonly name: string;
  readonly description: string | undefined;
}

/** Minimal `pi` surface the provider needs. */
export interface CommandsSource {
  getCommands(): SlashCommandInfo[];
}

const DOLLAR_PREFIX = /(?:^|\s)\$([^\s$]*)$/u;

/** Project `pi.getCommands()` into deduped skill entries, stripping `skill:`. */
export function skillEntries(commands: readonly SlashCommandInfo[]): SkillEntry[] {
  const seen = new Set<string>();
  const entries: SkillEntry[] = [];
  for (const command of commands) {
    if (command.source !== "skill") continue;
    const name = command.name.startsWith("skill:")
      ? command.name.slice("skill:".length)
      : command.name;
    if (name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    entries.push({ name, description: command.description });
  }
  return entries;
}

/**
 * Match the `$` token ending at the cursor.
 *
 * @param textBeforeCursor - the current line up to the cursor.
 * @returns the full `prefix` (including `$`) and the query, or `undefined`.
 */
export function matchDollarPrefix(
  textBeforeCursor: string,
): { prefix: string; query: string } | undefined {
  const match = DOLLAR_PREFIX.exec(textBeforeCursor);
  if (match === null) return undefined;
  const query = match[1] ?? "";
  return { prefix: `$${query}`, query };
}

/** Fuzzy-filter entries and project them into autocomplete items. */
export function buildSuggestions(
  entries: readonly SkillEntry[],
  query: string,
): AutocompleteItem[] {
  const candidates = entries.map((entry) => ({
    name: entry.name,
    label: entry.name,
    description: entry.description,
  }));
  return fuzzyFilter(candidates, query, (item) => item.name).map((item) => ({
    value: item.name,
    label: item.label,
    ...(item.description !== undefined && item.description.length > 0
      ? { description: item.description }
      : {}),
  }));
}

/**
 * Wrap the built-in provider: answer `$` completions ourselves and delegate
 * everything else to `current`.
 */
export function createDollarAutocompleteProvider(
  source: CommandsSource,
  current: AutocompleteProvider,
): AutocompleteProvider {
  return {
    triggerCharacters: ["$"],
    async getSuggestions(
      lines,
      cursorLine,
      cursorCol,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const match = matchDollarPrefix(line.slice(0, cursorCol));
      if (match === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);
      const items = buildSuggestions(skillEntries(source.getCommands()), match.query);
      return items.length > 0 ? { prefix: match.prefix, items } : null;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      const line = lines[cursorLine] ?? "";
      const before = line.slice(0, cursorCol - prefix.length);
      const after = line.slice(cursorCol);
      const nextLines = [...lines];
      nextLines[cursorLine] = `${before}$${item.value} ${after}`;
      return {
        lines: nextLines,
        cursorLine,
        cursorCol: before.length + item.value.length + 2,
      };
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}
