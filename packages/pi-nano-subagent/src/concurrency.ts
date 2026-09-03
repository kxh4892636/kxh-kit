export interface ParentConcurrencyLimiter {
  readonly run: <T>(signal: AbortSignal | undefined, work: () => Promise<T>) => Promise<T>;
}

interface QueueEntry {
  readonly signal: AbortSignal | undefined;
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: Error) => void;
  readonly onAbort: () => void;
}

const queuedCancellationError = (): Error =>
  new Error("subagent call was cancelled while waiting for its parent concurrency slot");

export const createParentConcurrencyLimiter = (
  maxConcurrency: number,
): ParentConcurrencyLimiter => {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError("parent concurrency must be a positive integer");
  }
  let active = 0;
  const queue: QueueEntry[] = [];

  const removeEntry = (entry: QueueEntry): void => {
    const index = queue.indexOf(entry);
    if (index >= 0) queue.splice(index, 1);
  };

  const createRelease = (): (() => void) => {
    let released = false;
    return (): void => {
      if (released) return;
      released = true;
      active -= 1;
      dispatch();
    };
  };

  const dispatch = (): void => {
    while (active < maxConcurrency && queue.length > 0) {
      const entry = queue.shift();
      if (entry === undefined) return;
      entry.signal?.removeEventListener("abort", entry.onAbort);
      if (entry.signal?.aborted === true) {
        entry.reject(queuedCancellationError());
        continue;
      }
      active += 1;
      entry.resolve(createRelease());
    }
  };

  const acquire = (signal: AbortSignal | undefined): Promise<() => void> => {
    if (signal?.aborted === true) return Promise.reject(queuedCancellationError());
    if (active < maxConcurrency) {
      active += 1;
      return Promise.resolve(createRelease());
    }
    return new Promise<() => void>((resolve, reject): void => {
      const entry: QueueEntry = {
        signal,
        resolve,
        reject,
        onAbort: (): void => {
          removeEntry(entry);
          reject(queuedCancellationError());
        },
      };
      queue.push(entry);
      signal?.addEventListener("abort", entry.onAbort, { once: true });
    });
  };

  const run = async <T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> => {
    const release = await acquire(signal);
    try {
      return await work();
    } finally {
      release();
    }
  };

  return Object.freeze({ run });
};
