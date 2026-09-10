import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import { Context } from "@deepseek-ai/cordis";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as plugin from "./main.ts";

const chunk: StreamChunk = { type: "text-delta", index: 0, text: "ok" };
const options = (sessionId?: string, provider: string = "custom-provider"): GenerateOptions => ({
  provider,
  model: "test-model",
  messages: [],
  ...(sessionId === undefined
    ? {}
    : { sessionId: sessionId as NonNullable<GenerateOptions["sessionId"]> }),
});
const drain = async (stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> => {
  const result: StreamChunk[] = [];
  for await (const item of stream) result.push(item);
  return result;
};

let ctx: Context;
const nativeFetch = globalThis.fetch;
let stop: () => Promise<void>;
const mount = async (): Promise<void> => {
  ctx = new Context();
  ctx.provide("llm", {});
  const fiber = await ctx.plugin(plugin);
  stop = fiber.dispose;
};
const stream = (
  sessionId: string | undefined,
  next: () => AsyncIterable<StreamChunk>,
  provider?: string,
): AsyncIterable<StreamChunk> => ctx.waterfall("llm/stream", options(sessionId, provider), next);
const requestStream = (
  input: Parameters<typeof fetch>[0] = "https://model.invalid/chat",
  init?: RequestInit,
): AsyncIterable<StreamChunk> =>
  (async function* (): AsyncGenerator<StreamChunk> {
    await fetch(input, init);
    yield chunk;
  })();

beforeEach((): void => {
  stop = async (): Promise<void> => {};
});
afterEach(async (): Promise<void> => {
  await stop();
  if (ctx !== undefined) await ctx.fiber.dispose();
  globalThis.fetch = nativeFetch;
  vi.restoreAllMocks();
});

// fetch 是外部传输边界；Cordis 插件装配与 waterfall 使用真实实现。
describe("模型请求会话头", (): void => {
  it.each(["deepseek", "opencode", "opencode-go", "anthropic", "custom-route"])(
    "为 %s provider 注入真实会话 ID",
    async (provider: string): Promise<void> => {
      const sent = vi.fn<typeof fetch>().mockResolvedValue(new Response());
      globalThis.fetch = sent;
      await mount();
      expect(
        await drain(
          stream("session-42", (): AsyncIterable<StreamChunk> => requestStream(), provider),
        ),
      ).toEqual([chunk]);
      expect(new Headers(sent.mock.calls[0]?.[1]?.headers).get("x-opencode-session")).toBe(
        "session-42",
      );
    },
  );

  it("覆盖同名头，保留 Request 的请求体及其他头，不修改输入", async (): Promise<void> => {
    const sent = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    globalThis.fetch = sent;
    await mount();
    const request = new Request("https://model.invalid/chat", {
      method: "POST",
      body: "payload",
      headers: { "X-OpenCode-Session": "wrong", authorization: "Bearer test" },
    });
    await drain(stream("correct", (): AsyncIterable<StreamChunk> => requestStream(request)));
    const call = sent.mock.calls[0];
    expect(call?.[0]).toBe(request);
    expect(new Headers(call?.[1]?.headers).get("x-opencode-session")).toBe("correct");
    expect(new Headers(call?.[1]?.headers).get("authorization")).toBe("Bearer test");
    expect(request.headers.get("x-opencode-session")).toBe("wrong");
    expect(await request.text()).toBe("payload");
  });

  it.each([new Headers({ "x-custom": "init" }), { "x-custom": "init" }, [["x-custom", "init"]]])(
    "遵守 init.headers 优先级并保留 body 和 signal",
    async (headers: unknown): Promise<void> => {
      const sent = vi.fn<typeof fetch>().mockResolvedValue(new Response());
      globalThis.fetch = sent;
      await mount();
      const request = new Request("https://model.invalid/chat", {
        headers: { "x-old": "discard" },
      });
      const init: RequestInit = {
        headers: headers as NonNullable<RequestInit["headers"]>,
        method: "POST",
        body: "new-body",
        signal: new AbortController().signal,
      };
      await drain(
        stream("session-init", (): AsyncIterable<StreamChunk> => requestStream(request, init)),
      );
      const actual = sent.mock.calls[0]?.[1];
      expect(new Headers(actual?.headers).get("x-custom")).toBe("init");
      expect(new Headers(actual?.headers).has("x-old")).toBe(false);
      expect(new Headers(actual?.headers).get("x-opencode-session")).toBe("session-init");
      expect(actual?.body).toBe("new-body");
      expect(actual?.signal).toBe(init.signal);
      expect(new Headers(init.headers).has("x-opencode-session")).toBe(false);
    },
  );

  it("并发会话、重试和连续轮次的头值保持独立", async (): Promise<void> => {
    const values: (string | null)[] = [];
    globalThis.fetch = async (
      _input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ): Promise<Response> => {
      values.push(new Headers(init?.headers).get("x-opencode-session"));
      return new Response();
    };
    await mount();
    let releaseA: () => void = (): void => {};
    const gateA = new Promise<void>((resolve: () => void): void => {
      releaseA = resolve;
    });
    const repeated = (gate: Promise<void>): AsyncIterable<StreamChunk> =>
      (async function* (): AsyncGenerator<StreamChunk> {
        await gate;
        await fetch("https://model.invalid/first");
        await Promise.resolve();
        await fetch("https://model.invalid/retry");
        yield chunk;
      })();
    const first = drain(stream("A", (): AsyncIterable<StreamChunk> => repeated(gateA)));
    await drain(stream("B", (): AsyncIterable<StreamChunk> => repeated(Promise.resolve())));
    releaseA();
    await first;
    await drain(stream("A", (): AsyncIterable<StreamChunk> => requestStream()));
    expect(values).toEqual(["B", "B", "A", "A", "A"]);
  });

  it("同步派发及 iterator 创建时发起的请求也带头", async (): Promise<void> => {
    const sent = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    globalThis.fetch = sent;
    await mount();
    const pending: Promise<Response>[] = [];
    await drain(
      stream("eager", (): AsyncIterable<StreamChunk> => {
        pending.push(fetch("https://model.invalid/dispatch"));
        return {
          [Symbol.asyncIterator]: (): AsyncIterator<StreamChunk> => {
            pending.push(fetch("https://model.invalid/iterator"));
            return requestStream()[Symbol.asyncIterator]();
          },
        };
      }),
    );
    await Promise.all(pending);
    expect(
      sent.mock.calls.map((call: Parameters<typeof fetch>): string | null =>
        new Headers(call[1]?.headers).get("x-opencode-session"),
      ),
    ).toEqual(["eager", "eager", "eager"]);
  });

  it.each([undefined, ""])(
    "没有会话 %s 时透传且不继承外层会话",
    async (missing: string | undefined): Promise<void> => {
      const values: (string | null)[] = [];
      globalThis.fetch = async (
        _input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ): Promise<Response> => {
        values.push(new Headers(init?.headers).get("x-opencode-session"));
        return new Response();
      };
      await mount();
      await drain(
        stream(
          "parent",
          (): AsyncIterable<StreamChunk> =>
            (async function* (): AsyncGenerator<StreamChunk> {
              await drain(stream(missing, (): AsyncIterable<StreamChunk> => requestStream()));
              await drain(stream("child", (): AsyncIterable<StreamChunk> => requestStream()));
              await fetch("https://model.invalid/parent");
              yield chunk;
            })(),
        ),
      );
      await fetch("https://tool.invalid/outside");
      expect(values).toEqual([null, "child", "parent", null]);
    },
  );

  it("流关闭和 throw 中的请求保留会话，错误不被吞掉", async (): Promise<void> => {
    const values: (string | null)[] = [];
    globalThis.fetch = async (
      _input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ): Promise<Response> => {
      values.push(new Headers(init?.headers).get("x-opencode-session"));
      return new Response();
    };
    await mount();
    const cleanup = (): AsyncIterable<StreamChunk> =>
      (async function* (): AsyncGenerator<StreamChunk> {
        try {
          yield chunk;
        } finally {
          await fetch("https://model.invalid/cleanup");
        }
      })();
    const first = stream("close", cleanup)[Symbol.asyncIterator]();
    await first.next();
    await first.return?.();
    const second = stream("throw", cleanup)[Symbol.asyncIterator]();
    await second.next();
    const error = new Error("cancelled");
    await expect(second.throw?.(error)).rejects.toBe(error);
    expect(values).toEqual(["close", "throw"]);
  });

  it("下游缺少 return/throw 时按迭代器协议完成或抛错", async (): Promise<void> => {
    await mount();
    const source: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]: (): AsyncIterator<StreamChunk> => ({
        next: async (): Promise<IteratorResult<StreamChunk>> => ({ done: false, value: chunk }),
      }),
    };
    const iterator = stream("bare", (): AsyncIterable<StreamChunk> => source)[
      Symbol.asyncIterator
    ]();
    expect(await iterator.return?.("closed")).toEqual({ done: true, value: "closed" });
    const error = new Error("injected");
    await expect(iterator.throw?.(error)).rejects.toBe(error);
  });

  it("派发和传输失败按原样传播且不泄露上下文", async (): Promise<void> => {
    const error = new Error("network failure");
    const sent = vi.fn<typeof fetch>().mockRejectedValue(error);
    globalThis.fetch = sent;
    await mount();
    expect(
      (): AsyncIterable<StreamChunk> =>
        stream("sync", (): never => {
          throw error;
        }),
    ).toThrow(error);
    await expect(
      drain(stream("failed", (): AsyncIterable<StreamChunk> => requestStream())),
    ).rejects.toBe(error);
    await expect(fetch("https://tool.invalid/outside")).rejects.toBe(error);
    expect(sent.mock.calls[1]?.[1]).toBeUndefined();
  });

  it("卸载移除监听、恢复 fetch，已创建的流也停止注入", async (): Promise<void> => {
    const sent = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    globalThis.fetch = sent;
    await mount();
    const existing = stream("before-unload", (): AsyncIterable<StreamChunk> => requestStream());
    await stop();
    expect(globalThis.fetch).toBe(sent);
    await drain(existing);
    await drain(stream("after-unload", (): AsyncIterable<StreamChunk> => requestStream()));
    expect(
      sent.mock.calls.every((call: Parameters<typeof fetch>): boolean => call[1] === undefined),
    ).toBe(true);
  });

  it("卸载保留后来安装的 fetch 包装且旧层不再注入", async (): Promise<void> => {
    const sent = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    globalThis.fetch = sent;
    await mount();
    const existing = stream("inactive", (): AsyncIterable<StreamChunk> => requestStream());
    const previous = globalThis.fetch;
    const later = vi.fn<typeof fetch>(
      (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> =>
        previous(input, init),
    );
    globalThis.fetch = later;
    await stop();
    expect(globalThis.fetch).toBe(later);
    await drain(existing);
    expect(later).toHaveBeenCalledOnce();
    expect(sent.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("真实 HTTP 服务收到会话头与完整 POST 请求", async (): Promise<void> => {
    const received: {
      session: string | string[] | undefined;
      body: string;
      auth: string | undefined;
    }[] = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse): void => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (part: string): void => {
        body += part;
      });
      req.on("end", (): void => {
        received.push({
          session: req.headers["x-opencode-session"],
          body,
          auth: req.headers.authorization,
        });
        res.end("ok");
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      await mount();
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("no server port");
      await drain(
        stream(
          "wire-session",
          (): AsyncIterable<StreamChunk> =>
            requestStream(new URL(`http://127.0.0.1:${address.port}/chat`), {
              method: "POST",
              body: '{"model":"test"}',
              headers: { authorization: "Bearer local" },
            }),
        ),
      );
      expect(received).toEqual([
        { session: "wire-session", body: '{"model":"test"}', auth: "Bearer local" },
      ]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve: () => void, reject: (reason?: unknown) => void): void => {
        server.close((error?: Error): void => (error === undefined ? resolve() : reject(error)));
      });
    }
  });
});
