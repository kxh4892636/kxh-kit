import { runScanNow } from "./scan-now.js";

const main = async (): Promise<void> => {
  const command = process.argv[2];
  if (command !== "scan-now") throw new Error(`Unknown command: ${command ?? "<missing>"}`);
  const socketPath = process.env["HERDR_SOCKET_PATH"];
  const stateDir = process.env["HERDR_PLUGIN_STATE_DIR"];
  if (socketPath === undefined || stateDir === undefined) {
    throw new Error("HERDR_SOCKET_PATH and HERDR_PLUGIN_STATE_DIR are required");
  }
  const result = await runScanNow({ socketPath, stateDir });
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

main().catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
