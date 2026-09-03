import { describe, expect, it } from "vitest";

import { createParentConcurrencyLimiter } from "./concurrency.js";

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

const deferred = (): Deferred => {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve): void => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (): void => resolvePromise?.(),
  };
};

const nextMicrotask = async (): Promise<void> => Promise.resolve();

describe("per-parent concurrency", (): void => {
  it("rejects a limit that could never release queued work", (): void => {
    expect((): unknown => createParentConcurrencyLimiter(0)).toThrow("positive integer");
  });

  it("runs at most the configured number and starts queued work FIFO", async (): Promise<void> => {
    const limiter = createParentConcurrencyLimiter(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = gates.map(
      (gate: Deferred, index: number): Promise<number> =>
        limiter.run(undefined, async (): Promise<number> => {
          started.push(index);
          await gate.promise;
          return index;
        }),
    );

    await nextMicrotask();
    expect(started).toEqual([0, 1]);

    gates[1]?.resolve();
    await nextMicrotask();
    await nextMicrotask();
    expect(started).toEqual([0, 1, 2]);

    gates[0]?.resolve();
    await nextMicrotask();
    await nextMicrotask();
    expect(started).toEqual([0, 1, 2, 3]);

    gates[2]?.resolve();
    gates[3]?.resolve();
    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2, 3]);
  });

  it("removes an aborted queued call without running it", async (): Promise<void> => {
    const limiter = createParentConcurrencyLimiter(1);
    const gate = deferred();
    let queuedRan = false;
    const first = limiter.run(undefined, async (): Promise<void> => gate.promise);
    const controller = new AbortController();
    const queued = limiter.run(controller.signal, async (): Promise<void> => {
      queuedRan = true;
    });

    await nextMicrotask();
    controller.abort();
    await expect(queued).rejects.toThrow("cancelled while waiting");
    gate.resolve();
    await first;
    expect(queuedRan).toBe(false);
  });

  it("releases a slot when work fails and rejects pre-aborted calls", async (): Promise<void> => {
    const limiter = createParentConcurrencyLimiter(1);
    const failed = limiter.run(undefined, async (): Promise<void> => {
      throw new Error("work failed");
    });
    await expect(failed).rejects.toThrow("work failed");
    await expect(limiter.run(undefined, async (): Promise<string> => "next")).resolves.toBe("next");

    const controller = new AbortController();
    controller.abort();
    await expect(
      limiter.run(controller.signal, async (): Promise<void> => undefined),
    ).rejects.toThrow("cancelled while waiting");
  });
});
