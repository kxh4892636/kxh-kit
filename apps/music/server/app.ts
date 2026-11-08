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
  classicalRoot: string;
  wavesRoot: string;
  clientDir: string;
  basePath?: string;
}

const stripPrefix =
  (prefix: string) =>
  (path: string): string =>
    path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;

/**
 * The backend owns three things: the index (with an ETag), the audio bytes
 * (Range is answered by media.ts) and the built client. History and the
 * shuffle bag are the browser's business.
 */
const buildApp = (options: AppOptions): Hono => {
  const { snapshot, musicRoot, classicalRoot, wavesRoot, clientDir } = options;
  const base = options.basePath && options.basePath !== "/" ? options.basePath : "";
  // Mounted under /music the handlers still see the prefixed path.
  const stripBase = (path: string): string =>
    base && path.startsWith(base) ? path.slice(base.length) || "/" : path;
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

  app.get("/media/*", (c) => {
    const path = stripBase(c.req.path).replace(/^\/media/, "");
    // The second collection lives in its own root; "classical/" is the switch,
    // not part of the file path under that root.
    if (path.startsWith("/classical/")) {
      return serveMedia(c, classicalRoot, path.replace(/^\/classical/, ""));
    }
    return serveMedia(c, musicRoot, path);
  });
  app.use(
    "/waves/*",
    serveStatic({
      root: wavesRoot,
      rewriteRequestPath: (path) => stripPrefix("/waves")(stripBase(path)),
    }),
  );
  app.use("/*", serveStatic({ root: clientDir, rewriteRequestPath: stripBase }));

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

/**
 * Deployed under `/music`, every route — page, API, audio, waveform — lives
 * behind the same prefix, so the client base and the proxy agree without any
 * rewrite rules.
 */
export const createApp = (options: AppOptions): Hono => {
  const app = buildApp(options);
  const base = options.basePath && options.basePath !== "/" ? options.basePath : "";
  if (!base) return app;

  const root = new Hono();
  root.route(base, app);
  root.get("/", (c) => c.redirect(`${base}/`));
  root.get(base, (c) => c.redirect(`${base}/`));

  // The mounted app keeps its notFound inside its own router, so unmatched
  // client routes under the prefix need the fallback here as well.
  const indexHtml = readFileSync(join(options.clientDir, "index.html"), "utf8");
  root.notFound((c) => {
    const path = c.req.path;
    if (path.startsWith(`${base}/api/`) || path.startsWith("/api/")) {
      return c.json(apiFail("route_not_found", "接口不存在"), 404);
    }
    return c.html(indexHtml, 200);
  });
  return root;
};

export type AppType = ReturnType<typeof createApp>;
