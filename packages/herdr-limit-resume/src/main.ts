import { runAgentStatusEvent } from "./resume/event-handler.js";
import type { ResumeResult } from "./resume/resume-agent.js";
import { runScanNow } from "./resume/scan-now.js";
import { runWorker, type WorkerResult } from "./worker/worker.js";

const main = async (): Promise<void> => {
  const command = process.argv[2];
  const socketPath = process.env["HERDR_SOCKET_PATH"];
  const stateDir = process.env["HERDR_PLUGIN_STATE_DIR"];
  if (socketPath === undefined || stateDir === undefined) {
    throw new Error("HERDR_SOCKET_PATH and HERDR_PLUGIN_STATE_DIR are required");
  }
  const result = await runCommand(command, socketPath, stateDir);
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

const runCommand = async (
  command: string | undefined,
  socketPath: string,
  stateDir: string,
): Promise<ResumeResult | WorkerResult> => {
  if (command === "scan-now") return await runScanNow({ socketPath, stateDir });
  if (command === "worker") return await runWorkerCommand(socketPath, stateDir);
  return await runEventCommand(command, socketPath, stateDir);
};

const runWorkerCommand = async (socketPath: string, stateDir: string): Promise<WorkerResult> => {
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    return await runWorker({ signal: controller.signal, socketPath, stateDir });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
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
