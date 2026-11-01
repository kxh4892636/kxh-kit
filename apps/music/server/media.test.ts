import { describe, expect, it } from "vitest";
import { CHUNK_BYTES, parseRange, resolveMediaPath } from "./media.ts";

const SIZE = 20 * 1024 * 1024;

describe("parseRange", () => {
  it("returns null without a range header", () => {
    expect(parseRange(undefined, SIZE)).toBeNull();
  });

  it("caps an open-ended range to one chunk", () => {
    expect(parseRange("bytes=0-", SIZE)).toEqual({ start: 0, end: CHUNK_BYTES - 1 });
    expect(parseRange("bytes=5000000-", SIZE)).toEqual({
      start: 5000000,
      end: 5000000 + CHUNK_BYTES - 1,
    });
  });

  it("keeps a bounded range inside the file", () => {
    expect(parseRange("bytes=0-1023", SIZE)).toEqual({ start: 0, end: 1023 });
    expect(parseRange(`bytes=0-${SIZE * 2}`, SIZE)).toEqual({
      start: 0,
      end: Math.min(CHUNK_BYTES - 1, SIZE - 1),
    });
  });

  it("supports a suffix range", () => {
    expect(parseRange("bytes=-1024", SIZE)).toEqual({ start: SIZE - 1024, end: SIZE - 1 });
  });

  it("rejects nonsense", () => {
    expect(parseRange("bytes=--", SIZE)).toBe("invalid");
    expect(parseRange("items=0-10", SIZE)).toBe("invalid");
    expect(parseRange(`bytes=${SIZE}-`, SIZE)).toBe("invalid");
    expect(parseRange("bytes=-0", SIZE)).toBe("invalid");
  });
});

describe("resolveMediaPath", () => {
  it("resolves inside the root", () => {
    expect(resolveMediaPath("C:\\music", "/Bach/aria.flac")).toContain("aria.flac");
  });

  it("refuses to escape the root", () => {
    expect(resolveMediaPath("C:\\music", "/../secret.txt")).toBeNull();
    expect(resolveMediaPath("C:\\music", "/Bach/../../secret.txt")).toBeNull();
  });
});
