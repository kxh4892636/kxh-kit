import type { WorkerLease } from "./worker-lease.js";

export interface WorkerHeartbeat {
  isHealthy: () => boolean;
  renew: () => Promise<boolean>;
  stop: () => Promise<void>;
}

export const startWorkerHeartbeat = (lease: WorkerLease, intervalMs: number): WorkerHeartbeat => {
  let healthy = true;
  let renewal = Promise.resolve();
  let stopped = false;
  const renew = async (): Promise<boolean> => {
    renewal = renewal
      .then(async (): Promise<void> => {
        if (!stopped && !(await lease.renew())) healthy = false;
      })
      .catch((error: unknown): void => {
        healthy = false;
        const kind = error instanceof Error ? error.name : "UnknownError";
        process.stderr.write(`Limit Resume worker lease renewal failed: ${kind}\n`);
      });
    await renewal;
    return healthy;
  };
  const timer = setInterval((): void => {
    void renew();
  }, intervalMs);
  const stop = async (): Promise<void> => {
    stopped = true;
    clearInterval(timer);
    await renewal;
  };
  return { isHealthy: (): boolean => healthy, renew, stop };
};
