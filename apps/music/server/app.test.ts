import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { loadLibrary } from "./tracks.ts";

const track = {
  id: "t1",
  composer: "Johann Sebastian Bach",
  work: "Goldberg Variations",
  movement: "Aria",
  trackNo: "01",
  title: "Aria",
  artist: "Kimiko Ishizaka",
  format: "flac",
  bytes: 2048,
  seconds: 292.4,
  sampleRate: 44100,
  bits: 24,
  audio: "/media/Bach/aria.flac",
  cover: "/media/Bach/aria.png",
  mask: "/waves/t1.png",
  sourceUrl: "https://archive.org/download/item/aria.flac",
  md5: "abc",
  license: "CC PD Mark 1.0",
};

const buildApp = () => {
  const root = mkdtempSync(join(tmpdir(), "music-app-"));
  const music = join(root, "music");
  const waves = join(root, "waves");
  const client = join(root, "client");
  mkdirSync(join(music, "Bach"), { recursive: true });
  mkdirSync(waves, { recursive: true });
  mkdirSync(client, { recursive: true });
  writeFileSync(join(music, "Bach", "aria.flac"), Buffer.alloc(4096, 1));
  writeFileSync(join(waves, "t1.png"), Buffer.from([1, 2, 3]));
  writeFileSync(join(client, "index.html"), "<!doctype html><title>听</title>", "utf8");

  const indexFile = join(root, "tracks.json");
  writeFileSync(
    indexFile,
    JSON.stringify({
      item: "MusopenCollectionAsFlac",
      license: "CC PD Mark 1.0",
      source: "https://archive.org/details/MusopenCollectionAsFlac",
      library: { tracks: 1, works: 1 },
      tracks: [track],
    }),
    "utf8",
  );

  return createApp({
    snapshot: loadLibrary(indexFile),
    musicRoot: music,
    wavesRoot: waves,
    clientDir: client,
  });
};

describe("createApp", () => {
  it("reports health with the track count", async () => {
    const response = await buildApp().request("/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { tracks: 1 } });
  });

  it("serves the index with an etag and honours If-None-Match", async () => {
    const app = buildApp();
    const first = await app.request("/api/tracks");
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await app.request("/api/tracks", {
      headers: { "if-none-match": etag ?? "" },
    });
    expect(second.status).toBe(304);
  });

  it("streams audio with a range request", async () => {
    const response = await buildApp().request("/media/Bach/aria.flac", {
      headers: { range: "bytes=0-1023" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1023/4096");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });

  it("serves waveform masks", async () => {
    const response = await buildApp().request("/waves/t1.png");
    expect(response.status).toBe(200);
  });

  it("answers unknown api routes with json", async () => {
    const response = await buildApp().request("/api/nope");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("falls back to index.html for client routes", async () => {
    const response = await buildApp().request("/somewhere");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("听");
  });
});
