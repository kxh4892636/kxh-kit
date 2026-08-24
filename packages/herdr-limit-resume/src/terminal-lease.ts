import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isRecord } from "./boundary.js";

interface LeaseSlotDocument {
  owner: string;
  slot: number;
  version: 1;
}

export interface TerminalLeaseOptions {
  leaseMs?: number;
  now?: () => number;
  socketPath: string;
  stateDir: string;
  terminalId: string;
}

const DEFAULT_LEASE_SLOT_MS = 30_000;

export class TerminalLease {
  readonly #owner: string;
  readonly #slotPaths: string[];

  private constructor(slotPaths: string[], owner: string) {
    this.#slotPaths = slotPaths;
    this.#owner = owner;
  }

  public static async tryAcquire(options: TerminalLeaseOptions): Promise<TerminalLease | null> {
    const slotMs = options.leaseMs ?? DEFAULT_LEASE_SLOT_MS;
    const now = options.now ?? Date.now;
    await mkdir(options.stateDir, { recursive: true });
    const key = leaseKey(options.socketPath, options.terminalId);
    const firstSlot = Math.floor(now() / slotMs);
    const owner = randomUUID();
    const slotPaths = [firstSlot, firstSlot + 1].map((slot: number): string =>
      join(options.stateDir, `lock-${key}-${slot}.json`),
    );
    const acquired: string[] = [];
    for (const [index, slotPath] of slotPaths.entries()) {
      try {
        const document: LeaseSlotDocument = { owner, slot: firstSlot + index, version: 1 };
        await writeFile(slotPath, `${JSON.stringify(document)}\n`, {
          encoding: "utf8",
          flag: "wx",
        });
        acquired.push(slotPath);
      } catch (error: unknown) {
        await releaseOwnedSlots(acquired, owner);
        if (isAlreadyExists(error)) return null;
        throw error;
      }
    }
    return new TerminalLease(slotPaths, owner);
  }

  public async release(): Promise<void> {
    await releaseOwnedSlots(this.#slotPaths, this.#owner);
  }
}

const leaseKey = (socketPath: string, terminalId: string): string =>
  createHash("sha256").update(`${socketPath}\0${terminalId}`).digest("hex").slice(0, 24);

const releaseOwnedSlots = async (slotPaths: string[], owner: string): Promise<void> => {
  for (const slotPath of slotPaths) {
    try {
      const document = parseDocument(JSON.parse(await readFile(slotPath, "utf8")) as unknown);
      if (document.owner === owner) await unlink(slotPath);
    } catch (error: unknown) {
      if (!isMissing(error)) throw error;
    }
  }
};

const parseDocument = (value: unknown): LeaseSlotDocument => {
  if (
    !isRecord(value) ||
    value["version"] !== 1 ||
    typeof value["owner"] !== "string" ||
    typeof value["slot"] !== "number"
  ) {
    throw new Error("Limit Resume lease slot has an invalid shape");
  }
  return { owner: value["owner"], slot: value["slot"], version: 1 };
};

const isAlreadyExists = (error: unknown): boolean => isRecord(error) && error["code"] === "EEXIST";

const isMissing = (error: unknown): boolean => isRecord(error) && error["code"] === "ENOENT";
