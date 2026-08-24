import { TimeSlotLease } from "./time-slot-lease.js";

export interface TerminalLeaseOptions {
  leaseMs?: number;
  now?: () => number;
  socketPath: string;
  stateDir: string;
  terminalId: string;
}

const DEFAULT_LEASE_SLOT_MS = 30_000;

export class TerminalLease {
  readonly #lease: TimeSlotLease;

  private constructor(lease: TimeSlotLease) {
    this.#lease = lease;
  }

  public static async tryAcquire(options: TerminalLeaseOptions): Promise<TerminalLease | null> {
    const lease = await TimeSlotLease.tryAcquire({
      ...(options.now === undefined ? {} : { now: options.now }),
      resource: `terminal\0${options.socketPath}\0${options.terminalId}`,
      slotMs: options.leaseMs ?? DEFAULT_LEASE_SLOT_MS,
      stateDir: options.stateDir,
    });
    return lease === null ? null : new TerminalLease(lease);
  }

  public async release(): Promise<void> {
    await this.#lease.release();
  }
}
