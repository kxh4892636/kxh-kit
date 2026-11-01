import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { loadLibrary } from "./tracks.ts";

export interface RunningServer {
  server: ServerType;
  close: () => Promise<void>;
}

export const startServer = (config: Config): RunningServer => {
  const snapshot = loadLibrary(config.tracksFile);
  const app = createApp({
    snapshot,
    musicRoot: config.musicRoot,
    wavesRoot: config.wavesRoot,
    clientDir: config.clientDir,
    basePath: config.basePath,
  });

  const server = serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" });
  let closed = false;

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (closed) {
        resolve();
        return;
      }
      closed = true;
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
      if ("closeIdleConnections" in server) server.closeIdleConnections();
    });

  return { server, close };
};
