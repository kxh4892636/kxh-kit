// renderer / preload / main 三方共享的 IPC 通道名, 集中在协议层避免字符串散落。
export const API_CHANNELS = {
  request: "api:request",
  watchOpen: "api:watch:open",
  watchEvent: "api:watch:event",
  // issue 03 目录打开与嵌套仓库扫描: 桌面端原生能力 (目录对话框/扫描/进度推送),
  // 与上游 difit 的 HTTP API 无对应, 走独立通道而非 /api/* fetch bridge
  workspaceGet: "workspace:get",
  workspacePickDirectory: "workspace:pick-directory",
  workspaceScan: "workspace:scan",
  workspaceScanProgress: "workspace:scan-progress",
  // issue 06 SSH 远程视图: 连接校验+远程扫描与历史连接读取, 同样无 HTTP 对应
  sshConnect: "ssh:connect",
  sshHistory: "ssh:list-history",
} as const;
