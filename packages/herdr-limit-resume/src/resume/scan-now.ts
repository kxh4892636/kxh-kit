import { DiagnosticLog } from "../diagnostic-log.js";
import { HerdrSocket, type HerdrPort } from "../herdr-socket.js";
import { addResult, newResult, resumeAgent, type ResumeResult } from "./resume-agent.js";

export interface ScanNowOptions {
  requestTimeoutMs?: number;
  socketPath: string;
  stateDir: string;
}

export const runScanNow = async (options: ScanNowOptions): Promise<ResumeResult> => {
  const herdr: HerdrPort = new HerdrSocket(options.socketPath, options.requestTimeoutMs);
  const diagnostics = await DiagnosticLog.open(options.stateDir, options.socketPath);
  const entries = await herdr.listAgents();
  const result = newResult();
  for (const entry of entries) {
    if (!entry.ok) {
      result.failed += 1;
      await diagnostics.failure(
        `agent-list:${entry.index}`,
        "unknown",
        "invalid_agent_response",
        "manual",
      );
      continue;
    }
    const agentResult = await resumeAgent(entry.agent, {
      diagnostics,
      herdr,
      mode: "resume",
      socketPath: options.socketPath,
      stateDir: options.stateDir,
      trigger: "manual",
    });
    addResult(result, agentResult);
  }
  return result;
};
