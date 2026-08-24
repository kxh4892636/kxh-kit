import { runAgentStatusEvent } from "./resume/event-handler.js";
import type { ResumeResult } from "./resume/resume-agent.js";
import { runScanNow } from "./resume/scan-now.js";

const main = async (): Promise<void> => {
  const command = process.argv[2];
  const socketPath = process.env["HERDR_SOCKET_PATH"];
  const stateDir = process.env["HERDR_PLUGIN_STATE_DIR"];
  if (socketPath === undefined || stateDir === undefined) {
    throw new Error("HERDR_SOCKET_PATH and HERDR_PLUGIN_STATE_DIR are required");
  }
  const result =
    command === "scan-now"
      ? await runScanNow({ socketPath, stateDir })
      : await runEventCommand(command, socketPath, stateDir);
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

const runEventCommand = async (
  command: string | undefined,
  socketPath: string,
  stateDir: string,
): Promise<ResumeResult> => {
  if (command !== "handle-event") throw new Error(`Unknown command: ${command ?? "<missing>"}`);
  const eventJson = process.env["HERDR_PLUGIN_EVENT_JSON"];
  if (eventJson === undefined) throw new Error("HERDR_PLUGIN_EVENT_JSON is required");
  return await runAgentStatusEvent({ eventJson, socketPath, stateDir });
};

main().catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
