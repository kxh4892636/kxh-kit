import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { CHUNK_BYTES } from "./media.ts";
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
  bytes: 4196352,
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

const FILE_BYTES = CHUNK_BYTES + 2048;

const buildApp = (basePath?: string) => {
  const root = mkdtempSync(join(tmpdir(), "music-app-"));
  const music = join(root, "music");
  const waves = join(root, "waves");
  const client = join(root, "client");
  mkdirSync(join(music, "Bach"), { recursive: true });
  mkdirSync(waves, { recursive: true });
  mkdirSync(client, { recursive: true });
  writeFileSync(join(music, "Bach", "aria.flac"), Buffer.alloc(FILE_BYTES, 1));
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
    ...(basePath ? { basePath } : {}),
  });
};

describe("createApp under /music", () => {
  it("serves the api behind the prefix and redirects the bare root", async () => {
    const app = buildApp("/music");
    const health = await app.request("/music/api/health");
    expect(health.status).toBe(200);

    const redirect = await app.request("/");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/music/");

    const unprefixed = await app.request("/api/health");
    expect(unprefixed.status).toBe(404);

    const deepLink = await app.request("/music/somewhere");
    expect(deepLink.status).toBe(200);
    expect(await deepLink.text()).toContain("听");
  });
});

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

  it("serves a bounded range with the right type", async () => {
    const response = await buildApp().request("/media/Bach/aria.flac", {
      headers: { range: "bytes=0-1023" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-1023/${FILE_BYTES}`);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-type")).toBe("audio/flac");
  });

  it("answers an open-ended range with one capped chunk", async () => {
    const response = await buildApp().request("/media/Bach/aria.flac", {
      headers: { range: "bytes=0-" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-${CHUNK_BYTES - 1}/${FILE_BYTES}`);
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(CHUNK_BYTES);
  });

  it("supports suffix ranges and whole-file requests", async () => {
    const suffix = await buildApp().request("/media/Bach/aria.flac", {
      headers: { range: "bytes=-1024" },
    });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe(
      `bytes ${FILE_BYTES - 1024}-${FILE_BYTES - 1}/${FILE_BYTES}`,
    );

    const whole = await buildApp().request("/media/Bach/aria.flac");
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
  });

  it("rejects a range past the end", async () => {
    const response = await buildApp().request("/media/Bach/aria.flac", {
      headers: { range: `bytes=${FILE_BYTES + 10}-` },
    });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${FILE_BYTES}`);
  });

  it("reports a missing file", async () => {
    const response = await buildApp().request("/media/Bach/nope.flac");
    expect(response.status).toBe(404);
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
