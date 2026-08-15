import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { ApiBridgeRequest, ApiBridgeResponse } from "./api-bridge-types";
import { installApiBridge } from "./install-api-bridge";

const createFakeBridge = () => {
  const watchListeners = new Set<(payload: string) => void>();
  const bridge = {
    invokeApi: vi.fn(
      async (_request: ApiBridgeRequest): Promise<ApiBridgeResponse> => ({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    ),
    openWatch: vi.fn(async () => true),
    onWatchEvent: vi.fn((callback: (payload: string) => void) => {
      watchListeners.add(callback);
      return () => {
        watchListeners.delete(callback);
      };
    }),
  };
  return {
    bridge,
    emitWatch: (payload: string) => {
      for (const callback of watchListeners) {
        callback(payload);
      }
    },
  };
};

describe("installApiBridge", () => {
  const originalFetch = window.fetch;
  const OriginalEventSource = window.EventSource;
  const originalSendBeacon = navigator.sendBeacon.bind(navigator);

  beforeEach(() => {
    window.fetch = vi.fn(async () => new Response("{}"));
    window.EventSource = OriginalEventSource;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      writable: true,
      value: originalSendBeacon,
    });
    delete window.diffViewerBridge;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.EventSource = OriginalEventSource;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      writable: true,
      value: originalSendBeacon,
    });
    delete window.diffViewerBridge;
  });

  it("无 bridge 时不接管 window.fetch", () => {
    const fetchBefore = window.fetch;
    installApiBridge();
    expect(window.fetch).toBe(fetchBefore);
  });

  it("把 /api/* GET 请求路由到 invokeApi 并构造 JSON Response", async () => {
    const { bridge } = createFakeBridge();
    bridge.invokeApi.mockResolvedValue({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [], commit: "abc...def" }),
    });
    window.diffViewerBridge = bridge;
    installApiBridge();

    const response = await window.fetch("/api/diff?base=HEAD&target=HEAD%5E");
    expect(bridge.invokeApi).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/diff",
      query: { base: "HEAD", target: "HEAD^" },
      body: undefined,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ files: [], commit: "abc...def" });
  });

  it("转发 POST body 与 method", async () => {
    const { bridge } = createFakeBridge();
    window.diffViewerBridge = bridge;
    installApiBridge();

    await window.fetch("/api/comments?base=a&target=b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threads: [] }),
    });

    expect(bridge.invokeApi).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/comments",
      query: { base: "a", target: "b" },
      body: JSON.stringify({ threads: [] }),
    });
  });

  it("blob 响应以 ArrayBuffer 还原为 Response 二进制体", async () => {
    const { bridge } = createFakeBridge();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    bridge.invokeApi.mockResolvedValue({
      status: 200,
      headers: { "Content-Type": "image/png" },
      blob: bytes.buffer,
    });
    window.diffViewerBridge = bridge;
    installApiBridge();

    const response = await window.fetch("/api/blob/img.png?ref=HEAD");
    expect(response.headers.get("Content-Type")).toBe("image/png");
    const buffer = await response.arrayBuffer();
    expect(new Uint8Array(buffer)).toEqual(bytes);
  });

  it("非 /api/ 请求透传给原生 fetch", async () => {
    const passthrough = window.fetch;
    const { bridge } = createFakeBridge();
    window.diffViewerBridge = bridge;
    installApiBridge();

    await window.fetch("/themeBootstrap.ts");
    expect(bridge.invokeApi).not.toHaveBeenCalled();
    expect(passthrough).toHaveBeenCalledWith("/themeBootstrap.ts", undefined);
  });

  it("EventSource /api/watch: 连接后接收 IPC 推送的消息", async () => {
    const { bridge, emitWatch } = createFakeBridge();
    window.diffViewerBridge = bridge;
    installApiBridge();

    const events: string[] = [];
    const source = new EventSource("/api/watch");
    const opened = new Promise<void>((resolvePromise) => {
      source.onopen = () => resolvePromise();
    });
    source.onmessage = (event) => {
      events.push(String(event.data));
    };
    await opened;

    expect(bridge.onWatchEvent).toHaveBeenCalled();
    expect(bridge.openWatch).toHaveBeenCalled();

    emitWatch(JSON.stringify({ type: "connected" }));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0] as string)).toEqual({ type: "connected" });

    source.close();
    emitWatch(JSON.stringify({ type: "reload" }));
    expect(events).toHaveLength(1);
  });

  it("EventSource /api/heartbeat: 本地 no-op, 不触发 IPC", async () => {
    const { bridge } = createFakeBridge();
    window.diffViewerBridge = bridge;
    installApiBridge();

    const source = new EventSource("/api/heartbeat");
    const opened = new Promise<void>((resolvePromise) => {
      source.onopen = () => resolvePromise();
    });
    await opened;

    expect(bridge.onWatchEvent).not.toHaveBeenCalled();
    expect(bridge.openWatch).not.toHaveBeenCalled();
    source.close();
  });

  it("sendBeacon 把 /api/* 转为 fire-and-forget 的 POST", () => {
    const { bridge } = createFakeBridge();
    window.diffViewerBridge = bridge;
    installApiBridge();

    const accepted = navigator.sendBeacon("/api/comments", JSON.stringify({ threads: [] }));
    expect(accepted).toBe(true);
    expect(bridge.invokeApi).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/comments",
      query: {},
      body: JSON.stringify({ threads: [] }),
    });
  });
});
