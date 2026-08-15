// preload 注入的 bridge 与主进程 IPC 之间的传输协议。
// renderer 的 /api/* fetch 被序列化为 ApiBridgeRequest 经 ipcRenderer.invoke 送往主进程,
// 主进程处理后返回 ApiBridgeResponse, 由 bridge 在 renderer 侧重新构造 Response。
export interface ApiBridgeRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  // fork 的 client 只发送 JSON/文本字符串 body (含 sendBeacon), 不传输流式或二进制 body
  body?: string;
}

export interface ApiBridgeResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  // 二进制响应 (如 /api/blob/*) 以 ArrayBuffer 经 IPC structured clone 传输
  blob?: ArrayBuffer;
}

export interface DiffViewerBridge {
  invokeApi: (request: ApiBridgeRequest) => Promise<ApiBridgeResponse>;
  openWatch: () => Promise<unknown>;
  // 返回取消订阅函数
  onWatchEvent: (callback: (payload: string) => void) => () => void;
}

declare global {
  interface Window {
    diffViewerBridge?: DiffViewerBridge;
  }
}
