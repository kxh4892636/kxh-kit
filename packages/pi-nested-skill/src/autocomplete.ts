import type {
  AutocompleteProviderFactory,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";

const SKILL_COMMAND_PREFIX = "skill:";
const SKILL_MARKER_PREFIX = "/skill:";
const INLINE_SLASH_AUTOCOMPLETE_PATTERN = /(?:^|\s)(\/[a-z0-9:-]*)$/u;

interface SkillMarkerCompletionItem {
  value: string;
  label: string;
  description?: string;
}

interface SkillMarkerSuggestions {
  items: SkillMarkerCompletionItem[];
  prefix: string;
}

interface CompletionApplyResult {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
}

interface SkillCommandEntry {
  name: string;
  description?: string;
}

const getInlineSlashPrefix = (textBeforeCursor: string): string | null => {
  const match = textBeforeCursor.match(INLINE_SLASH_AUTOCOMPLETE_PATTERN);
  const prefix = match?.[1];
  if (prefix === undefined) return null;
  if (textBeforeCursor.length === prefix.length) return null;
  return prefix;
};

const fuzzyIncludes = (value: string, query: string): boolean => {
  if (query.length === 0) return true;
  let cursor = 0;
  for (const character of query) {
    const index = value.indexOf(character, cursor);
    if (index === -1) return false;
    cursor = index + character.length;
  }
  return true;
};

const compareSkillCommands = (
  query: string,
  left: SkillCommandEntry,
  right: SkillCommandEntry,
): number => {
  const leftCommandName = `${SKILL_COMMAND_PREFIX}${left.name}`;
  const rightCommandName = `${SKILL_COMMAND_PREFIX}${right.name}`;
  const leftPrefix = left.name.startsWith(query) || leftCommandName.startsWith(query) ? 0 : 1;
  const rightPrefix = right.name.startsWith(query) || rightCommandName.startsWith(query) ? 0 : 1;
  if (leftPrefix !== rightPrefix) return leftPrefix - rightPrefix;
  return left.name.localeCompare(right.name);
};

const getSkillCommands = (commands: SlashCommandInfo[]): SkillCommandEntry[] => {
  const skills = new Map<string, SkillCommandEntry>();
  for (const command of commands) {
    if (command.source !== "skill" || !command.name.startsWith(SKILL_COMMAND_PREFIX)) continue;
    const name = command.name.slice(SKILL_COMMAND_PREFIX.length);
    if (!skills.has(name))
      skills.set(name, {
        name,
        ...(command.description === undefined ? {} : { description: command.description }),
      });
  }
  return [...skills.values()];
};

const getSkillMarkerSuggestions = (
  commands: SlashCommandInfo[],
  prefix: string,
): SkillMarkerSuggestions | null => {
  const commandQuery = prefix.slice(1);
  const markerQuery = commandQuery.startsWith(SKILL_COMMAND_PREFIX)
    ? commandQuery.slice(SKILL_COMMAND_PREFIX.length)
    : commandQuery;
  const items = getSkillCommands(commands)
    .filter((skill: SkillCommandEntry): boolean => {
      const commandName = `${SKILL_COMMAND_PREFIX}${skill.name}`;
      return fuzzyIncludes(skill.name, markerQuery) || fuzzyIncludes(commandName, commandQuery);
    })
    .sort((left: SkillCommandEntry, right: SkillCommandEntry): number =>
      compareSkillCommands(markerQuery, left, right),
    )
    .map(
      (skill: SkillCommandEntry): SkillMarkerCompletionItem => ({
        value: `${SKILL_MARKER_PREFIX}${skill.name}`,
        label: `${SKILL_MARKER_PREFIX}${skill.name}`,
        ...(skill.description === undefined ? {} : { description: skill.description }),
      }),
    );
  if (items.length === 0) return null;
  return { prefix, items };
};

export const createSkillMarkerAutocomplete =
  (getCommands: () => SlashCommandInfo[]): AutocompleteProviderFactory =>
  (current) => ({
    triggerCharacters: ["/", ":"],
    async getSuggestions(
      lines,
      cursorLine,
      cursorCol,
      options,
    ): Promise<SkillMarkerSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const prefix = getInlineSlashPrefix(line.slice(0, cursorCol));
      if (prefix === null) return current.getSuggestions(lines, cursorLine, cursorCol, options);
      return (
        getSkillMarkerSuggestions(getCommands(), prefix) ??
        current.getSuggestions(lines, cursorLine, cursorCol, options)
      );
    },
    applyCompletion(
      lines,
      cursorLine,
      cursorCol,
      item: SkillMarkerCompletionItem,
      prefix,
    ): CompletionApplyResult {
      if (!prefix.startsWith("/") || !item.value.startsWith(SKILL_MARKER_PREFIX)) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      }
      const currentLine = lines[cursorLine] ?? "";
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      const afterCursor = currentLine.slice(cursorCol);
      const suffix = afterCursor.startsWith(" ") ? "" : " ";
      const newLines = [...lines];
      newLines[cursorLine] = `${beforePrefix}${item.value}${suffix}${afterCursor}`;
      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length + suffix.length,
      };
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol): boolean {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  });
