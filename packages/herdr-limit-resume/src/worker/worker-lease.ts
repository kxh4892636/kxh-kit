import { TimeSlotLease } from "../time-slot-lease.js";

export interface WorkerLeaseOptions {
  now?: () => number;
  socketPath: string;
  stateDir: string;
}

const WORKER_LEASE_SLOT_MS = 30_000;

export class WorkerLease {
  readonly #lease: TimeSlotLease;

  private constructor(lease: TimeSlotLease) {
    this.#lease = lease;
  }

  public static async tryAcquire(options: WorkerLeaseOptions): Promise<WorkerLease | null> {
    const lease = await TimeSlotLease.tryAcquire({
      ...(options.now === undefined ? {} : { now: options.now }),
      resource: `worker\0${options.socketPath}`,
      slotMs: WORKER_LEASE_SLOT_MS,
      stateDir: options.stateDir,
    });
    return lease === null ? null : new WorkerLease(lease);
  }

  public async renew(): Promise<boolean> {
    return await this.#lease.renew();
  }

  public async release(): Promise<void> {
    await this.#lease.release();
  }
}
