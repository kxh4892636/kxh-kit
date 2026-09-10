import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Identity } from "./processes.js";
const exec = promisify(execFile);
// 端口监听者查询；命令缺失或执行失败时返回空集（未知），由其余就绪证据兜底。
export const listeningPids = async (port: number): Promise<number[]> => {
  try {
    const { stdout } = await exec("lsof", ["-nP", "-iTCP:" + port, "-sTCP:LISTEN", "-t"], {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split("\n")
      .map((line: string): number => Number(line.trim()))
      .filter((pid: number): boolean => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
};
// 升级记录按 pid + 出生时间记键：同一 pid 被重用后，新进程仍从 SIGTERM 开始。
const signalKey = (identity: Identity): string => identity.pid + "@" + identity.birth;
// 已发过 SIGTERM 且仍在快照里的身份：下一轮改为 SIGKILL。
const signaled = new Set<string>();
// 终止一组进程：先 SIGTERM，同一身份在后续轮次升级为 SIGKILL。
// confirm 返回「本次入参里当前仍成立的身份」；它是误杀外部进程的唯一防线，确认不到就不发信号。
export const terminateWithSignals = async (
  identities: Identity[],
  confirm: (identities: Identity[]) => Promise<Identity[]>,
): Promise<void> => {
  if (!identities.length) return;
  const confirmed = await confirm(identities);
  // 只对本次入参允许的身份发信号：确认实现即使返回多余条目也不会波及无关进程。
  const requested = new Set(identities.map(signalKey));
  const live = new Set(confirmed.map(signalKey));
  // 清理只针对本次入参：其他调用（其他适配器实例或端口）的升级记录不受影响。
  for (const key of requested) if (!live.has(key)) signaled.delete(key);
  for (const identity of confirmed) {
    const key = signalKey(identity);
    if (!requested.has(key)) continue;
    const signal = signaled.has(key) ? "SIGKILL" : "SIGTERM";
    try {
      process.kill(identity.pid, signal);
    } catch {
      // 进程已经退出，或已被回收：两种情况都无需再处理。
      signaled.delete(key);
      continue;
    }
    signaled.add(key);
  }
};
