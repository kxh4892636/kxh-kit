// preload 注入的 bridge 与主进程 IPC 之间的传输协议。
// renderer 的 /api/* fetch 被序列化为 ApiBridgeRequest 经 ipcRenderer.invoke 送往主进程,
// 主进程处理后返回 ApiBridgeResponse, 由 bridge 在 renderer 侧重新构造 Response。
import type { RepositoryScanResult, ScanProgress } from "../types/repository.js";
import type { SshConnectRequest, SshConnectionEntry } from "../types/ssh.js";

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
  // issue 03 目录打开与嵌套仓库扫描
  // 启动时打开的目录 (argv/env 解析结果, 已 resolve)
  getWorkspace: () => Promise<{ rootPath: string }>;
  // 系统目录选择对话框; 用户取消时返回 null
  pickDirectory: () => Promise<string | null>;
  // 异步扫描, 进度经 onScanProgress 推送 (scanId 用于丢弃过期扫描的事件)
  scanRepositories: (scanId: string, rootPath: string) => Promise<RepositoryScanResult>;
  // 返回取消订阅函数
  onScanProgress: (callback: (scanId: string, progress: ScanProgress) => void) => () => void;
  // issue 06 SSH 远程视图: 连接目标校验 + 远程仓库扫描, 成功即建立远程会话数据源;
  // 失败 (校验/连接/扫描) 以 reject 带错误信息回 renderer
  connectSsh: (payload: SshConnectRequest) => Promise<RepositoryScanResult>;
  // 历史连接列表 (userData 落盘, 最近在前)
  listSshConnections: () => Promise<SshConnectionEntry[]>;
}

declare global {
  interface Window {
    diffViewerBridge?: DiffViewerBridge;
  }
}
