import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "./tracks.ts";

const payload = {
  item: "MusopenCollectionAsFlac",
  license: "CC PD Mark 1.0",
  source: "https://archive.org/details/MusopenCollectionAsFlac",
  library: { tracks: 1, works: 1 },
  tracks: [
    {
      id: "t1",
      composer: "Johann Sebastian Bach",
      work: "Goldberg Variations",
      movement: "Aria",
      trackNo: "01",
      title: "Aria",
      artist: "Kimiko Ishizaka",
      format: "flac",
      bytes: 13519283,
      seconds: 292.4,
      sampleRate: 44100,
      bits: 24,
      audio: "media/Bach/aria.flac",
      cover: "media/Bach/aria.png",
      mask: "waves/t1.png",
      sourceUrl: "https://archive.org/download/item/aria.flac",
      md5: "abc",
      license: "CC PD Mark 1.0",
    },
  ],
};

const writeIndex = (value: unknown): string => {
  const dir = mkdtempSync(join(tmpdir(), "music-index-"));
  const file = join(dir, "tracks.json");
  writeFileSync(file, JSON.stringify(value), "utf8");
  return file;
};

describe("loadLibrary", () => {
  it("returns the parsed library with a quoted sha1 etag", () => {
    const snapshot = loadLibrary(writeIndex(payload));
    expect(snapshot.library.tracks).toHaveLength(1);
    expect(snapshot.etag).toMatch(/^"[0-9a-f]{40}"$/);
    expect(snapshot.bytes).toBeGreaterThan(0);
  });

  it("fails loudly on a record that breaks the contract", () => {
    const broken = { ...payload, tracks: [{ ...payload.tracks[0], audio: "aria.flac" }] };
    expect(() => loadLibrary(writeIndex(broken))).toThrow(/曲目索引不合法/);
  });

  it("fails loudly on a truncated file", () => {
    const dir = mkdtempSync(join(tmpdir(), "music-index-"));
    const file = join(dir, "tracks.json");
    writeFileSync(file, "{", "utf8");
    expect(() => loadLibrary(file)).toThrow();
  });
});
