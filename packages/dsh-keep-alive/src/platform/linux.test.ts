import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { linuxPlatform, listeningPids, parseStat, snapshot, terminate } from "./linux.js";
import type { Identity, ProcessSource } from "./processes.js";
import { onLinux } from "../testing/platform.js";
const startChild = async (): Promise<ChildProcess> => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], {
    stdio: "ignore",
  });
  await once(child, "spawn");
  return child;
};
const identityOf = async (pid: number): Promise<Identity> => {
  const current = await snapshot(0);
  const found = current.processes.find((process: Identity): boolean => process.pid === pid);
  if (!found) throw new Error("Process not in snapshot: " + pid);
  return found;
};
onLinux("读取真实 /proc：自身与子进程可识别，命令行完整", async (): Promise<void> => {
  const child = await startChild();
  try {
    const current = await snapshot(0);
    const kid = current.processes.find((process: Identity): boolean => process.pid === child.pid);
    // 快照规模正常；读不到命令行的进程保留为诊断用的 null，而不是被丢弃。
    expect(current.processes.length).toBeGreaterThan(1);
    expect(current.processes.some((process: Identity): boolean => process.command === null)).toBe(
      true,
    );
    expect(kid).toBeDefined();
    expect(kid!.parent).toBe(process.pid);
    expect(kid!.birth).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(kid!.command).toContain("setTimeout");
    // 没有监听者时 owners 为空；命令缺失也不报错。
    expect(Array.isArray(current.owners)).toBe(true);
  } finally {
    child.kill("SIGKILL");
  }
});
onLinux("端口监听者查询返回监听进程", async (): Promise<void> => {
  const server = createServer();
  await new Promise<void>((resolve: () => void): void => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as { port: number }).port;
  try {
    expect(await listeningPids(port)).toContain(process.pid);
    expect((await snapshot(port)).owners).toContain(process.pid);
  } finally {
    await new Promise<void>((resolve: () => void): void => {
      server.close((): void => resolve());
    });
  }
});
onLinux("终止核对 pid 与创建时间：真实子进程退出，陈旧身份被忽略", async (): Promise<void> => {
  const child = await startChild();
  const identity = await identityOf(child.pid!);
  // 同一 pid 配上不同创建时间：必须拒绝，避免误杀重用 pid 的外部进程。
  await terminate([{ ...identity, birth: "2000-01-01T00:00:00.000Z" }]);
  expect(child.exitCode).toBeNull();
  await terminate([identity]);
  await once(child, "exit");
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
});
onLinux("终止不存在的进程与 SIGKILL 升级路径", async (): Promise<void> => {
  const identity: Identity = {
    pid: 999999,
    parent: 1,
    birth: "2026-01-01T00:00:00.000Z",
    command: "missing",
  };
  await terminate([identity]);
  await terminate([]);
  // 忽略 SIGTERM 的进程在第二轮被 SIGKILL 终止。
  const stubborn = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 120000)"],
    { stdio: "ignore" },
  );
  await once(stubborn, "spawn");
  const alive = await identityOf(stubborn.pid!);
  await terminate([alive]);
  expect(stubborn.exitCode).toBeNull();
  await terminate([alive]);
  await once(stubborn, "exit");
  expect(stubborn.signalCode).toBe("SIGKILL");
});
test("解析 /proc/<pid>/stat 的边界输入", (): void => {
  const stat =
    "1234 (node (worker)) S 1 1234 1234 0 -1 4194560 1 0 0 0 1 2 3 4 5 6 7 8 987654 21 0";
  expect(parseStat(stat)).toEqual({ state: "S", parent: 1, startTime: 987654 });
  expect(parseStat("no closing paren")).toBeUndefined();
  expect(parseStat("1 (x) S")).toBeUndefined();
  expect(parseStat("1 (x) S 1 2")).toBeUndefined();
  // 状态字段必须是单个大写字母；越界刻度被拒绝，避免出生时间计算抛 RangeError。
  expect(parseStat("1 (x) ?? 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19")).toBeUndefined();
  expect(parseStat("1 (x) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 1e21")).toBeUndefined();
});
test("缺少 /proc 数据时快照报错而不是返回空树", async (): Promise<void> => {
  const reader = {
    readText: async (): Promise<string | undefined> => undefined,
    list: async (): Promise<string[]> => [],
    listeningPids: async (): Promise<number[]> => [],
  };
  await expect(snapshot(1, reader)).rejects.toThrow(/boot time/);
  await expect(
    terminate([{ pid: 1, parent: 0, birth: "x", command: null }], reader),
  ).rejects.toThrow(/boot time/);
  // cmdline 为空（僵尸或不可读）的进程被跳过；cmdline 可读但 stat 不可解析的进程同样被跳过。
  const partial = {
    readText: async (path: string): Promise<string | undefined> => {
      if (path.endsWith("/proc/stat")) return "btime 1000";
      if (path.endsWith("/1/cmdline")) return "node\0zombie\0";
      if (path.endsWith("/1/stat")) return "1 (node) S";
      return undefined;
    },
    list: async (): Promise<string[]> => ["1", "2", "self"],
    listeningPids: async (): Promise<number[]> => [],
  };
  expect(await snapshot(1, partial)).toEqual({ processes: [], owners: [] });
  // 进程表整体不可读时必须报错：返回空表会让清理误判「树已退出」。
  const unreadable = {
    readText: partial.readText,
    list: async (): Promise<string[]> => {
      throw new Error("EACCES: /proc");
    },
    listeningPids: async (): Promise<number[]> => [],
  };
  await expect(snapshot(1, unreadable)).rejects.toThrow(/EACCES/);
});
test("适配器把端口与身份转发给注入的 /proc 读取器", async (): Promise<void> => {
  const reads: string[] = [];
  const reader = {
    readText: async (path: string): Promise<string | undefined> => {
      reads.push(path);
      if (path.endsWith("/proc/stat")) return "btime 1000";
      if (path.endsWith("/42/stat"))
        return "42 (fixture) S 7 42 42 0 -1 0 0 0 0 0 0 0 0 0 0 0 0 0 500 0";
      return "node\0fixture\0";
    },
    list: async (): Promise<string[]> => ["42"],
    listeningPids: async (): Promise<number[]> => [42],
  };
  const platform: ProcessSource = linuxPlatform(reader);
  const current = await platform.snapshot(3080);
  expect(current.owners).toEqual([42]);
  expect(current.processes).toEqual([
    {
      pid: 42,
      parent: 7,
      birth: new Date(1000 * 1000 + 5000).toISOString(),
      command: "node fixture",
    },
  ]);
  expect(reads.some((path: string): boolean => path.endsWith("/42/cmdline"))).toBe(true);
});
test("目录不可读时列表返回空集而不是抛出", async (): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "dsh-proc-"));
  try {
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "stat"), "btime 1000\n");
    // 记录 pid 的条目存在但没有 cmdline 文件：进程被跳过，不报错。
    expect(await snapshot(0, undefined, root)).toEqual({ processes: [], owners: [] });
    await rm(join(root, "stat"));
    await expect(snapshot(0, undefined, root)).rejects.toThrow(/boot time/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
