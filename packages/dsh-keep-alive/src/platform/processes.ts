import { z } from "zod";
import { delay } from "../contract.js";
// 进程身份字段由各平台适配器读取；判据只在 pid + birth，见 sameProcess。
const processSchema = z.object({
  pid: z.number(),
  parent: z.number(),
  birth: z.string(),
  command: z.string().nullable(),
});
const snapshotSchema = z.object({
  processes: z.array(processSchema),
  owners: z.array(z.number()),
});
export type Identity = z.infer<typeof processSchema>;
export type ProcessSnapshot = { processes: Identity[]; owners: number[] };
// 平台适配器只提供「读一次进程表」与「终止一组进程」；其余进程语义与平台无关。
export interface ProcessSource {
  snapshot: (port: number) => Promise<ProcessSnapshot>;
  // 契约：terminate 必须在结束进程前用当前状态复核 pid + birth，禁止只凭 pid 发信号。
  // terminateTree 依赖这一前提：它的第一轮目标可能包含已退出或 PID 被重用的根进程。
  terminate: (identities: Identity[]) => Promise<void>;
}
export const parseSnapshot = (value: unknown): ProcessSnapshot => snapshotSchema.parse(value);
// 终止后重新快照的间隔；同一轮内不再重复发送终止信号。
// 重试次数只服务于「树还没退出」的等待窗口，故不作为对外契约暴露。
const TERMINATE_ATTEMPTS = 10;
const TERMINATE_INTERVAL = 100;
// 判据只保留系统不会改变的字段：POSIX 上父进程退出会让子进程被 reparent（parent 会变），
// Windows 上 CommandLine 可能为 null。把它们放进判据只会产生假阴性。
export const sameProcess = (a: Identity, b: Identity): boolean =>
  a.pid === b.pid && a.birth === b.birth;
// 受管进程树：跨 PID 重用、跨父进程先退出两种情况重建。
export const descendants = (root: Identity, all: Identity[]): Identity[] => {
  // 同一 pid 出现不同身份说明原进程已退出且 pid 被重用；重用之后创建的进程不属于本树。
  const reused = all.find(
    (process: Identity): boolean => process.pid === root.pid && !sameProcess(process, root),
  );
  const found = [root];
  for (let index = 0; index < found.length; index++) {
    const parent = found[index];
    for (const process of all) {
      if (
        process.parent === parent.pid &&
        process.birth >= parent.birth &&
        (!reused || process.birth < reused.birth) &&
        !found.some((known: Identity): boolean => known.pid === process.pid)
      )
        found.push(process);
    }
  }
  // 只保留仍然存活的部分（父进程先退出的后代保留），并返回快照里的当前身份：
  // 调用方据 command 判断进程是否已退出，返回入参里的旧身份会漏掉「已变成僵尸」这一状态变化。
  return found
    .map((process: Identity): Identity | undefined =>
      all.find((live: Identity): boolean => sameProcess(process, live)),
    )
    .filter((process: Identity | undefined): process is Identity => process !== undefined);
};
// 终止受管进程树：第一轮先把根进程与当时可见的后代一起停掉——根进程仍在时父进程关系才可读，
// POSIX 上父进程退出会让子进程被 reparent，先杀根会丢掉整棵子树。
// 搜索集逐轮扩张：已发现的进程即使之后被 reparent，仍作为锚点继续搜索它们后来派生的后代。
// 每轮对全部仍存活的受管进程重发终止信号（平台适配器负责幂等），最多 TERMINATE_ATTEMPTS 轮。
export const terminateTree = async (
  root: Identity,
  port: number,
  source: ProcessSource,
  interval: number = TERMINATE_INTERVAL,
): Promise<void> => {
  // searched 是搜索锚点集合，初始只有根进程；每轮把新发现的进程并入，下一轮继续从它们搜索后代。
  const searched = [root];
  for (let attempt = 0; attempt < TERMINATE_ATTEMPTS; attempt++) {
    const current = await source.snapshot(port);
    const discovered = searched.flatMap((anchor: Identity): Identity[] =>
      descendants(anchor, current.processes),
    );
    for (const process of discovered)
      if (!searched.some((known: Identity): boolean => sameProcess(known, process)))
        searched.push(process);
    const owned = discovered.filter(
      (process: Identity, index: number, list: Identity[]): boolean =>
        list.findIndex((value: Identity): boolean => sameProcess(process, value)) === index,
    );
    if (!owned.length) return;
    // 父进程排在前面：先关闭派生入口，再处理后代。
    await source.terminate(owned);
    await delay(interval);
  }
  throw new Error("Managed process tree did not exit");
};
