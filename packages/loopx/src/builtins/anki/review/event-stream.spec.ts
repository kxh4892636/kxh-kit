import { describe, expect, test } from "vitest";
import { createEventStream } from "./event-stream";

describe("event stream boundaries", (): void => {
  test("buffers synchronous events and completion", async (): Promise<void> => {
    const iterator = createEventStream<number>(async (emit): Promise<void> => {
      emit(1);
      emit(2);
    })[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  test("delivers an event directly to a waiting consumer", async (): Promise<void> => {
    let emitEvent: ((event: string) => void) | undefined;
    let finish: (() => void) | undefined;
    const stream = createEventStream<string>(
      (emit): Promise<void> =>
        new Promise<void>((resolve): void => {
          emitEvent = emit;
          finish = resolve;
        }),
    );
    const iterator = stream[Symbol.asyncIterator]();
    const waiting = iterator.next();
    emitEvent?.("ready");
    await expect(waiting).resolves.toEqual({ done: false, value: "ready" });
    finish?.();
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  test("rejects a waiting consumer when production fails", async (): Promise<void> => {
    let rejectProduction: ((reason?: unknown) => void) | undefined;
    const error = new Error("failed");
    const iterator = createEventStream<number>(
      (): Promise<void> =>
        new Promise<void>((_resolve, reject): void => {
          rejectProduction = reject;
        }),
    )[Symbol.asyncIterator]();
    const waiting = iterator.next();
    rejectProduction?.(error);
    await expect(waiting).rejects.toBe(error);
    await expect(iterator.next()).rejects.toBe(error);
  });

  test("surfaces a failure buffered before consumption", async (): Promise<void> => {
    const error = new Error("early");
    const iterator = createEventStream<number>(async (): Promise<never> => Promise.reject(error))[
      Symbol.asyncIterator
    ]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(iterator.next()).rejects.toBe(error);
  });
});
