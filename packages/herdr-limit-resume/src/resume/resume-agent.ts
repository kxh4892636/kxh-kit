import { createHash } from "node:crypto";
import {
  type AgentInfo,
  type AgentRead,
  type AgentStatus,
  type HerdrPort,
} from "../herdr-socket.js";
import { DiagnosticLog, type DiagnosticTrigger } from "../diagnostic-log.js";
import { ResumeState } from "../resume-state.js";
import { TerminalLease } from "../terminal-lease.js";

export interface ResumeResult {
  failed: number;
  resumed: number;
  scanned: number;
  skipped: number;
}

export interface ResumeAgentOptions {
  diagnostics: DiagnosticLog;
  herdr: HerdrPort;
  leaseMs?: number;
  mode: "clear-only" | "resume";
  now?: () => number;
  socketPath: string;
  stateDir: string;
  signal?: AbortSignal;
  trigger: DiagnosticTrigger;
}

type DeliveryPath = "pane_input" | "prompt";

const DELIVERY_PATH = {
  blocked: "pane_input",
  done: "prompt",
  idle: "prompt",
  unknown: undefined,
  working: undefined,
} as const satisfies Record<AgentStatus, DeliveryPath | undefined>;

const DETECTION_REGION_CODE_POINTS = 233;

export const resumeAgent = async (
  initial: AgentInfo,
  options: ResumeAgentOptions,
): Promise<ResumeResult> => {
  let lease: TerminalLease | null;
  try {
    lease = await TerminalLease.tryAcquire({
      ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
      ...(options.now === undefined ? {} : { now: options.now }),
      socketPath: options.socketPath,
      stateDir: options.stateDir,
      terminalId: initial.terminal_id,
    });
  } catch {
    await options.diagnostics.failure(
      initial.pane_id,
      initial.terminal_id,
      "state_update_failed",
      options.trigger,
    );
    return failedResult();
  }
  if (lease === null) return skippedResult();
  let scanned = 0;
  try {
    const current = await options.herdr.getAgent(initial.pane_id);
    if (!isSameStateCycle(initial, current)) return skippedResult();
    if (options.mode === "clear-only" && deliveryPath(current) !== undefined) {
      return skippedResult();
    }
    scanned = deliveryPath(current) === undefined ? 0 : 1;
    const state = await ResumeState.open(options.stateDir, options.socketPath);
    return await processCurrentAgent(current, state, options);
  } catch {
    await options.diagnostics.failure(
      initial.pane_id,
      initial.terminal_id,
      "agent_operation_failed",
      options.trigger,
    );
    return failedResult(scanned);
  } finally {
    try {
      await lease.release();
    } catch {
      await options.diagnostics.failure(
        initial.pane_id,
        initial.terminal_id,
        "state_update_failed",
        options.trigger,
      );
    }
  }
};

const processCurrentAgent = async (
  agent: AgentInfo,
  state: ResumeState,
  options: ResumeAgentOptions,
): Promise<ResumeResult> => {
  const path = deliveryPath(agent);
  if (path === undefined) {
    await state.clear(agent.terminal_id);
    return emptyResult();
  }
  const read = await options.herdr.readDetection(agent.pane_id);
  const region = messageRegion(read.text);
  if (!isRateLimitRegion(region)) return { ...emptyResult(), scanned: 1, skipped: 1 };
  const fingerprint = fingerprintFor(region);
  if (state.isHandled(agent.terminal_id, fingerprint)) {
    return { ...emptyResult(), scanned: 1, skipped: 1 };
  }
  const current = await options.herdr.getAgent(agent.pane_id);
  if (!isStillCurrent(agent, current, read)) {
    return { ...emptyResult(), scanned: 1, skipped: 1 };
  }
  if (options.signal?.aborted === true) {
    return { ...emptyResult(), scanned: 1, skipped: 1 };
  }
  if (path === "pane_input") {
    await options.herdr.sendPaneInput(agent.pane_id, "go on", ["enter"]);
  } else {
    await options.herdr.promptAgent(agent.pane_id, "go on");
  }
  await state.record(agent.terminal_id, fingerprint);
  await recordUnchangedState(agent, fingerprint, options);
  return { ...emptyResult(), resumed: 1, scanned: 1 };
};

const recordUnchangedState = async (
  before: AgentInfo,
  fingerprint: string,
  options: ResumeAgentOptions,
): Promise<void> => {
  try {
    const after = await options.herdr.getAgent(before.pane_id);
    if (isSameStateCycle(before, after)) {
      await options.diagnostics.unchanged(
        before.pane_id,
        before.terminal_id,
        options.trigger,
        fingerprint,
      );
    }
  } catch {
    await options.diagnostics.failure(
      before.pane_id,
      before.terminal_id,
      "agent_operation_failed",
      options.trigger,
      fingerprint,
    );
  }
};

const deliveryPath = (agent: AgentInfo): DeliveryPath | undefined =>
  DELIVERY_PATH[agent.agent_status];

export const isCandidateStatus = (status: AgentStatus): boolean =>
  DELIVERY_PATH[status] !== undefined;

const isStillCurrent = (before: AgentInfo, current: AgentInfo, read: AgentRead): boolean =>
  current.terminal_id === before.terminal_id &&
  deliveryPath(current) === deliveryPath(before) &&
  current.state_change_seq === before.state_change_seq &&
  current.revision === read.revision;

const isSameStateCycle = (before: AgentInfo, current: AgentInfo): boolean =>
  current.terminal_id === before.terminal_id &&
  deliveryPath(current) === deliveryPath(before) &&
  current.state_change_seq === before.state_change_seq;

const messageRegion = (text: string): string =>
  Array.from(text.replace(/\s+/gu, " ").trim()).slice(-DETECTION_REGION_CODE_POINTS).join("");

const isRateLimitRegion = (text: string): boolean => {
  const region = messageRegion(text);
  return region.includes("429") && /limit/iu.test(region);
};

const fingerprintFor = (region: string): string =>
  createHash("sha256").update(region).digest("hex");

const emptyResult = (): ResumeResult => ({ failed: 0, resumed: 0, scanned: 0, skipped: 0 });

const failedResult = (scanned = 0): ResumeResult => ({ ...emptyResult(), failed: 1, scanned });

const skippedResult = (): ResumeResult => ({ ...emptyResult(), skipped: 1 });

export const addResult = (target: ResumeResult, addition: ResumeResult): void => {
  target.failed += addition.failed;
  target.resumed += addition.resumed;
  target.scanned += addition.scanned;
  target.skipped += addition.skipped;
};

export const newResult = (): ResumeResult => emptyResult();
