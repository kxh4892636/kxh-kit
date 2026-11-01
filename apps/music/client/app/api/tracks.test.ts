import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLibrary, LibraryRequestError } from "./tracks.ts";

const track = {
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
};

const library = {
  item: "MusopenCollectionAsFlac",
  license: "CC PD Mark 1.0",
  source: "https://archive.org/details/MusopenCollectionAsFlac",
  library: { tracks: 1, works: 1 },
  tracks: [track],
};

const respond = (body: unknown, status = 200): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLibrary", () => {
  it("returns the validated library", async () => {
    respond({ ok: true, data: library });
    await expect(fetchLibrary()).resolves.toMatchObject({ item: "MusopenCollectionAsFlac" });
  });

  it("rejects a non-2xx response", async () => {
    respond({}, 500);
    await expect(fetchLibrary()).rejects.toBeInstanceOf(LibraryRequestError);
  });

  it("rejects a failed envelope", async () => {
    respond({ ok: false, error: { code: "x", message: "y" } });
    await expect(fetchLibrary()).rejects.toThrow("曲目索引返回了错误");
  });

  it("rejects a malformed record", async () => {
    respond({ ok: true, data: { ...library, tracks: [{ ...track, audio: "aria.flac" }] } });
    await expect(fetchLibrary()).rejects.toThrow("曲目索引格式不对");
  });
});
