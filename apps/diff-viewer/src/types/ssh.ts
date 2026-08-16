// SSH 远程连接 (issue 06) 的共享传输类型: renderer 连接表单 → preload bridge →
// 主进程 IPC 的载荷, 以及历史连接列表的条目形状。
export interface SshConnectRequest {
  // 用户输入的连接目标: ssh config Host 别名或 user@host[:port]
  target: string;
  // 远程绝对 POSIX 路径 (扫描根目录)
  path: string;
}

export interface SshConnectionEntry {
  // 用户输入的原始 target (Host 别名或 user@host[:port])
  target: string;
  // 远程绝对 POSIX 路径
  path: string;
  // 最近一次成功连接时间 (ISO 字符串)
  lastUsedAt: string;
}
