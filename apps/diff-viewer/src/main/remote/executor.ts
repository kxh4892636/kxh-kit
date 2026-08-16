// 命令执行器抽象 (issue 06): local = 本机 child_process (local-executor.ts),
// remote = spawn 本机 OpenSSH ssh CLI (ssh-executor.ts)。
// 语义约定: 命令跑完 (含非零退出) 一律 resolve, exitCode/stderr 带回由调用方按
// git 语义判断; 仅 spawn 失败、超时、输出超限才 reject。
export interface ExecResult<Out = string> {
  stdout: Out;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  // 远程执行时为远程主机上的绝对 POSIX 路径
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

export const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
// git diff/cat-file 输出可能很大; 与上游 blob 读取的 10MB 限制区分开, 命令输出给足余量
export const DEFAULT_EXEC_MAX_BUFFER = 32 * 1024 * 1024;

export interface CommandExecutor {
  exec(
    command: string,
    args: readonly string[],
    options?: ExecOptions,
  ): Promise<ExecResult<string>>;
  execBuffer(
    command: string,
    args: readonly string[],
    options?: ExecOptions,
  ): Promise<ExecResult<Buffer>>;
}
