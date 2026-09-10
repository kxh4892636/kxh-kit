import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  parseSnapshot,
  type Identity,
  type ProcessSnapshot,
  type ProcessSource,
} from "./processes.js";
const exec = promisify(execFile);
// /proc 的 starttime 以 CLK_TCK 为单位，Linux 上固定为 100。
const CLOCK_TICKS = 100;
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
export interface ProcReader {
  readText: (path: string) => Promise<string | undefined>;
  list: (path: string) => Promise<string[]>;
  listeningPids: (port: number) => Promise<number[]>;
}
const readText = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch {
    // 进程可能在两次读取之间退出，或属于其他用户而不可读；两种情况都当作「本进程不可用」。
    return undefined;
  }
};
const list = async (path: string): Promise<string[]> => {
  // 进程表读不到是系统级失败：向上抛出让调用方失败，而不是返回空表让清理误判「树已退出」。
  return await readdir(path);
};
export const defaultReader: ProcReader = { readText, list, listeningPids };
// 出生时间：boot 秒 + starttime 刻度，转成与 Windows CreationDate 同形的 ISO 字符串。
const birthOf = (startTime: number, bootTime: number): string =>
  new Date((bootTime + startTime / CLOCK_TICKS) * 1000).toISOString();
// stat 的字段 2、4、22 分别是 comm、ppid、starttime；comm 可能含空格与括号，故取最后一个 ')'。
export interface StatFields {
  state: string;
  parent: number;
  startTime: number;
}
export const parseStat = (text: string): StatFields | undefined => {
  const close = text.lastIndexOf(")");
  if (close < 0) return undefined;
  const fields = text
    .slice(close + 2)
    .trim()
    .split(/\s+/);
  const state = fields[0] ?? "";
  const parent = Number(fields[1]);
  const startTime = Number(fields[19]);
  // 上界取安全整数与「自启动以来的刻度」量级：越界值会让出生时间计算抛 RangeError。
  if (!/^[A-Z]$/.test(state)) return undefined;
  if (!Number.isSafeInteger(parent) || parent < 0 || parent > 2 ** 31) return undefined;
  if (!Number.isSafeInteger(startTime) || startTime < 0 || startTime > 2 ** 42) return undefined;
  return { state, parent, startTime };
};
export const bootTimeOf = (stat: string | undefined): number | undefined => {
  const boot = stat?.match(/^btime (\d+)$/m);
  return boot ? Number(boot[1]) : undefined;
};
// 系统启动时间：快照与终止共用同一读取与错误文案。
const bootTimeOrThrow = async (reader: ProcReader, procRoot: string): Promise<number> => {
  const bootTime = bootTimeOf(await reader.readText(procRoot + "/stat"));
  if (bootTime === undefined) throw new Error("Cannot read boot time from " + procRoot + "/stat");
  return bootTime;
};
export const snapshot = async (
  port: number,
  reader: ProcReader = defaultReader,
  procRoot: string = "/proc",
): Promise<ProcessSnapshot> => {
  const bootTime = await bootTimeOrThrow(reader, procRoot);
  const processes: Identity[] = [];
  for (const entry of await reader.list(procRoot)) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await reader.readText(procRoot + "/" + entry + "/stat");
    const parsed = stat === undefined ? undefined : parseStat(stat);
    // 状态为 Z 的僵死进程已不执行用户代码，保留会污染身份复核与就绪判定。
    if (!parsed || parsed.state === "Z") continue;
    // cmdline 读不到（内核线程、其他用户、刚好退出）只影响诊断字段，不作为丢弃进程的依据。
    const cmdline = (await reader.readText(procRoot + "/" + entry + "/cmdline")) ?? "";
    processes.push({
      pid: Number(entry),
      parent: parsed.parent,
      birth: birthOf(parsed.startTime, bootTime),
      command: cmdline.replaceAll("\0", " ").trim() || null,
    });
  }
  return parseSnapshot({ processes, owners: await reader.listeningPids(port) });
};
// 已收到 SIGTERM 且仍在进程表里的进程：下一轮改为 SIGKILL，避免忽略 SIGTERM 的进程拖满重试预算。
// 键包含出生时间：同一 pid 被重用后，新进程仍从 SIGTERM 开始。
const signaled = new Set<string>();
const signalKey = (identity: Identity): string => identity.pid + "@" + identity.birth;
export const terminate = async (
  identities: Identity[],
  reader: ProcReader = defaultReader,
  procRoot: string = "/proc",
): Promise<void> => {
  if (!identities.length) return;
  const bootTime = await bootTimeOrThrow(reader, procRoot);
  for (const identity of identities) {
    const stat = await reader.readText(procRoot + "/" + identity.pid + "/stat");
    const parsed = stat === undefined ? undefined : parseStat(stat);
    if (!parsed) {
      signaled.delete(signalKey(identity));
      continue;
    }
    // 终止前重新核对身份：pid 与创建时间同时相符才发信号，避免误杀重用 pid 的外部进程。
    if (birthOf(parsed.startTime, bootTime) !== identity.birth) {
      // pid 已被重用：清掉升级记录，避免新的受管进程首轮就吃 SIGKILL。
      signaled.delete(signalKey(identity));
      continue;
    }
    const key = signalKey(identity);
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
export const linuxPlatform = (reader: ProcReader = defaultReader): ProcessSource => ({
  snapshot: (port: number): Promise<ProcessSnapshot> => snapshot(port, reader),
  terminate: (identities: Identity[]): Promise<void> => terminate(identities, reader),
});
