// renderer / preload / main 三方共享的 IPC 通道名, 集中在协议层避免字符串散落。
export const API_CHANNELS = {
  request: "api:request",
  watchOpen: "api:watch:open",
  watchEvent: "api:watch:event",
} as const;
