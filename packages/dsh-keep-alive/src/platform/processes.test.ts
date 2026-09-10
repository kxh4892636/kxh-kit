import { expect, test } from "vitest";
import {
  descendants,
  parseSnapshot,
  sameProcess,
  terminateTree,
  type Identity,
  type ProcessSource,
} from "./processes.js";
const root: Identity = { pid: 10, parent: 1, birth: "2026-01-01T00:00:00", command: "node dsh" };
const kid: Identity = { pid: 11, parent: 10, birth: "2026-01-01T00:00:01", command: "node child" };
const grandkid: Identity = {
  pid: 12,
  parent: 11,
  birth: "2026-01-01T00:00:02",
  command: "node grandchild",
};
// 终止树测试用替身：snapshot 按调用次序返回给定快照，terminate 记录收到的身份。
interface Termination {
  targets: Identity[][];
  snapshots: number;
}
const sourceOf = (
  snapshots: Identity[][],
  termination: Termination,
  owners: number[] = [],
): ProcessSource => ({
  snapshot: async (): Promise<{ processes: Identity[]; owners: number[] }> => {
    const processes =
      snapshots[Math.min(termination.snapshots, snapshots.length - 1)] ?? ([] as Identity[]);
    termination.snapshots++;
    return { processes, owners };
  },
  terminate: async (identities: Identity[]): Promise<void> => {
    termination.targets.push(identities);
  },
});
test("身份判据只用 pid 与创建时间", (): void => {
  expect(sameProcess(root, { ...root })).toBe(true);
  expect(sameProcess(root, { ...root, parent: 99 })).toBe(true);
  expect(sameProcess(root, { ...root, command: null })).toBe(true);
  expect(sameProcess(root, { ...root, command: "other" })).toBe(true);
  expect(sameProcess(root, { ...root, birth: "2026-01-02T00:00:00" })).toBe(false);
  expect(sameProcess(root, kid)).toBe(false);
  expect(parseSnapshot({ processes: [root], owners: [10] })).toEqual({
    processes: [root],
    owners: [10],
  });
  expect((): unknown => parseSnapshot({})).toThrow();
});
test("进程树跨父进程先退出与 PID 重用重建", (): void => {
  expect(descendants(root, [root, kid, grandkid])).toEqual([root, kid, grandkid]);
  // 父进程已退出，仍存活的后代保留在树里。
  expect(descendants(root, [kid])).toEqual([kid]);
  // 原进程已退出且 pid 被重用：重用之后创建的进程不属于本树。
  const reused = { ...root, birth: "2026-01-02T00:00:00", command: "external" };
  const external = { ...kid, birth: "2026-01-03T00:00:00" };
  expect(descendants(root, [reused, external])).toEqual([]);
  // 父进程在快照里仍是同一身份时，晚于它出生的子进程无条件属于本树。
  expect(descendants(root, [root, { ...kid, birth: "2026-01-01T00:00:30" }])).toHaveLength(2);
});
test("终止受管树：第一轮终止根进程与当时可见的后代，之后追查新出现的后代", async (): Promise<void> => {
  const termination: Termination = { targets: [], snapshots: 0 };
  // 第一轮必须发生在根进程仍可见时；spawned 在两轮快照之间出生，属于同一棵树。
  const spawned = { ...grandkid, pid: 13, birth: "2026-01-01T00:00:03" };
  await terminateTree(root, 7, sourceOf([[root, kid], [root, spawned], [root], []], termination));
  expect(termination.targets).toEqual([[root, kid], [root, spawned], [root]]);
  expect(termination.snapshots).toBe(4);
});
test("终止受管树：中间层被 reparent 后，其更深后代仍能被追查", async (): Promise<void> => {
  const termination: Termination = { targets: [], snapshots: 0 };
  // POSIX 上父进程退出后子进程会被 reparent 到 pid 1。搜索锚点必须包含已发现的进程本身，
  // 否则中间层被 reparent 后，挂在它名下的更深后代就再也找不到，清理会误报成功。
  const reparented = { ...kid, parent: 1 };
  await terminateTree(
    root,
    7,
    sourceOf([[root, kid, grandkid], [reparented, grandkid], [reparented], []], termination),
  );
  expect(termination.targets).toEqual([
    [root, kid, grandkid],
    [reparented, grandkid],
    [reparented],
  ]);
  expect(termination.snapshots).toBe(4);
});
test("终止受管树：根进程已被回收且后代已被 reparent 时提前返回，不误杀外部进程", async (): Promise<void> => {
  const termination: Termination = { targets: [], snapshots: 0 };
  // 根进程已从快照消失：父进程关系不可恢复，后代无法被归属为受管进程。
  // 这是有界的能力边界（不误杀外部进程优先）：不重试、不报错，直接返回。
  const orphan = { ...kid, parent: 1 };
  await terminateTree(root, 7, sourceOf([[orphan], [orphan], []], termination));
  expect(termination.targets).toEqual([]);
  expect(termination.snapshots).toBe(1);
});
test("终止受管树：树已退出即返回，持续存活则有限轮后明确失败", async (): Promise<void> => {
  const gone: Termination = { targets: [], snapshots: 0 };
  await terminateTree(root, 7, sourceOf([[]], gone));
  expect(gone.targets).toEqual([]);
  expect(gone.snapshots).toBe(1);
  // command 为 null 只表示读不到命令行（Windows 上活进程也可能如此），不能当作已退出：
  // 这类进程仍会被终止，直到真正消失或超出重试预算——不静默宣告清理完成。
  const unreadable: Termination = { targets: [], snapshots: 0 };
  await expect(
    terminateTree(root, 7, sourceOf([[{ ...root, command: null }]], unreadable), 1),
  ).rejects.toThrow(/did not exit/);
  expect(unreadable.targets).toHaveLength(10);
  expect(unreadable.targets.every((batch): boolean => batch.length === 1)).toBe(true);
  expect(unreadable.snapshots).toBe(10);
  // 每轮对仍存活的受管进程重发终止信号；没有进展时以明确失败收尾，而不是假装清理成功。
  const stuck: Termination = { targets: [], snapshots: 0 };
  await expect(
    terminateTree(
      root,
      7,
      sourceOf(
        [
          [root, kid],
          [root, kid],
        ],
        stuck,
        [10],
      ),
      1,
    ),
  ).rejects.toThrow(/did not exit/);
  expect(stuck.targets).toEqual(Array.from({ length: 10 }, (): Identity[] => [root, kid]));
  expect(stuck.snapshots).toBe(10);
  const failing: Termination = { targets: [], snapshots: 0 };
  const source = sourceOf([[root, kid]], failing);
  source.terminate = async (): Promise<void> => {
    throw new Error("cannot terminate");
  };
  // 终止调用失败要立刻暴露，不能进入重试循环后报成「树没有退出」。
  await expect(terminateTree(root, 7, source)).rejects.toThrow(/cannot terminate/);
  expect(failing.snapshots).toBe(1);
  expect(failing.targets).toEqual([]);
});
