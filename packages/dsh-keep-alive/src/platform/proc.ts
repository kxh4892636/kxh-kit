import { readdir, readFile } from "node:fs/promises";
import type { Identity } from "./processes.js";
// /proc 的 starttime 以 CLK_TCK 为单位，Linux 上固定为 100。
const CLOCK_TICKS = 100;
export interface ProcReader {
  readText: (path: string) => Promise<string | undefined>;
  list: (path: string) => Promise<string[]>;
  listeningPids: (port: number) => Promise<number[]>;
}
export const readText = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch {
    // 进程可能在两次读取之间退出，或属于其他用户而不可读；两种情况都当作「本进程不可用」。
    return undefined;
  }
};
export const list = async (path: string): Promise<string[]> => {
  // 进程表读不到是系统级失败：向上抛出让调用方失败，而不是返回空表让清理误判「树已退出」。
  return await readdir(path);
};
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
// 出生时间：boot 秒 + starttime 刻度，转成与 Windows CreationDate 同形的 ISO 字符串。
export const birthOf = (startTime: number, bootTime: number): string =>
  new Date((bootTime + startTime / CLOCK_TICKS) * 1000).toISOString();
export const bootTimeOf = (stat: string | undefined): number | undefined => {
  const boot = stat?.match(/^btime (\d+)$/m);
  return boot ? Number(boot[1]) : undefined;
};
// 系统启动时间：快照与终止共用同一读取与错误文案。
export const bootTimeOrThrow = async (
  reader: Pick<ProcReader, "readText">,
  procRoot: string,
): Promise<number> => {
  const bootTime = bootTimeOf(await reader.readText(procRoot + "/stat"));
  if (bootTime === undefined) throw new Error("Cannot read boot time from " + procRoot + "/stat");
  return bootTime;
};
export interface ProcRow {
  identity: Identity;
  state: string;
}
// 读取进程表：状态为 Z 的僵尸与不可解析的条目被跳过；cmdline 读不到只影响诊断字段。
export const readProcesses = async (
  reader: ProcReader,
  procRoot: string = "/proc",
): Promise<ProcRow[]> => {
  const bootTime = await bootTimeOrThrow(reader, procRoot);
  const rows: ProcRow[] = [];
  for (const entry of await reader.list(procRoot)) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await reader.readText(procRoot + "/" + entry + "/stat");
    const parsed = stat === undefined ? undefined : parseStat(stat);
    if (!parsed || parsed.state === "Z") continue;
    const cmdline = (await reader.readText(procRoot + "/" + entry + "/cmdline")) ?? "";
    rows.push({
      identity: {
        pid: Number(entry),
        parent: parsed.parent,
        birth: birthOf(parsed.startTime, bootTime),
        command: cmdline.replaceAll("\0", " ").trim() || null,
      },
      state: parsed.state,
    });
  }
  return rows;
};
// 终止前用 /proc 复核身份：读不出或出生时间不符的身份不发信号，避免误杀重用 pid 的外部进程。
export const confirmIdentities = async (
  identities: Identity[],
  reader: ProcReader,
  procRoot: string = "/proc",
): Promise<Identity[]> => {
  const bootTime = await bootTimeOrThrow(reader, procRoot);
  const confirmed: Identity[] = [];
  for (const identity of identities) {
    const stat = await reader.readText(procRoot + "/" + identity.pid + "/stat");
    const parsed = stat === undefined ? undefined : parseStat(stat);
    if (!parsed) continue;
    if (birthOf(parsed.startTime, bootTime) !== identity.birth) continue;
    confirmed.push(identity);
  }
  return confirmed;
};
