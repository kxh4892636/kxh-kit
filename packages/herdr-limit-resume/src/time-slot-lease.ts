import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isRecord } from "./boundary.js";

interface LeaseSlotDocument {
  owner: string;
  slot: number;
  version: 1;
}

export interface TimeSlotLeaseOptions {
  now?: () => number;
  resource: string;
  slotMs: number;
  stateDir: string;
}

export class TimeSlotLease {
  readonly #key: string;
  readonly #now: () => number;
  readonly #owner: string;
  readonly #owned = new Map<number, string>();
  readonly #slotMs: number;
  readonly #stateDir: string;

  private constructor(options: TimeSlotLeaseOptions) {
    this.#key = createHash("sha256").update(options.resource).digest("hex").slice(0, 24);
    this.#now = options.now ?? Date.now;
    this.#owner = randomUUID();
    this.#slotMs = options.slotMs;
    this.#stateDir = options.stateDir;
  }

  public static async tryAcquire(options: TimeSlotLeaseOptions): Promise<TimeSlotLease | null> {
    if (!Number.isSafeInteger(options.slotMs) || options.slotMs <= 0) {
      throw new Error("Limit Resume lease slot duration must be a positive safe integer");
    }
    await mkdir(options.stateDir, { recursive: true });
    const lease = new TimeSlotLease(options);
    return (await lease.renew()) ? lease : null;
  }

  public async renew(): Promise<boolean> {
    const firstSlot = Math.floor(this.#now() / this.#slotMs);
    const desired = new Set([firstSlot, firstSlot + 1]);
    const acquiredNow: number[] = [];
    for (const slot of desired) {
      if (this.#owned.has(slot)) continue;
      const slotPath = join(this.#stateDir, `lock-${this.#key}-${slot}.json`);
      try {
        const document: LeaseSlotDocument = { owner: this.#owner, slot, version: 1 };
        await writeFile(slotPath, `${JSON.stringify(document)}\n`, {
          encoding: "utf8",
          flag: "wx",
        });
        this.#owned.set(slot, slotPath);
        acquiredNow.push(slot);
      } catch (error: unknown) {
        await this.#releaseSlots(acquiredNow);
        if (isAlreadyExists(error)) return false;
        throw error;
      }
    }
    const expiredOwned = [...this.#owned.keys()].filter(
      (slot: number): boolean => !desired.has(slot),
    );
    await this.#releaseSlots(expiredOwned);
    return true;
  }

  public async release(): Promise<void> {
    await this.#releaseSlots([...this.#owned.keys()]);
  }

  async #releaseSlots(slots: number[]): Promise<void> {
    for (const slot of slots) {
      const slotPath = this.#owned.get(slot);
      if (slotPath === undefined) continue;
      try {
        const document = parseDocument(JSON.parse(await readFile(slotPath, "utf8")) as unknown);
        if (document.owner === this.#owner) await unlink(slotPath);
      } catch (error: unknown) {
        if (!isMissing(error)) throw error;
      } finally {
        this.#owned.delete(slot);
      }
    }
  }
}

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
