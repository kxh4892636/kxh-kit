import { appendFile, mkdir } from "node:fs/promises";
import { sessionFile } from "./session-file.js";

export type DiagnosticReason =
  | "agent_operation_failed"
  | "invalid_agent_response"
  | "state_update_failed";

export type DiagnosticTrigger = "event" | "manual" | "worker";

interface FailureDiagnostic {
  pane_id: string;
  reason: DiagnosticReason;
  result: "failed";
  terminal_id: string;
  timestamp: string;
  trigger: DiagnosticTrigger;
}

export class DiagnosticLog {
  readonly #filePath: string;

  private constructor(filePath: string) {
    this.#filePath = filePath;
  }

  public static async open(stateDir: string, socketPath: string): Promise<DiagnosticLog> {
    await mkdir(stateDir, { recursive: true });
    return new DiagnosticLog(sessionFile(stateDir, socketPath, "diagnostics", "jsonl"));
  }

  public async failure(
    paneId: string,
    terminalId: string,
    reason: DiagnosticReason,
    trigger: DiagnosticTrigger,
  ): Promise<void> {
    const diagnostic: FailureDiagnostic = {
      pane_id: paneId,
      reason,
      result: "failed",
      terminal_id: terminalId,
      timestamp: new Date().toISOString(),
      trigger,
    };
    try {
      await appendFile(this.#filePath, `${JSON.stringify(diagnostic)}\n`, "utf8");
    } catch (error: unknown) {
      const kind = error instanceof Error ? error.name : "UnknownError";
      process.stderr.write(`Limit Resume could not write diagnostics: ${kind}\n`);
    }
  }
}
