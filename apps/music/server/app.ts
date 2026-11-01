import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiFail, apiOk } from "../shared/api.ts";
import { serveMedia } from "./media.ts";
import type { LibrarySnapshot } from "./tracks.ts";

export interface AppOptions {
  snapshot: LibrarySnapshot;
  musicRoot: string;
  wavesRoot: string;
  clientDir: string;
}

const stripPrefix =
  (prefix: string) =>
  (path: string): string =>
    path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;

/**
 * The backend owns three things: the index (with an ETag), the audio bytes
 * (Range comes from serve-static), and the built client. History and the
 * shuffle bag are the browser's business.
 */
export const createApp = (options: AppOptions): Hono => {
  const { snapshot, musicRoot, wavesRoot, clientDir } = options;
  const indexHtml = readFileSync(join(clientDir, "index.html"), "utf8");

  const app = new Hono();

  app.use("/api/*", cors());

  app.get("/api/health", (c) =>
    c.json(apiOk({ ok: true, tracks: snapshot.library.tracks.length })),
  );

  app.get("/api/tracks", (c) => {
    const headers = { ETag: snapshot.etag, "Cache-Control": "no-cache" };
    if (c.req.header("if-none-match") === snapshot.etag) {
      return c.body(null, 304, headers);
    }
    return c.json(apiOk(snapshot.library), 200, headers);
  });

  app.get("/media/*", (c) => serveMedia(c, musicRoot, c.req.path.replace(/^\/media/, "")));
  app.use("/waves/*", serveStatic({ root: wavesRoot, rewriteRequestPath: stripPrefix("/waves") }));
  app.use("/*", serveStatic({ root: clientDir }));

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json(apiFail("route_not_found", "接口不存在"), 404);
    }
    return c.html(indexHtml, 200);
  });

  app.onError((error, c) => {
    console.error(error);
    if (c.req.path.startsWith("/api/")) {
      return c.json(apiFail("internal_error", "服务端出错了"), 500);
    }
    return c.text("服务端出错了", 500);
  });

  return app;
};

export type AppType = ReturnType<typeof createApp>;
