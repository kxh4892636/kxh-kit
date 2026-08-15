// preload: 以 contextBridge 向 renderer 暴露最小 IPC 原语 (diffViewerBridge),
// fetch/EventSource 的 monkey-patch 逻辑在 renderer 侧的 api-bridge/install-api-bridge.ts,
// 便于在 Vitest happy-dom 环境单测。
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { ApiBridgeResponse, DiffViewerBridge } from "../api-bridge/api-bridge-types.js";

// sandbox 化的 preload 不能 require 本地模块, 通道名在此内联;
// 取值必须与 src/api-bridge/api-channels.ts 保持一致
const API_CHANNELS = {
  request: "api:request",
  watchOpen: "api:watch:open",
  watchEvent: "api:watch:event",
} as const;

const bridge: DiffViewerBridge = {
  invokeApi: (request) =>
    ipcRenderer.invoke(API_CHANNELS.request, request) as Promise<ApiBridgeResponse>,
  openWatch: () => ipcRenderer.invoke(API_CHANNELS.watchOpen),
  onWatchEvent: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: string): void => callback(payload);
    ipcRenderer.on(API_CHANNELS.watchEvent, listener);
    return () => {
      ipcRenderer.removeListener(API_CHANNELS.watchEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld("diffViewerBridge", bridge);
