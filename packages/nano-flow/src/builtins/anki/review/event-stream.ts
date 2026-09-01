interface WaitingConsumer<Event> {
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (result: IteratorResult<Event>) => void;
}

export const createEventStream = <Event>(
  produce: (emit: (event: Event) => void) => Promise<void>,
): AsyncIterable<Event> => {
  const buffered: IteratorResult<Event>[] = [];
  let waiting: WaitingConsumer<Event> | undefined;
  let completed = false;
  let failure: unknown;
  const deliver = (result: IteratorResult<Event>): void => {
    if (waiting === undefined) {
      buffered.push(result);
      return;
    }
    const consumer = waiting;
    waiting = undefined;
    consumer.resolve(result);
  };
  const emit = (event: Event): void => deliver({ done: false, value: event });
  const finish = (): void => {
    completed = true;
    deliver({ done: true, value: undefined });
  };
  const fail = (error: unknown): void => {
    failure = error;
    completed = true;
    if (waiting !== undefined) {
      const consumer = waiting;
      waiting = undefined;
      consumer.reject(error);
    }
  };
  const next = async (): Promise<IteratorResult<Event>> => {
    const result = buffered.shift();
    if (result !== undefined) return result;
    if (failure !== undefined) throw failure;
    if (completed) return { done: true, value: undefined };
    return new Promise<IteratorResult<Event>>(
      (
        resolve: (result: IteratorResult<Event>) => void,
        reject: (reason?: unknown) => void,
      ): void => {
        waiting = { resolve, reject };
      },
    );
  };
  produce(emit).then(finish, fail);
  return {
    [Symbol.asyncIterator]: (): AsyncIterator<Event> => ({ next }),
  };
};
