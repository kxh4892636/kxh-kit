import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseSnapshot,
  type Identity,
  type ProcessSnapshot,
  type ProcessSource,
} from "./processes.js";
import { listeningPids, terminateWithSignals } from "./posix.js";
const exec = promisify(execFile);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// `ps -o lstart=` 的固定形态：Mon Sep  7 10:48:18 2026（个位数日期前有两个空格）。
const LSTART = /^([A-Za-z]{3}) ([A-Za-z]{3})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;
export const parseLstart = (text: string): string | undefined => {
  const match = text.trim().match(LSTART);
  if (!match) return undefined;
  // match[1] 是星期缩写，月份在 match[2]。
  const month = MONTHS.indexOf(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const year = Number(match[7]);
  // 越界字段必须在这里拒绝：Date.UTC 会把 32 日、24 时静默滚到下个月或第二天，
  // 也会把 0–99 的年份解释成 1900+。
  if (month < 0 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  if (year < 1970 || year > 9999) return undefined;
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  // 2 月 30 日之类的组合同样被 Date 归一化，用回读校验兜住。
  return date.getUTCDate() === day && date.getUTCMonth() === month && date.getUTCFullYear() === year
    ? date.toISOString()
    : undefined;
};
// 一行 `ps` 输出：pid ppid state + lstart 的 5 段 + args（含空格，可能缺失）。
// 状态为 Z 的僵死进程不进入快照（与 Linux 适配器同构；其 args 是 <defunct> 而不是空）。
export const parseLine = (line: string): Identity | undefined => {
  const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
  if (!match) return undefined;
  const pid = Number(match[1]);
  const parent = Number(match[2]);
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2 ** 31) return undefined;
  if (!Number.isSafeInteger(parent) || parent < 0 || parent > 2 ** 31) return undefined;
  const fields = match[3].trim().split(/\s+/);
  // 依次是 state、lstart 的 5 段、args；没有 args 的行（例如内核线程）同样有效。
  if (fields.length < 6) return undefined;
  if (fields[0] === "Z") return undefined;
  const birth = parseLstart(fields.slice(1, 6).join(" "));
  if (!birth) return undefined;
  const command = fields.slice(6).join(" ").trim();
  return { pid, parent, birth, command: command.length ? command : null };
};
export type RunPs = () => Promise<string>;
// macOS 的 BSD ps：一次取全表。lstart 与 args 都用默认格式（-c 会截断命令行）。
// TZ 必须固定为 UTC：lstart 是本地时间，而解析按 UTC 解释；时区一变同一进程的出生时间就会漂移，
// 身份复核随之失配（拒绝发信号，stop/restart 报「树没有退出」）。
export const runPs: RunPs = async (): Promise<string> => {
  const { stdout } = await exec("ps", ["-eo", "pid=,ppid=,state=,lstart=,args="], {
    timeout: 20000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
  });
  return stdout;
};
export const parseTable = (output: string): Identity[] =>
  output
    .split("\n")
    .map((line: string): Identity | undefined => parseLine(line))
    .filter((process: Identity | undefined): process is Identity => process !== undefined);
export const snapshot = async (
  port: number,
  run: RunPs = runPs,
  owners: (port: number) => Promise<number[]> = listeningPids,
): Promise<ProcessSnapshot> => {
  const output = await run();
  const processes = parseTable(output);
  // 空表不能被当成「没有受管进程」：那会让清理误判树已退出（stop 会假成功）。
  // 进程表里至少有 pid 1，否则说明 ps 输出不可解析。
  if (!processes.some((process: Identity): boolean => process.pid === 1))
    throw new Error(
      "Cannot parse ps output (" +
        processes.length +
        " rows): " +
        JSON.stringify(output.slice(0, 200)) +
        "; run `ps -eo pid=,ppid=,state=,lstart=,args=` manually to inspect the format",
    );
  return parseSnapshot({ processes, owners: await owners(port) });
};
// macOS 没有 /proc：用 ps 的全表复核身份仍在（pid + 出生时间），读不到 ps 时不发信号。
export const confirmIdentities = async (
  identities: Identity[],
  run: RunPs,
): Promise<Identity[]> => {
  const table = await snapshot(0, run, async (): Promise<number[]> => []);
  return identities.filter((identity: Identity): boolean =>
    table.processes.some(
      (process: Identity): boolean =>
        process.pid === identity.pid && process.birth === identity.birth,
    ),
  );
};
export const bsdPlatform = (run: RunPs = runPs): ProcessSource => ({
  snapshot: (port: number): Promise<ProcessSnapshot> => snapshot(port, run),
  terminate: (identities: Identity[]): Promise<void> =>
    terminateWithSignals(
      identities,
      (candidates: Identity[]): Promise<Identity[]> => confirmIdentities(candidates, run),
    ),
});
