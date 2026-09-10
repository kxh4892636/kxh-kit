import { expect, test, vi } from "vitest";
import {
  bsdPlatform,
  confirmIdentities,
  parseLine,
  parseLstart,
  parseTable,
  runPs,
  snapshot,
} from "./bsd.js";
import { onPosix } from "../testing/platform.js";
import type { Identity } from "./processes.js";
// 录制的 ps 表，形态对齐 BSD `ps -eo pid=,ppid=,state=,lstart=,args=`
// （个位数日期前两个空格，args 可含空格；本机 Linux 输出可直接对拍同一形态）。
const RECORDED = [
  "      1       0 S Mon Sep  7 10:48:18 2026 /sbin/launchd",
  "  494       1 S Mon Sep  7 10:48:20 2026 /usr/libexec/logd",
  " 1075   494 S Mon Sep  7 11:02:03 2026 /Applications/Visual Studio Code.app/Contents/MacOS/Electron --no-sandbox",
  "  997       1 Z Mon Sep  7 10:59:59 2026 <defunct>",
  " 1234       0 S Mon Sep  7 09:00:00 2026",
  "",
].join("\n");
test("解析 lstart 与整行：日期、命令行含空格、缺少命令行、僵尸被跳过", (): void => {
  expect(parseLstart("Mon Sep  7 10:48:18 2026")).toBe("2026-09-07T10:48:18.000Z");
  expect(parseLstart("Fri Dec 31 23:59:59 2027")).toBe("2027-12-31T23:59:59.000Z");
  const parsed = parseTable(RECORDED);
  expect(parsed).toEqual([
    { pid: 1, parent: 0, birth: "2026-09-07T10:48:18.000Z", command: "/sbin/launchd" },
    { pid: 494, parent: 1, birth: "2026-09-07T10:48:20.000Z", command: "/usr/libexec/logd" },
    {
      pid: 1075,
      parent: 494,
      birth: "2026-09-07T11:02:03.000Z",
      command: "/Applications/Visual Studio Code.app/Contents/MacOS/Electron --no-sandbox",
    },
    { pid: 1234, parent: 0, birth: "2026-09-07T09:00:00.000Z", command: null },
  ]);
  // 僵尸（state=Z）不进入快照：它的 args 是 <defunct>，当成存活会让清理空转。
  expect(parsed.some((process: Identity): boolean => process.pid === 997)).toBe(false);
  // 同一形态重复解析给出同样的出生时间：身份判据（pid + birth）不会漂移。
  expect(parseTable(RECORDED).map((process: Identity): string => process.birth)).toEqual(
    parsed.map((process: Identity): string => process.birth),
  );
});
test("拒绝缺列、非数字与越界输入", (): void => {
  for (const line of [
    "",
    "not a ps line",
    "abc 0 S Mon Sep  7 10:48:18 2026 /bin/sh",
    "1234 0 S 2026-09-07 /bin/sh",
    "1234 0 S Mon Sep  7 99:48:18 2026 /bin/sh",
    "0 0 S Mon Sep  7 10:48:18 2026 /bin/sh",
    "99999999999999999999 0 S Mon Sep  7 10:48:18 2026 /bin/sh",
    "1234 0 S Mon Sep  7 10:48:18 0099 /bin/sh",
  ])
    expect(parseLine(line)).toBeUndefined();
  for (const text of [
    "",
    "Sep  7 10:48:18",
    "Mon Xxx  7 10:48:18 2026",
    "Mon Sep 32 10:48:18 2026",
    "Mon Sep  0 10:48:18 2026",
    "Mon Sep  7 24:48:18 2026",
    "Mon Sep  7 10:48:18 0099",
  ])
    expect(parseLstart(text)).toBeUndefined();
});
test("快照合并 ps 全表与端口监听者，空表或畸形表必须报错", async (): Promise<void> => {
  const result = await snapshot(
    3080,
    async (): Promise<string> => RECORDED,
    async (): Promise<number[]> => [1075],
  );
  expect(result.owners).toEqual([1075]);
  expect(result.processes).toHaveLength(4);
  // 空输出与全表畸形都不能退化成空表：那会让清理误判「树已退出」，stop 假成功。
  for (const output of ["", "totally different ps format\n 1 ?? whatever\n"])
    await expect(
      snapshot(
        3080,
        async (): Promise<string> => output,
        async (): Promise<number[]> => [],
      ),
    ).rejects.toThrow(/Cannot parse ps output/);
});
test("终止前用 ps 复核身份：不符或已消失的身份不发信号", async (): Promise<void> => {
  const identity: Identity = {
    pid: 1075,
    parent: 494,
    birth: "2026-09-07T11:02:03.000Z",
    command: "electron",
  };
  expect(await confirmIdentities([identity], async (): Promise<string> => RECORDED)).toEqual([
    identity,
  ]);
  // 出生时间不同（pid 重用）与 pid 不存在都不确认。
  expect(
    await confirmIdentities(
      [{ ...identity, birth: "2026-09-07T11:02:04.000Z" }],
      async (): Promise<string> => RECORDED,
    ),
  ).toEqual([]);
  expect(
    await confirmIdentities([{ ...identity, pid: 999999 }], async (): Promise<string> => RECORDED),
  ).toEqual([]);
});
test("终止路径：只对确认成立的身份发信号，下一轮升级为 SIGKILL", async (): Promise<void> => {
  const calls: Array<{ pid: number; signal: string | number | undefined }> = [];
  const spy = vi
    .spyOn(process, "kill")
    .mockImplementation((pid: number, signal?: string | number): true => {
      calls.push({ pid, signal });
      return true;
    });
  try {
    const platform = bsdPlatform(async (): Promise<string> => RECORDED);
    const tracked: Identity = {
      pid: 1075,
      parent: 494,
      birth: "2026-09-07T11:02:03.000Z",
      command: "electron",
    };
    await platform.terminate([tracked]);
    expect(calls).toEqual([{ pid: 1075, signal: "SIGTERM" }]);
    // 同一身份仍在进程表里：下一轮升级为 SIGKILL。
    calls.length = 0;
    await platform.terminate([tracked]);
    expect(calls).toEqual([{ pid: 1075, signal: "SIGKILL" }]);
    // 出生时间不符（pid 已被重用）时不发信号。
    calls.length = 0;
    await platform.terminate([{ ...tracked, birth: "2026-09-07T11:02:04.000Z" }]);
    expect(calls).toEqual([]);
  } finally {
    spy.mockRestore();
  }
});
onPosix(
  "真实 ps 输出可被解析（Linux 上验证同一形态，macOS 上验证目标平台）",
  async (): Promise<void> => {
    const current = await snapshot(0, runPs, async (): Promise<number[]> => []);
    const self = current.processes.find(
      (candidate: Identity): boolean => candidate.pid === globalThis.process.pid,
    );
    expect(current.processes.length).toBeGreaterThan(1);
    expect(self).toBeDefined();
    expect(self!.birth).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  },
);
onPosix("ps 不可用时快照报错而不是返回空表", async (): Promise<void> => {
  await expect(
    snapshot(0, async (): Promise<string> => {
      throw new Error("spawn ps ENOENT");
    }),
  ).rejects.toThrow(/ENOENT/);
});
