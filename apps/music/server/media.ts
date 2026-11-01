import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import type { Context } from "hono";
/** Each response carries at most this many bytes, so "分片" is a real chunk. */
export const CHUNK_BYTES = 512 * 1024;

const MIME: Record<string, string> = {
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
};

export interface ByteRange {
  start: number;
  end: number;
}

export type RangeResult = ByteRange | "invalid" | null;

/**
 * Single-range only (the browsers we serve ask for one). An open-ended request
 * is capped to CHUNK_BYTES so the client keeps pulling slices instead of the
 * whole remainder.
 */
export const parseRange = (header: string | undefined, size: number): RangeResult => {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";

  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return "invalid";
  const requestedEnd = rawEnd === "" ? size - 1 : Number(rawEnd);
  if (!Number.isFinite(requestedEnd)) return "invalid";
  const end = Math.min(requestedEnd, start + CHUNK_BYTES - 1, size - 1);
  return { start, end };
};

/** Resolve a URL path under a root, refusing anything that escapes it. */
export const resolveMediaPath = (root: string, urlPath: string): string | null => {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  // No dotfiles: the library keeps .done markers next to the audio.
  if (relative.split("/").some((segment) => segment.startsWith("."))) return null;
  const target = normalize(join(root, relative));
  const base = normalize(root).replace(new RegExp(`${sep}$`), "");
  return target.startsWith(base + sep) ? target : null;
};

const streamOf = (path: string, range: ByteRange): ReadableStream<Uint8Array> =>
  Readable.toWeb(
    createReadStream(path, { start: range.start, end: range.end }),
  ) as unknown as ReadableStream<Uint8Array>;

const headersFor = (
  path: string,
  size: number,
  stat: { size: number; mtimeMs: number },
): Record<string, string> => ({
  "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
  "Accept-Ranges": "bytes",
  "Cache-Control": "public, max-age=3600",
  "Content-Length": String(size),
  // A strong validator lets the browser reuse a prefetched slice instead of
  // asking again when playback reaches it.
  ETag: `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`,
  "Last-Modified": new Date(stat.mtimeMs).toUTCString(),
});

/**
 * GET /media/*: 200 for a whole file, 206 for a slice, 416 for a bad range.
 * Static serving is not used here because it answers an open-ended range with
 * everything left in the file.
 */
export const serveMedia = (c: Context, root: string, urlPath: string): Response => {
  const path = resolveMediaPath(root, urlPath);
  if (!path) return c.text("路径不合法", 400);

  let stat: { size: number; mtimeMs: number };
  try {
    const info = statSync(path);
    stat = { size: info.size, mtimeMs: info.mtimeMs };
  } catch {
    return c.text("文件不存在", 404);
  }
  const size = stat.size;

  const range = parseRange(c.req.header("range"), size);
  if (range === "invalid") {
    return c.body(null, 416, { "Content-Range": `bytes */${size}` });
  }
  if (range === null) {
    return new Response(streamOf(path, { start: 0, end: size - 1 }), {
      status: 200,
      headers: headersFor(path, size, stat),
    });
  }

  const length = range.end - range.start + 1;
  return new Response(streamOf(path, range), {
    status: 206,
    headers: {
      ...headersFor(path, length, stat),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
    },
  });
};
