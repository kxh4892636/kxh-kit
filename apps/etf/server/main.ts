import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.ts";
import { startServer, type RunningServer } from "./server.ts";

export const main = (): RunningServer => {
  const running = startServer(loadConfig(".env"));
  running.server.on("error", (error: Error): void => {
    console.error(error);
    process.exitCode = 1;
  });
  const stop = (): void => {
    void running.close().catch((error: unknown): void => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return running;
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
