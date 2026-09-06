import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openDatabase, createSecurityStore } from "./storage/database.ts";
import type { Config } from "./config.ts";

export interface RunningServer {
  server: ServerType;
  close: () => Promise<void>;
}
export const startServer = (config: Config): RunningServer => {
  const db = openDatabase(config.databaseDsn);
  const app = createApp(createSecurityStore(db));
  const server = serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" });
  let closed = false;
  const close = (): Promise<void> =>
    new Promise((resolve, reject): void => {
      if (closed) {
        resolve();
        return;
      }
      closed = true;
      server.close((error): void => {
        db.$client.close();
        if (error) reject(error);
        else resolve();
      });
      if ("closeIdleConnections" in server) server.closeIdleConnections();
    });
  server.on("error", (): void => {
    if (!closed) {
      closed = true;
      db.$client.close();
    }
  });
  return { server, close };
};
