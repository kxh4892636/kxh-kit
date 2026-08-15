// 把纯函数路由 (api-router) 接到 Electron IPC: renderer 的 /api/* 请求经
// preload bridge 由 'api:request' 进入; watch 事件经 'api:watch:event' 推回。
import { ipcMain } from "electron";

import { API_CHANNELS } from "../api-bridge/api-channels.js";
import type { ApiBridgeRequest } from "../api-bridge/api-bridge-types.js";

import type { ApiRouter } from "./api-router.js";

export const registerApiIpc = (router: ApiRouter): void => {
  ipcMain.handle(API_CHANNELS.request, (_event, request: ApiBridgeRequest) =>
    router.handle(request),
  );

  ipcMain.handle(API_CHANNELS.watchOpen, (event) => {
    // watch 通道建立后立即推送初始事件 (当前为 stub 的 connected 事件)
    for (const payload of router.getInitialWatchEvents()) {
      event.sender.send(API_CHANNELS.watchEvent, payload);
    }
    return true;
  });
};
