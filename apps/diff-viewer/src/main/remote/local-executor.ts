// 本地执行器 (issue 06): executor 抽象的 local 实现, 直接 spawn 本机进程。
// spawn/收集/超时/maxBuffer 核心与 ssh-executor 共用 (runSpawnedProcess):
// 两者只差命令行构造 —— ssh-executor 把远程命令包装进 ssh CLI 参数。
import { spawn } from "child_process";

import {
  DEFAULT_EXEC_MAX_BUFFER,
  DEFAULT_EXEC_TIMEOUT_MS,
  type CommandExecutor,
  type ExecOptions,
  type ExecResult,
} from "./executor.js";

export type SpawnImpl = typeof spawn;

interface SpawnCollectOptions extends ExecOptions {
  // 测试注入点: 单测以假 spawn 验证命令构造, 生产默认 child_process.spawn
  spawnImpl?: SpawnImpl;
}

export const runSpawnedProcess = (
  command: string,
  args: readonly string[],
  options: SpawnCollectOptions = {},
): Promise<ExecResult<Buffer>> => {
  const { cwd, timeoutMs = DEFAULT_EXEC_TIMEOUT_MS, maxBuffer = DEFAULT_EXEC_MAX_BUFFER } = options;
  const spawnImpl = options.spawnImpl ?? spawn;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(command, [...args], cwd === undefined ? {} : { cwd });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      rejectPromise(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    const settle = (exitCode: number): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
      });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutLength += chunk.length;
      if (stdoutLength > maxBuffer) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGTERM");
          rejectPromise(
            new Error(`Command output exceeded maxBuffer (${maxBuffer} bytes): ${command}`),
          );
        }
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    });
    // 信号杀死 (含超时后的 kill) 时 code 为 null, 以 -1 表达"非正常退出"
    child.on("close", (code) => {
      settle(code ?? -1);
    });
  });
};

export const createLocalExecutor = (): CommandExecutor => ({
  exec: async (command, args, options) => {
    const result = await runSpawnedProcess(command, args, options ?? {});
    return { ...result, stdout: result.stdout.toString("utf8") };
  },
  execBuffer: (command, args, options) => runSpawnedProcess(command, args, options ?? {}),
});
