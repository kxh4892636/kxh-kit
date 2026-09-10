import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "@deepseek-ai/cordis";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";

export const name = "opencode-session";
export const inject = ["llm"];

const SESSION_HEADER = "x-opencode-session";

// 创建流、拉取以及关闭都可能触发请求；仅包裹 next() 会遗漏同步派发与 finally。
const bindStream = (
  storage: AsyncLocalStorage<string | undefined>,
  sessionId: string | undefined,
  next: () => AsyncIterable<StreamChunk>,
): AsyncIterableIterator<StreamChunk> => {
  const iterator = storage.run(
    sessionId,
    (): AsyncIterator<StreamChunk> => next()[Symbol.asyncIterator](),
  );
  const stream: AsyncIterableIterator<StreamChunk> = {
    [Symbol.asyncIterator]: (): AsyncIterableIterator<StreamChunk> => stream,
    next: async (): Promise<IteratorResult<StreamChunk>> =>
      storage.run(sessionId, (): Promise<IteratorResult<StreamChunk>> => iterator.next()),
    return: async (value?: unknown): Promise<IteratorResult<StreamChunk>> =>
      storage.run(
        sessionId,
        (): Promise<IteratorResult<StreamChunk>> | IteratorResult<StreamChunk> =>
          iterator.return?.(value) ?? { done: true, value },
      ),
    throw: async (error?: unknown): Promise<IteratorResult<StreamChunk>> =>
      storage.run(sessionId, (): Promise<IteratorResult<StreamChunk>> => {
        if (iterator.throw !== undefined) return iterator.throw(error);
        throw error;
      }),
  };
  return stream;
};

export const apply = (ctx: Context): void => {
  const storage = new AsyncLocalStorage<string | undefined>();
  ctx.effect((): (() => void) => {
    const original = globalThis.fetch;
    let active = true;
    const patched: typeof fetch = (input, init) => {
      const sessionId = active ? storage.getStore() : undefined;
      if (sessionId === undefined) return original(input, init);
      // fetch 的 init.headers 整体优先于 Request.headers；复制后写入，避免污染调用方。
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set(SESSION_HEADER, sessionId);
      return original(input, { ...init, headers });
    };
    globalThis.fetch = patched;
    return (): void => {
      // 后续插件可能再包装 fetch；此时保留它的包装并让当前层退化为透传。
      active = false;
      if (globalThis.fetch === patched) globalThis.fetch = original;
      storage.disable();
    };
  });
  ctx.on(
    "llm/stream",
    (
      options: GenerateOptions,
      next: () => AsyncIterable<StreamChunk>,
    ): AsyncIterable<StreamChunk> => bindStream(storage, options.sessionId || undefined, next),
    { global: true, prepend: true },
  );
};
