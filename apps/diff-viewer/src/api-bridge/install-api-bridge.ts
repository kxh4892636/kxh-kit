// 把 fork client 的 /api/* 网络调用接管到 Electron IPC (无 HTTP server)。
// 模式参考 difit 上游 src/site/utils/staticApiBridge.ts 的 monkey-patch:
// window.fetch 路由到 bridge.invokeApi 并重新构造 Response; /api/watch 的 SSE 以
// EventSource polyfill + IPC 事件实现; /api/heartbeat 是 server 自杀逻辑的遗留,
// 桌面端无此需求, 以本地 no-op 保持 client 代码不变。
import type { ApiBridgeRequest, ApiBridgeResponse, DiffViewerBridge } from "./api-bridge-types";

const extractUrl = (input: RequestInfo | URL): URL => {
  if (input instanceof URL) {
    return input;
  }
  if (input instanceof Request) {
    return new URL(input.url, window.location.origin);
  }
  return new URL(String(input), window.location.origin);
};

const toQuery = (searchParams: URLSearchParams): Record<string, string> => {
  const query: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
};

const readRequestBody = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | undefined> => {
  if (typeof init?.body === "string") {
    return init.body;
  }
  if (input instanceof Request) {
    const text = await input.text();
    return text === "" ? undefined : text;
  }
  return undefined;
};

const toResponse = (raw: ApiBridgeResponse): Response => {
  const headers = new Headers(raw.headers ?? {});
  if (raw.blob) {
    return new Response(raw.blob, { status: raw.status, headers });
  }
  return new Response(raw.body ?? "", { status: raw.status, headers });
};

type EventListener = (event: Event) => unknown;

// EventSource 的最小实现: 只覆盖 fork client 用到的 on* 属性、addEventListener 与 close。
// 消息来自 bridge.onWatchEvent 的 IPC 推送, 而非真正的 HTTP SSE 流。
class BridgeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  readonly url: string;
  readonly withCredentials = false;
  readyState = BridgeEventSource.CONNECTING;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;

  private readonly listeners = new Map<string, Set<EventListener>>();
  private unsubscribeWatch: (() => void) | null = null;
  private readonly isWatch: boolean;

  constructor(url: string | URL, bridge: DiffViewerBridge) {
    this.url = String(url);
    this.isWatch = this.url.endsWith("/api/watch");

    queueMicrotask(() => {
      if (this.readyState === BridgeEventSource.CLOSED) {
        return;
      }
      this.readyState = BridgeEventSource.OPEN;
      this.dispatch("open", new Event("open"));

      if (this.isWatch) {
        this.unsubscribeWatch = bridge.onWatchEvent((payload) => {
          if (this.readyState !== BridgeEventSource.OPEN) {
            return;
          }
          this.dispatch("message", new MessageEvent("message", { data: payload }));
        });
        void bridge.openWatch();
      }
    });
  }

  private dispatch(type: string, event: Event): void {
    if (type === "open") {
      this.onopen?.call(this as unknown as EventSource, event);
    } else if (type === "message" && event instanceof MessageEvent) {
      this.onmessage?.call(this as unknown as EventSource, event);
    } else if (type === "error") {
      this.onerror?.call(this as unknown as EventSource, event);
    }
    for (const listener of this.listeners.get(type) ?? []) {
      listener.call(this, event);
    }
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    if (this.readyState === BridgeEventSource.CLOSED) {
      return;
    }
    this.readyState = BridgeEventSource.CLOSED;
    this.unsubscribeWatch?.();
    this.unsubscribeWatch = null;
  }
}

export const installApiBridge = (): void => {
  const bridge = window.diffViewerBridge;
  if (!bridge) {
    // 非 Electron 环境 (纯浏览器 dev / 单测) 不接管网络
    return;
  }

  const originalFetch = window.fetch.bind(window);
  const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
  // 收窄后的 bridge 供 class 表达式闭包使用 (TS 不会在 class 表达式内保持外层收窄)
  const activeBridge = bridge;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = extractUrl(input);
    if (!requestUrl.pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    const request: ApiBridgeRequest = {
      method: (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
      path: requestUrl.pathname,
      query: toQuery(requestUrl.searchParams),
      body: await readRequestBody(input, init),
    };

    const raw = await bridge.invokeApi(request);
    return toResponse(raw);
  }) as typeof window.fetch;

  window.EventSource = class extends BridgeEventSource {
    constructor(url: string | URL) {
      super(url, activeBridge);
    }
  } as unknown as typeof EventSource;

  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    writable: true,
    value: (url: string | URL, data?: BodyInit | null): boolean => {
      const target = typeof url === "string" ? url : url.toString();
      const parsed = new URL(target, window.location.origin);
      if (parsed.pathname.startsWith("/api/")) {
        // beacon 语义是 fire-and-forget, 不等待 IPC 结果
        void bridge.invokeApi({
          method: "POST",
          path: parsed.pathname,
          query: toQuery(parsed.searchParams),
          body: typeof data === "string" ? data : undefined,
        });
        return true;
      }
      if (originalSendBeacon) {
        return originalSendBeacon(url, data);
      }
      return true;
    },
  });
};
