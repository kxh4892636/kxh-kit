import {
  AGENT_STATUS,
  HerdrSocket,
  type AgentInfo,
  type AgentRead,
  type HerdrPort,
} from "./herdr-socket.js";
import { createHash } from "node:crypto";
import { ResumeState } from "./resume-state.js";
import { DiagnosticLog, type DiagnosticReason } from "./diagnostic-log.js";

export interface ScanNowOptions {
  requestTimeoutMs?: number;
  socketPath: string;
  stateDir: string;
}

export interface ScanNowResult {
  failed: number;
  resumed: number;
  scanned: number;
  skipped: number;
}

const messageRegion = (text: string): string =>
  Array.from(text.replace(/\s+/gu, " ").trim()).slice(-55).join("");

const isRateLimitRegion = (text: string): boolean => {
  const region = messageRegion(text);
  return region.includes("429") && /limit/iu.test(region);
};

const fingerprintFor = (region: string): string =>
  createHash("sha256").update(region).digest("hex");

const isStillCurrent = (before: AgentInfo, current: AgentInfo, read: AgentRead): boolean =>
  current.terminal_id === before.terminal_id &&
  isPromptable(current) &&
  current.state_change_seq === before.state_change_seq &&
  current.revision === read.revision;

const isPromptable = (agent: AgentInfo): boolean =>
  agent.agent_status === AGENT_STATUS.idle || agent.agent_status === AGENT_STATUS.done;

export const runScanNow = async (options: ScanNowOptions): Promise<ScanNowResult> => {
  const herdr: HerdrPort = new HerdrSocket(options.socketPath, options.requestTimeoutMs);
  const state = await ResumeState.open(options.stateDir, options.socketPath);
  const diagnostics = await DiagnosticLog.open(options.stateDir, options.socketPath);
  const entries = await herdr.listAgents();
  const result: ScanNowResult = { failed: 0, resumed: 0, scanned: 0, skipped: 0 };
  for (const entry of entries) {
    if (!entry.ok) {
      result.failed += 1;
      await recordFailure(
        diagnostics,
        `agent-list:${entry.index}`,
        "unknown",
        "invalid_agent_response",
      );
      continue;
    }
    const { agent } = entry;
    try {
      if (
        agent.agent_status === AGENT_STATUS.working ||
        agent.agent_status === AGENT_STATUS.unknown
      ) {
        await state.clear(agent.terminal_id);
        continue;
      }
      if (!isPromptable(agent)) continue;
      result.scanned += 1;
      const read = await herdr.readDetection(agent.pane_id);
      const region = messageRegion(read.text);
      if (!isRateLimitRegion(region)) {
        result.skipped += 1;
        continue;
      }
      const fingerprint = fingerprintFor(region);
      if (state.isHandled(agent.terminal_id, fingerprint)) {
        result.skipped += 1;
        continue;
      }
      const current = await herdr.getAgent(agent.pane_id);
      if (!isStillCurrent(agent, current, read)) {
        result.skipped += 1;
        continue;
      }
      await herdr.promptAgent(agent.pane_id, "go on");
      await state.record(agent.terminal_id, fingerprint);
      result.resumed += 1;
    } catch {
      result.failed += 1;
      const reason: DiagnosticReason = isPromptable(agent)
        ? "agent_operation_failed"
        : "state_update_failed";
      await recordFailure(diagnostics, agent.pane_id, agent.terminal_id, reason);
    }
  }
  return result;
};

const recordFailure = async (
  diagnostics: DiagnosticLog,
  paneId: string,
  terminalId: string,
  reason: DiagnosticReason,
): Promise<void> => {
  try {
    await diagnostics.failure(paneId, terminalId, reason);
  } catch (error: unknown) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Limit Resume could not write diagnostics: ${kind}\n`);
  }
};
