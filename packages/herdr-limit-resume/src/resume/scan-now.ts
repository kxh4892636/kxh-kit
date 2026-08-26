import { DiagnosticLog } from "../diagnostic-log.js";
import type { DiagnosticTrigger } from "../diagnostic-log.js";
import { HerdrSocket, type HerdrPort } from "../herdr-socket.js";
import { addResult, newResult, resumeAgent, type ResumeResult } from "./resume-agent.js";

export interface ScanNowOptions {
  now?: () => number;
  requestTimeoutMs?: number;
  retryIntervalMs?: number;
  socketPath: string;
  stateDir: string;
  signal?: AbortSignal;
  trigger?: Extract<DiagnosticTrigger, "interval" | "manual" | "startup">;
}

export const runScanNow = async (options: ScanNowOptions): Promise<ResumeResult> => {
  const herdr: HerdrPort = new HerdrSocket(options.socketPath, options.requestTimeoutMs);
  const diagnostics = await DiagnosticLog.open(options.stateDir, options.socketPath);
  const trigger = options.trigger ?? "manual";
  const entries = await herdr.listAgents();
  const result = newResult();
  for (const entry of entries) {
    if (options.signal?.aborted === true) break;
    if (!entry.ok) {
      result.failed += 1;
      await diagnostics.failure(
        `agent-list:${entry.index}`,
        "unknown",
        "invalid_agent_response",
        trigger,
      );
      continue;
    }
    const agentResult = await resumeAgent(entry.agent, {
      diagnostics,
      herdr,
      mode: "resume",
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.retryIntervalMs === undefined
        ? {}
        : { retryIntervalMs: options.retryIntervalMs }),
      socketPath: options.socketPath,
      stateDir: options.stateDir,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      trigger,
    });
    addResult(result, agentResult);
  }
  return result;
};
