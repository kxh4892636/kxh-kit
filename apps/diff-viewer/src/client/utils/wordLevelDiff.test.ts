import { describe, expect, it } from "vitest";

import type { DiffLine } from "../../types/diff";

import {
  computeWordLevelDiff,
  createWordDiffResolver,
  findModifiedLinePairs,
} from "./wordLevelDiff";

describe("findModifiedLinePairs", () => {
  it("pairs delete lines with following add lines by position", () => {
    const lines: DiffLine[] = [
      { type: "normal", content: "keep", oldLineNumber: 1, newLineNumber: 1 },
      { type: "delete", content: "const a = 1;", oldLineNumber: 2 },
      { type: "delete", content: "const b = 2;", oldLineNumber: 3 },
      { type: "add", content: "const a = 10;", newLineNumber: 2 },
      { type: "add", content: "const b = 20;", newLineNumber: 3 },
      { type: "add", content: "brand new", newLineNumber: 4 },
    ];

    const pairs = findModifiedLinePairs(lines);

    expect(pairs.get(1)).toEqual({
      oldContent: "const a = 1;",
      newContent: "const a = 10;",
      side: "old",
    });
    expect(pairs.get(2)).toEqual({
      oldContent: "const b = 2;",
      newContent: "const b = 20;",
      side: "old",
    });
    expect(pairs.get(3)).toEqual({
      oldContent: "const a = 1;",
      newContent: "const a = 10;",
      side: "new",
    });
    expect(pairs.get(4)).toEqual({
      oldContent: "const b = 2;",
      newContent: "const b = 20;",
      side: "new",
    });
    expect(pairs.has(0)).toBe(false);
    expect(pairs.has(5)).toBe(false);
  });
});

describe("createWordDiffResolver", () => {
  it("returns the same segments as eager computation for paired lines", () => {
    const lines: DiffLine[] = [
      { type: "delete", content: "const count = 1;", oldLineNumber: 1 },
      { type: "add", content: "const count = 2;", newLineNumber: 1 },
    ];
    const resolver = createWordDiffResolver(lines);
    const expected = computeWordLevelDiff("const count = 1;", "const count = 2;");

    expect(resolver(0)).toEqual(expected.oldSegments);
    expect(resolver(1)).toEqual(expected.newSegments);
  });

  it("returns undefined for lines without a modified pair", () => {
    const lines: DiffLine[] = [
      { type: "normal", content: "same", oldLineNumber: 1, newLineNumber: 1 },
      { type: "add", content: "fresh", newLineNumber: 2 },
      { type: "delete", content: "gone", oldLineNumber: 2 },
    ];
    const resolver = createWordDiffResolver(lines);

    expect(resolver(0)).toBeUndefined();
    expect(resolver(1)).toBeUndefined();
    expect(resolver(2)).toBeUndefined();
  });

  it("returns undefined for identical paired lines", () => {
    const lines: DiffLine[] = [
      { type: "delete", content: "same content", oldLineNumber: 1 },
      { type: "add", content: "same content", newLineNumber: 1 },
    ];
    const resolver = createWordDiffResolver(lines);

    expect(resolver(0)).toBeUndefined();
    expect(resolver(1)).toBeUndefined();
  });

  it("caches resolved segments per line", () => {
    const lines: DiffLine[] = [
      { type: "delete", content: "const count = 1;", oldLineNumber: 1 },
      { type: "add", content: "const count = 2;", newLineNumber: 1 },
    ];
    const resolver = createWordDiffResolver(lines);

    expect(resolver(1)).toBe(resolver(1));
  });
});
