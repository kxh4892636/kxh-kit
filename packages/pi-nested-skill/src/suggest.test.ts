import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  createDollarAutocompleteProvider,
  matchDollarPrefix,
  skillEntries,
} from "./suggest.ts";

const command = (name: string, description?: string): SlashCommandInfo => ({
  name,
  ...(description !== undefined ? { description } : {}),
  source: "skill",
  sourceInfo: {
    path: `/skills/${name}/SKILL.md`,
    source: "local",
    scope: "user",
    origin: "top-level",
  },
});

describe("skillEntries", () => {
  it("strips the skill prefix, drops non-skill commands, and dedupes by name", () => {
    const entries = skillEntries([
      command("skill:alpha", "Alpha"),
      command("skill:alpha", "duplicate"),
      command("skill:beta"),
      { ...command("review"), source: "prompt" },
    ]);
    expect(entries).toEqual([
      { name: "alpha", description: "Alpha" },
      { name: "beta", description: undefined },
    ]);
  });
});

describe("matchDollarPrefix", () => {
  it("matches a token at the start or after whitespace", () => {
    expect(matchDollarPrefix("$al")).toEqual({ prefix: "$al", query: "al" });
    expect(matchDollarPrefix("say $al")).toEqual({ prefix: "$al", query: "al" });
    expect(matchDollarPrefix("say ")).toBeUndefined();
    expect(matchDollarPrefix("a$b")).toBeUndefined();
  });
});

describe("buildSuggestions", () => {
  it("ranks prefix matches first and carries the description", () => {
    const items = buildSuggestions(
      [
        { name: "alpha", description: "Alpha skill" },
        { name: "beta", description: undefined },
      ],
      "al",
    );
    expect(items[0]).toEqual({ value: "alpha", label: "alpha", description: "Alpha skill" });
  });

  it("returns every entry for an empty query", () => {
    const items = buildSuggestions([{ name: "alpha", description: undefined }], "");
    expect(items).toHaveLength(1);
  });
});

describe("createDollarAutocompleteProvider", () => {
  const current: AutocompleteProvider = {
    async getSuggestions() {
      return { prefix: "FILE", items: [{ value: "file", label: "file" }] };
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
  };
  const provider = createDollarAutocompleteProvider(
    { getCommands: () => [command("skill:alpha", "Alpha")] },
    current,
  );

  it("answers $ tokens itself", async () => {
    const result = await provider.getSuggestions(["$al"], 0, 3, {
      signal: new AbortController().signal,
    });
    expect(result?.prefix).toBe("$al");
    expect(result?.items[0]?.value).toBe("alpha");
  });

  it("delegates when the token is not a $ reference", async () => {
    const result = await provider.getSuggestions(["plain"], 0, 5, {
      signal: new AbortController().signal,
    });
    expect(result?.prefix).toBe("FILE");
  });

  it("returns null when no skill matches", async () => {
    const result = await provider.getSuggestions(["$zzz"], 0, 4, {
      signal: new AbortController().signal,
    });
    expect(result).toBeNull();
  });

  it("inserts $name with a trailing space and moves the cursor", () => {
    const result = provider.applyCompletion(
      ["say $al"],
      0,
      7,
      { value: "alpha", label: "alpha" },
      "$al",
    );
    expect(result.lines[0]).toBe("say $alpha ");
    expect(result.cursorCol).toBe(11);
  });

  it("delegates file-completion triggering", () => {
    expect(provider.shouldTriggerFileCompletion?.(["x"], 0, 1)).toBe(true);
  });
});
