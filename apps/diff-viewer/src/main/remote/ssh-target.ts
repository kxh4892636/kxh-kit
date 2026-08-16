// SSH 连接目标与远程仓库键 (issue 06): 解析用户输入的 ssh config Host 别名或
// user@host[:port], 校验远程路径, 生成会话/评论存储键 (ssh://user@host/path) 与
// vscode-remote 协议 URL。
// 安全约束: target 各分量走严格白名单字符集 (user/host 只允许 [a-zA-Z0-9._-]),
// 从输入侧排除 shell 元字符与 ssh 选项注入 (如以 - 开头的 -oProxyCommand);
// 远程路径与 rev 进入远程命令行时一律经 shellQuote 单引号包裹。
// v1 不支持 IPv6 字面量 (含 [::1] 形态), 需要时经 ssh config Host 别名表达。

export interface SshTarget {
  // ssh config Host 别名或主机名/IP
  host: string;
  user?: string;
  port?: number;
}

export const REMOTE_REPO_KEY_SCHEME = "ssh://";

// user 与 host (别名/主机名/IPv4) 共用白名单; 排除空白、shell 元字符与前导 '-' (防选项注入)
const USER_PATTERN = /^[a-zA-Z0-9._-]+$/;
const HOST_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const parseSshTarget = (input: string): SshTarget => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("SSH target is empty");
  }
  // 白名单之外的一切字符 (空白/分号/反引号/$()/管道/斜杠等) 直接拒绝
  if (!/^[a-zA-Z0-9._@:-]+$/.test(trimmed)) {
    throw new Error(`Invalid SSH target: ${input}`);
  }

  const atParts = trimmed.split("@");
  if (atParts.length > 2) {
    throw new Error(`Invalid SSH target: ${input}`);
  }
  const user = atParts.length === 2 ? atParts[0] : undefined;
  const hostPart = atParts.length === 2 ? atParts[1] : atParts[0];

  const colonParts = hostPart.split(":");
  if (colonParts.length > 2) {
    throw new Error(`Invalid SSH target: ${input}`);
  }
  const host = colonParts[0];
  const portText = colonParts.length === 2 ? colonParts[1] : undefined;

  if (user !== undefined && !USER_PATTERN.test(user)) {
    throw new Error(`Invalid SSH user: ${user}`);
  }
  if (!HOST_PATTERN.test(host)) {
    throw new Error(`Invalid SSH host: ${host}`);
  }

  let port: number | undefined;
  if (portText !== undefined) {
    if (!/^[0-9]+$/.test(portText)) {
      throw new Error(`Invalid SSH port: ${portText}`);
    }
    port = Number.parseInt(portText, 10);
    if (port < 1 || port > 65535) {
      throw new Error(`Invalid SSH port: ${portText}`);
    }
  }

  return user !== undefined || port !== undefined
    ? {
        host,
        ...(user !== undefined ? { user } : {}),
        ...(port !== undefined ? { port } : {}),
      }
    : { host };
};

// ssh 命令行的 destination 段; port 不经此处而经 -p 传参
export const formatSshDestination = (target: SshTarget): string =>
  target.user !== undefined ? `${target.user}@${target.host}` : target.host;

// 远程路径必须为绝对 POSIX 路径; 拒绝控制字符 (多行/回车注入)。
// 不拒绝空格/单引号等合法文件名字符 —— 进入远程命令行时由 shellQuote 处理
export const validateRemotePath = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    throw new Error(`Remote path must be an absolute POSIX path: ${input}`);
  }
  // oxlint-disable-next-line no-control-regex -- 有意匹配控制字符: 拒绝命令行换行注入
  if (/[\0-\x1f\x7f]/.test(trimmed)) {
    throw new Error(`Remote path contains control characters: ${input}`);
  }
  if (trimmed.length > 1 && trimmed.endsWith("/")) {
    return trimmed.replace(/\/+$/, "");
  }
  return trimmed;
};

// POSIX 单引号包裹: 引号内除单引号本身外无转义语义, 单引号以 '\'' 序列表达
export const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

// 会话/评论存储键: ssh://<destination>[:port]/<remotePath>
export const buildRemoteRepoKey = (target: SshTarget, remotePath: string): string => {
  const portSegment = target.port !== undefined ? `:${target.port}` : "";
  return `${REMOTE_REPO_KEY_SCHEME}${formatSshDestination(target)}${portSegment}${remotePath}`;
};

export const isRemoteRepoKey = (key: string): boolean => key.startsWith(REMOTE_REPO_KEY_SCHEME);

export const parseRemoteRepoKey = (key: string): { target: SshTarget; remotePath: string } => {
  if (!isRemoteRepoKey(key)) {
    throw new Error(`Not a remote repository key: ${key}`);
  }
  const rest = key.slice(REMOTE_REPO_KEY_SCHEME.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex <= 0) {
    throw new Error(`Invalid remote repository key: ${key}`);
  }
  const target = parseSshTarget(rest.slice(0, slashIndex));
  const remotePath = validateRemotePath(rest.slice(slashIndex));
  return { target, remotePath };
};

// vscode-remote 协议: vscode://vscode-remote/ssh-remote+<destination>/<path>:<line>。
// destination 含 user@host[:port]; 非默认端口依赖较新版本 VSCode 的 destination 解析
// (旧版本建议改用 ssh config Host 别名), 属已知的尽力而为行为
export const buildVscodeRemoteUrl = (
  target: SshTarget,
  absoluteRemoteFilePath: string,
  line?: number,
): string => {
  const portSegment = target.port !== undefined ? `:${target.port}` : "";
  const lineSegment = line !== undefined && line > 0 ? `:${line}` : "";
  const encodedPath = absoluteRemoteFilePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `vscode://vscode-remote/ssh-remote+${formatSshDestination(target)}${portSegment}${encodedPath}${lineSegment}`;
};
