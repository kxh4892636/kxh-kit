import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isRecord } from "./boundary.js";
import { sessionFile } from "./session-file.js";

interface LegacyStateDocument {
  handled: Record<string, string>;
  version: 1;
}

interface ResumeRecord {
  fingerprint: string;
  lastSentAt: number;
}

interface StateDocument {
  resumes: Record<string, ResumeRecord>;
  version: 2;
}

const emptyDocument = (): StateDocument => ({ resumes: {}, version: 2 });

const parseDocument = (value: unknown): StateDocument => {
  if (!isRecord(value)) {
    throw new Error("Limit Resume state has an invalid shape");
  }
  if (value["version"] === 1) return parseLegacyDocument(value);
  if (value["version"] !== 2 || !isRecord(value["resumes"])) {
    throw new Error("Limit Resume state has an invalid shape");
  }
  const resumes: Record<string, ResumeRecord> = {};
  for (const [terminalId, record] of Object.entries(value["resumes"])) {
    if (!isRecord(record) || typeof record["fingerprint"] !== "string") {
      throw new Error("Limit Resume state has an invalid resume record");
    }
    if (!isTimestamp(record["lastSentAt"])) {
      throw new Error("Limit Resume state has an invalid resume timestamp");
    }
    resumes[terminalId] = {
      fingerprint: record["fingerprint"],
      lastSentAt: record["lastSentAt"],
    };
  }
  return { resumes, version: 2 };
};

const parseLegacyDocument = (
  value: LegacyStateDocument | Record<string, unknown>,
): StateDocument => {
  if (!isRecord(value["handled"])) {
    throw new Error("Limit Resume state has an invalid shape");
  }
  const resumes: Record<string, ResumeRecord> = {};
  for (const [terminalId, fingerprint] of Object.entries(value["handled"])) {
    if (typeof fingerprint !== "string")
      throw new Error("Limit Resume state has an invalid fingerprint");
    resumes[terminalId] = { fingerprint, lastSentAt: 0 };
  }
  return { resumes, version: 2 };
};

const isTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export class ResumeState {
  readonly #document: StateDocument;
  readonly #filePath: string;

  private constructor(filePath: string, document: StateDocument) {
    this.#filePath = filePath;
    this.#document = document;
  }

  public static async open(stateDir: string, socketPath: string): Promise<ResumeState> {
    await mkdir(stateDir, { recursive: true });
    const filePath = sessionFile(stateDir, socketPath, "resume", "json");
    try {
      const document = parseDocument(JSON.parse(await readFile(filePath, "utf8")) as unknown);
      return new ResumeState(filePath, document);
    } catch (error: unknown) {
      if (isMissingFile(error)) return new ResumeState(filePath, emptyDocument());
      throw error;
    }
  }

  public canRetry(
    terminalId: string,
    fingerprint: string,
    now: number,
    retryIntervalMs: number,
  ): boolean {
    const record = this.#document.resumes[terminalId];
    return (
      record === undefined ||
      record.fingerprint !== fingerprint ||
      now - record.lastSentAt >= retryIntervalMs
    );
  }

  public async record(terminalId: string, fingerprint: string, sentAt: number): Promise<void> {
    this.#document.resumes[terminalId] = { fingerprint, lastSentAt: sentAt };
    await this.#save();
  }

  public async clear(terminalId: string): Promise<void> {
    if (!(terminalId in this.#document.resumes)) return;
    delete this.#document.resumes[terminalId];
    await this.#save();
  }

  async #save(): Promise<void> {
    const temporaryPath = `${this.#filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.#document)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, this.#filePath);
  }
}

const isMissingFile = (error: unknown): boolean => isRecord(error) && error["code"] === "ENOENT";
