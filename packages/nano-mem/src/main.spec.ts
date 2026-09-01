import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { isDirectInvocation } from "./main.js";

describe("main module invocation", (): void => {
  test("matches canonical paths across a directory link", (): void => {
    const modulePath = fileURLToPath(import.meta.url);
    const aliases = new Map<string, string>([
      ["linked-entry.mjs", "canonical-entry.mjs"],
      [modulePath, "canonical-entry.mjs"],
    ]);
    const canonicalPath = (path: string): string => aliases.get(path) ?? path;

    expect(isDirectInvocation("linked-entry.mjs", import.meta.url, canonicalPath)).toBe(true);
  });

  test("rejects imports and unavailable invocation paths", (): void => {
    expect(isDirectInvocation(undefined, import.meta.url)).toBe(false);
    expect(
      isDirectInvocation("missing.mjs", import.meta.url, (): string => {
        throw new Error("missing");
      }),
    ).toBe(false);
  });
});
