import type {
  AutocompleteProviderFactory,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { createSkillMarkerAutocomplete } from "./autocomplete.ts";

type AutocompleteProvider = Parameters<AutocompleteProviderFactory>[0];

const abortController = new AbortController();

const skillCommand = (name: string, description?: string): SlashCommandInfo => ({
  name: `skill:${name}`,
  source: "skill",
  sourceInfo: {
    path: `/skills/${name}/SKILL.md`,
    source: "local",
    scope: "project",
    origin: "top-level",
  },
  ...(description === undefined ? {} : { description }),
});

const createCurrentProvider = (): AutocompleteProvider => ({
  triggerCharacters: ["/"],
  async getSuggestions(): Promise<null> {
    return null;
  },
  applyCompletion(
    lines,
    cursorLine,
    cursorCol,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    return { lines, cursorLine, cursorCol };
  },
  shouldTriggerFileCompletion(): boolean {
    return true;
  },
});

describe("skill marker autocomplete", (): void => {
  it("suggests all loaded skills as soon as an inline slash marker starts", async (): Promise<void> => {
    const provider = createSkillMarkerAutocomplete((): SlashCommandInfo[] => [
      skillCommand("to-story", "story"),
      skillCommand("quest-with-domain"),
      skillCommand("to-story", "duplicate"),
    ])(createCurrentProvider());

    await expect(
      provider.getSuggestions(["请 /"], 0, "请 /".length, {
        signal: abortController.signal,
      }),
    ).resolves.toEqual({
      prefix: "/",
      items: [
        { value: "/skill:quest-with-domain", label: "/skill:quest-with-domain" },
        { value: "/skill:to-story", label: "/skill:to-story", description: "story" },
      ],
    });
  });

  it("suggests loaded skills for an inline /skill: marker after other text", async (): Promise<void> => {
    const provider = createSkillMarkerAutocomplete((): SlashCommandInfo[] => [
      skillCommand("to-story", "story"),
      skillCommand("quest-with-domain", "domain"),
      {
        name: "prompt",
        source: "prompt",
        sourceInfo: { path: "/prompt.md", source: "local", scope: "project", origin: "top-level" },
      },
    ])(createCurrentProvider());

    await expect(
      provider.getSuggestions(
        ["请 /skill:tw 后再 /skill:q"],
        0,
        "请 /skill:tw 后再 /skill:q".length,
        {
          signal: abortController.signal,
        },
      ),
    ).resolves.toEqual({
      prefix: "/skill:q",
      items: [
        {
          value: "/skill:quest-with-domain",
          label: "/skill:quest-with-domain",
          description: "domain",
        },
      ],
    });
  });

  it("delegates leading slash command suggestions to Pi's built-in provider", async (): Promise<void> => {
    const provider = createSkillMarkerAutocomplete((): SlashCommandInfo[] => [
      skillCommand("to-story"),
    ])({
      ...createCurrentProvider(),
      async getSuggestions(): Promise<{
        prefix: string;
        items: Array<{ value: string; label: string }>;
      }> {
        return { prefix: "/", items: [{ value: "help", label: "help" }] };
      },
    });

    await expect(
      provider.getSuggestions(["/"], 0, "/".length, {
        signal: abortController.signal,
      }),
    ).resolves.toEqual({ prefix: "/", items: [{ value: "help", label: "help" }] });
  });

  it("delegates non skill-marker suggestions to the wrapped provider", async (): Promise<void> => {
    const provider = createSkillMarkerAutocomplete((): SlashCommandInfo[] => [
      skillCommand("to-story"),
    ])({
      ...createCurrentProvider(),
      async getSuggestions(): Promise<{
        prefix: string;
        items: Array<{ value: string; label: string }>;
      }> {
        return { prefix: "@REA", items: [{ value: "README.md", label: "README.md" }] };
      },
    });

    await expect(
      provider.getSuggestions(["read @REA"], 0, "read @REA".length, {
        signal: abortController.signal,
      }),
    ).resolves.toEqual({ prefix: "@REA", items: [{ value: "README.md", label: "README.md" }] });
  });

  it("delegates when an inline slash query matches no skill", async (): Promise<void> => {
    const provider = createSkillMarkerAutocomplete((): SlashCommandInfo[] => [
      skillCommand("to-story"),
    ])(createCurrentProvider());

    await expect(
      provider.getSuggestions(["请 /zzz"], 0, "请 /zzz".length, {
        signal: abortController.signal,
      }),
    ).resolves.toBeNull();
  });

  it("applies an inline skill marker completion without deleting surrounding text", (): void => {
    const provider = createSkillMarkerAutocomplete((): SlashCommandInfo[] => [
      skillCommand("to-story"),
    ])(createCurrentProvider());

    expect(
      provider.applyCompletion(
        ["请 /skill:to 梳理，然后 / 拷问"],
        0,
        "请 /skill:to 梳理，然后 /".length,
        { value: "/skill:quest-with-domain", label: "/skill:quest-with-domain" },
        "/",
      ),
    ).toEqual({
      lines: ["请 /skill:to 梳理，然后 /skill:quest-with-domain 拷问"],
      cursorLine: 0,
      cursorCol: "请 /skill:to 梳理，然后 /skill:quest-with-domain".length,
    });
  });

  it("delegates non skill-marker completion application and file completion checks", (): void => {
    const provider = createSkillMarkerAutocomplete((): SlashCommandInfo[] => [
      skillCommand("to-story"),
    ])({
      ...createCurrentProvider(),
      applyCompletion(): { lines: string[]; cursorLine: number; cursorCol: number } {
        return { lines: ["delegated"], cursorLine: 0, cursorCol: 9 };
      },
      shouldTriggerFileCompletion(): boolean {
        return false;
      },
    });

    expect(
      provider.applyCompletion(["@REA"], 0, 4, { value: "README.md", label: "README.md" }, "@REA"),
    ).toEqual({ lines: ["delegated"], cursorLine: 0, cursorCol: 9 });
    expect(provider.shouldTriggerFileCompletion?.(["@REA"], 0, 4)).toBe(false);
  });
});
