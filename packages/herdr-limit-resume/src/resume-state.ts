import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isRecord } from "./boundary.js";
import { sessionFile } from "./session-file.js";

interface StateDocument {
  handled: Record<string, string>;
  version: 1;
}

const emptyDocument = (): StateDocument => ({ handled: {}, version: 1 });

const parseDocument = (value: unknown): StateDocument => {
  if (!isRecord(value) || value["version"] !== 1 || !isRecord(value["handled"])) {
    throw new Error("Limit Resume state has an invalid shape");
  }
  const handled: Record<string, string> = {};
  for (const [terminalId, fingerprint] of Object.entries(value["handled"])) {
    if (typeof fingerprint !== "string")
      throw new Error("Limit Resume state has an invalid fingerprint");
    handled[terminalId] = fingerprint;
  }
  return { handled, version: 1 };
};

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

  public isHandled(terminalId: string, fingerprint: string): boolean {
    return this.#document.handled[terminalId] === fingerprint;
  }

  public async record(terminalId: string, fingerprint: string): Promise<void> {
    this.#document.handled[terminalId] = fingerprint;
    await this.#save();
  }

  public async clear(terminalId: string): Promise<void> {
    if (!(terminalId in this.#document.handled)) return;
    delete this.#document.handled[terminalId];
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
