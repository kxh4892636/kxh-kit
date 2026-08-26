import { isRecord } from "../boundary.js";
import { DiagnosticLog } from "../diagnostic-log.js";
import {
  AGENT_STATUS,
  HerdrSocket,
  type AgentInfo,
  type AgentStatus,
  type HerdrPort,
} from "../herdr-socket.js";
import { isCandidateStatus, resumeAgent, type ResumeResult } from "./resume-agent.js";

export interface AgentStatusEventOptions {
  eventJson: string;
  leaseMs?: number;
  now?: () => number;
  requestTimeoutMs?: number;
  retryIntervalMs?: number;
  socketPath: string;
  stateDir: string;
}

interface AgentStatusEvent {
  paneId: string;
  status: AgentStatus;
}

export const runAgentStatusEvent = async (
  options: AgentStatusEventOptions,
): Promise<ResumeResult> => {
  const event = parseEvent(options.eventJson);
  if (event === null) return skippedResult();
  const herdr: HerdrPort = new HerdrSocket(options.socketPath, options.requestTimeoutMs);
  const diagnostics = await DiagnosticLog.open(options.stateDir, options.socketPath);
  let initial: AgentInfo;
  try {
    initial = await herdr.getAgent(event.paneId);
  } catch {
    await diagnostics.failure(event.paneId, "unknown", "agent_operation_failed", "event");
    return failedResult();
  }
  return await resumeAgent(initial, {
    diagnostics,
    herdr,
    ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
    mode: isCandidateStatus(event.status) ? "resume" : "clear-only",
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.retryIntervalMs === undefined ? {} : { retryIntervalMs: options.retryIntervalMs }),
    socketPath: options.socketPath,
    stateDir: options.stateDir,
    trigger: "event",
  });
};

const parseEvent = (raw: string): AgentStatusEvent | null => {
  try {
    const envelope = JSON.parse(raw) as unknown;
    if (
      !isRecord(envelope) ||
      envelope["event"] !== "pane.agent_status_changed" ||
      !isRecord(envelope["data"])
    ) {
      return null;
    }
    const paneId = envelope["data"]["pane_id"];
    const status = envelope["data"]["agent_status"];
    if (
      typeof paneId !== "string" ||
      typeof status !== "string" ||
      !Object.values(AGENT_STATUS).includes(status as AgentStatus)
    ) {
      return null;
    }
    return { paneId, status: status as AgentStatus };
  } catch {
    return null;
  }
};

const failedResult = (): ResumeResult => ({ failed: 1, resumed: 0, scanned: 0, skipped: 0 });

const skippedResult = (): ResumeResult => ({ failed: 0, resumed: 0, scanned: 0, skipped: 1 });
