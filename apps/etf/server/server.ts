import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openSqliteDatabase } from "./libs/sqlite/database.ts";
import { createSqliteMarketRepository } from "./market/repository/sqlite/sqlite-market-repository.ts";
import { createMarketService, type RemoteFetcher } from "./market/service/market-service.ts";
import { createRemoteFetcher } from "./libs/hongsehuojian/hongsehuojian.ts";
import type { Config } from "./config.ts";

export interface RunningServer {
  server: ServerType;
  close: () => Promise<void>;
}

export const startServer = (
  config: Config,
  fetcher: RemoteFetcher = createRemoteFetcher(),
): RunningServer => {
  const db = openSqliteDatabase(config.databaseDsn);
  const repository = createSqliteMarketRepository(db);
  const service = createMarketService({ repository, fetcher });
  const app = createApp(service);
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
