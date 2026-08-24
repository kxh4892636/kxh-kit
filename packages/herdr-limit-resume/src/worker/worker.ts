import { DiagnosticLog } from "../diagnostic-log.js";
import { HerdrSocket } from "../herdr-socket.js";
import { runScanNow } from "../resume/scan-now.js";
import { startWorkerHeartbeat } from "./worker-heartbeat.js";
import { WorkerLease } from "./worker-lease.js";

export type WorkerScanTrigger = "interval" | "startup";
export type WorkerStopReason =
  | "disabled_or_missing"
  | "duplicate"
  | "herdr_unavailable"
  | "stopped";

export interface WorkerResult {
  reason: WorkerStopReason;
  rounds: number;
}

export interface WorkerOptions {
  intervalMs?: number;
  heartbeatMs?: number;
  isPluginEnabled?: () => Promise<boolean>;
  now?: () => number;
  scan?: (trigger: WorkerScanTrigger) => Promise<void>;
  signal?: AbortSignal;
  socketPath: string;
  stateDir: string;
  wait?: (delayMs: number) => Promise<"stop" | "tick">;
}

const PLUGIN_ID = "kxh.limit-resume";

export const runWorker = async (options: WorkerOptions): Promise<WorkerResult> => {
  const intervalMs = options.intervalMs ?? 30_000;
  const heartbeatMs = options.heartbeatMs ?? 10_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new Error("Limit Resume worker interval must be a positive safe integer");
  }
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0) {
    throw new Error("Limit Resume worker heartbeat must be a positive safe integer");
  }
  const now = options.now ?? Date.now;
  const lease = await WorkerLease.tryAcquire({
    ...(options.now === undefined ? {} : { now: options.now }),
    socketPath: options.socketPath,
    stateDir: options.stateDir,
  });
  if (lease === null) return { reason: "duplicate", rounds: 0 };
  const heartbeat = startWorkerHeartbeat(lease, heartbeatMs);

  const herdr = new HerdrSocket(options.socketPath);
  const isPluginEnabled =
    options.isPluginEnabled ??
    (async (): Promise<boolean> => await herdr.isPluginEnabled(PLUGIN_ID));
  const scan =
    options.scan ??
    (async (trigger: WorkerScanTrigger): Promise<void> => {
      await runScanNow({
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        socketPath: options.socketPath,
        stateDir: options.stateDir,
        trigger,
      });
    });
  const wait =
    options.wait ??
    (async (delayMs: number): Promise<"stop" | "tick"> =>
      await waitForTick(delayMs, options.signal));
  let rounds = 0;
  let nextScanAt = now();
  let trigger: WorkerScanTrigger = "startup";

  try {
    while (true) {
      if (isStopped(options.signal)) return { reason: "stopped", rounds };
      if (!(await heartbeat.renew())) return { reason: "duplicate", rounds };
      let enabled: boolean;
      try {
        enabled = await isPluginEnabled();
      } catch {
        await recordWorkerFailure(options.stateDir, options.socketPath, trigger);
        return { reason: "herdr_unavailable", rounds };
      }
      if (!enabled) return { reason: "disabled_or_missing", rounds };
      if (isStopped(options.signal)) return { reason: "stopped", rounds };
      try {
        await scan(trigger);
      } catch {
        await recordWorkerFailure(options.stateDir, options.socketPath, trigger);
      }
      rounds += 1;
      if (!heartbeat.isHealthy()) return { reason: "duplicate", rounds };
      nextScanAt += intervalMs;
      const delayMs = Math.max(0, nextScanAt - now());
      if ((await wait(delayMs)) === "stop") return { reason: "stopped", rounds };
      trigger = "interval";
    }
  } finally {
    await heartbeat.stop();
    await lease.release();
  }
};

const isStopped = (signal: AbortSignal | undefined): boolean => signal?.aborted === true;

const recordWorkerFailure = async (
  stateDir: string,
  socketPath: string,
  trigger: WorkerScanTrigger,
): Promise<void> => {
  try {
    const diagnostics = await DiagnosticLog.open(stateDir, socketPath);
    await diagnostics.failure("worker", "unknown", "agent_operation_failed", trigger);
  } catch (error: unknown) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Limit Resume could not open diagnostics: ${kind}\n`);
  }
};

const waitForTick = async (
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<"stop" | "tick"> => {
  if (signal?.aborted === true) return "stop";
  return await new Promise<"stop" | "tick">((resolve: (result: "stop" | "tick") => void): void => {
    let settled = false;
    const finish = (result: "stop" | "tick"): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", stop);
      resolve(result);
    };
    const stop = (): void => finish("stop");
    const timeout = setTimeout((): void => finish("tick"), delayMs);
    signal?.addEventListener("abort", stop, { once: true });
  });
};
