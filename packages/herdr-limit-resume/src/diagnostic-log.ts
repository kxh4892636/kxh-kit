import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { isRecord } from "./boundary.js";
import { sessionFile, sessionShard } from "./session-file.js";
import { TimeSlotLease } from "./time-slot-lease.js";

export type DiagnosticReason =
  | "agent_operation_failed"
  | "invalid_agent_response"
  | "state_unchanged_after_send"
  | "state_update_failed";

export type DiagnosticTrigger = "event" | "interval" | "manual" | "startup";

interface FailureDiagnostic {
  pane_id: string;
  region_hash: string | null;
  reason: DiagnosticReason;
  result: "failed" | "unchanged";
  session_shard: string;
  terminal_id: string;
  timestamp: string;
  trigger: DiagnosticTrigger;
}

export interface DiagnosticLogOptions {
  maxBytes?: number;
  rotationCount?: number;
}

const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_ROTATION_COUNT = 3;
const LOG_LOCK_RETRY_MS = 50;
const LOG_LOCK_RETRIES = 50;
const LOG_LOCK_SLOT_MS = 1_000;

export class DiagnosticLog {
  readonly #filePath: string;
  readonly #maxBytes: number;
  readonly #rotationCount: number;
  readonly #sessionShard: string;

  private constructor(filePath: string, session: string, options: DiagnosticLogOptions) {
    this.#filePath = filePath;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#rotationCount = options.rotationCount ?? DEFAULT_ROTATION_COUNT;
    this.#sessionShard = session;
  }

  public static async open(
    stateDir: string,
    socketPath: string,
    options: DiagnosticLogOptions = {},
  ): Promise<DiagnosticLog> {
    await mkdir(stateDir, { recursive: true });
    return new DiagnosticLog(
      sessionFile(stateDir, socketPath, "diagnostics", "jsonl"),
      sessionShard(socketPath),
      options,
    );
  }

  public async failure(
    paneId: string,
    terminalId: string,
    reason: DiagnosticReason,
    trigger: DiagnosticTrigger,
    regionHash: string | null = null,
  ): Promise<void> {
    const diagnostic: FailureDiagnostic = {
      pane_id: paneId,
      region_hash: regionHash,
      reason,
      result: "failed",
      session_shard: this.#sessionShard,
      terminal_id: terminalId,
      timestamp: new Date().toISOString(),
      trigger,
    };
    await this.#write(diagnostic);
  }

  public async unchanged(
    paneId: string,
    terminalId: string,
    trigger: DiagnosticTrigger,
    regionHash: string,
  ): Promise<void> {
    await this.#write({
      pane_id: paneId,
      reason: "state_unchanged_after_send",
      region_hash: regionHash,
      result: "unchanged",
      session_shard: this.#sessionShard,
      terminal_id: terminalId,
      timestamp: new Date().toISOString(),
      trigger,
    });
  }

  async #write(diagnostic: FailureDiagnostic): Promise<void> {
    let lease: TimeSlotLease | null = null;
    try {
      lease = await acquireLogLease(this.#filePath);
      const line = `${JSON.stringify(diagnostic)}\n`;
      await this.#rotateIfNeeded(Buffer.byteLength(line));
      await appendFile(this.#filePath, line, "utf8");
    } catch (error: unknown) {
      const kind = error instanceof Error ? error.name : "UnknownError";
      process.stderr.write(`Limit Resume could not write diagnostics: ${kind}\n`);
    } finally {
      try {
        await lease?.release();
      } catch (error: unknown) {
        const kind = error instanceof Error ? error.name : "UnknownError";
        process.stderr.write(`Limit Resume could not release diagnostic lock: ${kind}\n`);
      }
    }
  }

  async #rotateIfNeeded(additionalBytes: number): Promise<void> {
    const currentBytes = await fileSize(this.#filePath);
    if (currentBytes + additionalBytes <= this.#maxBytes) return;
    for (let index = this.#rotationCount; index >= 1; index -= 1) {
      const destination = `${this.#filePath}.${index}`;
      await rm(destination, { force: true });
      const source = index === 1 ? this.#filePath : `${this.#filePath}.${index - 1}`;
      try {
        await rename(source, destination);
      } catch (error: unknown) {
        if (!isMissing(error)) throw error;
      }
    }
  }
}

const acquireLogLease = async (filePath: string): Promise<TimeSlotLease> => {
  for (let attempt = 0; attempt < LOG_LOCK_RETRIES; attempt += 1) {
    const lease = await TimeSlotLease.tryAcquire({
      resource: `diagnostic\0${filePath}`,
      slotMs: LOG_LOCK_SLOT_MS,
      stateDir: dirname(filePath),
    });
    if (lease !== null) return lease;
    await delay(LOG_LOCK_RETRY_MS);
  }
  throw new Error("Limit Resume diagnostic lock timed out");
};

const delay = async (delayMs: number): Promise<void> =>
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, delayMs);
  });

const fileSize = async (filePath: string): Promise<number> => {
  try {
    return (await stat(filePath)).size;
  } catch (error: unknown) {
    if (isMissing(error)) return 0;
    throw error;
  }
};

const isMissing = (error: unknown): boolean => isRecord(error) && error["code"] === "ENOENT";
