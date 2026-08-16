// SSH 远程执行器 (issue 06): spawn 本机 OpenSSH ssh CLI 执行远程命令。
// 认证完全复用本机 ssh 配置 (~/.ssh/config 的 Host 别名、密钥、agent、known_hosts),
// 不自实现; ControlMaster/ControlPersist 让同一目标的多条命令复用一条连接,
// 避免每次执行都重新握手 (diff/scan 一次会话有十几条命令)。
// 防注入: 远程命令行以 单引号包裹 逐参数拼接 (shellQuote), target 各分量在
// ssh-target.ts 已过白名单校验; BatchMode=yes 保证认证类问题快速报错而非挂起。
// 已知取舍: win32 默认关闭 mux (见 createSshExecutor 内注), 逐命令建连更慢但可用。
import { tmpdir } from "os";
import { join } from "path";

import type { CommandExecutor, ExecOptions, ExecResult } from "./executor.js";
import { runSpawnedProcess, type SpawnImpl } from "./local-executor.js";
import { formatSshDestination, shellQuote, type SshTarget } from "./ssh-target.js";

export interface SshExecutorOptions {
  // ControlMaster socket 目录; Windows 的 AF_UNIX socket 路径长度受限 (~108 字符,
  // ssh 还会在文件名后追加 ~17 字符随机后缀), 默认直接用临时目录根 + 短文件名
  // (不用 userData, 路径深); 在 win32 上传入此选项同时视为强制开启 mux (逃生舱)
  controlPathDir?: string;
  controlPersistSeconds?: number;
  connectTimeoutSeconds?: number;
  // 测试注入点: 单测以假 spawn 验证命令构造; platform 供确定性地测 win32 分支
  spawnImpl?: SpawnImpl;
  platform?: NodeJS.Platform;
}

const DEFAULT_CONTROL_PERSIST_SECONDS = 600;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;
// ssh 连接类错误 (认证失败/不可达/known_hosts 不匹配) 的退出码约定
export const SSH_TRANSPORT_EXIT_CODE = 255;

// 命令名只允许普通程序名 (本模块的命令全部来自内部代码, 不含用户输入; 仍收紧防回归)
const COMMAND_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const createSshExecutor = (
  target: SshTarget,
  options: SshExecutorOptions = {},
): CommandExecutor => {
  const controlPathDir = options.controlPathDir ?? tmpdir();
  const controlPersist = options.controlPersistSeconds ?? DEFAULT_CONTROL_PERSIST_SECONDS;
  const connectTimeout = options.connectTimeoutSeconds ?? DEFAULT_CONNECT_TIMEOUT_SECONDS;
  // Windows OpenSSH 的 ControlMaster 在无控制台后台 spawn 下不可用 (master 立即
  // reset, 实测 exit 255 "Failed to connect to new control master"); win32 默认
  // 关闭 mux 逐命令建连, 显式传 controlPathDir 视为强制开启 (逃生舱)
  const muxEnabled =
    options.controlPathDir !== undefined || (options.platform ?? process.platform) !== "win32";

  const baseArgs = (): string[] => {
    const args: string[] = [];
    // 每个 -o 选项必须是两个独立 argv 元素; spawn 不按空格拆分
    const pushOption = (keyValue: string): void => {
      args.push("-o", keyValue);
    };
    if (muxEnabled) {
      pushOption("ControlMaster=auto");
      // %C = ssh 侧对连接参数求 hash 的短名展开, 避免把 host/user 编进 socket 路径;
      // 短文件名是给 Windows AF_UNIX 路径长度限制留余量 (见 SshExecutorOptions)
      pushOption(`ControlPath=${join(controlPathDir, "dv-%C")}`);
      pushOption(`ControlPersist=${controlPersist}`);
    }
    pushOption("BatchMode=yes");
    // 用户 ssh config 可能配置端口转发 (RemoteForward 等), 纯执行会话不需要
    pushOption("ClearAllForwardings=yes");
    pushOption(`ConnectTimeout=${connectTimeout}`);
    if (target.port !== undefined) {
      args.push("-p", String(target.port));
    }
    return args;
  };

  const buildRemoteCommand = (command: string, args: readonly string[], cwd?: string): string => {
    if (!COMMAND_NAME_PATTERN.test(command)) {
      throw new Error(`Invalid command name for ssh exec: ${command}`);
    }
    const quoted = [command, ...args.map((arg) => shellQuote(arg))].join(" ");
    return cwd === undefined ? quoted : `cd ${shellQuote(cwd)} && ${quoted}`;
  };

  const run = async (
    command: string,
    args: readonly string[],
    execOptions?: ExecOptions,
  ): Promise<ExecResult<Buffer>> => {
    const remoteCommand = buildRemoteCommand(command, args, execOptions?.cwd);
    const sshArgs = [...baseArgs(), formatSshDestination(target), remoteCommand];
    return runSpawnedProcess("ssh", sshArgs, {
      timeoutMs: execOptions?.timeoutMs,
      maxBuffer: execOptions?.maxBuffer,
      spawnImpl: options.spawnImpl,
    });
  };

  return {
    exec: async (command, args, execOptions) => {
      const result = await run(command, args, execOptions);
      return { ...result, stdout: result.stdout.toString("utf8") };
    },
    execBuffer: (command, args, execOptions) => run(command, args, execOptions),
  };
};
