import { expect, test } from "vitest";
import {
  snapshot,
  descendants,
  sameProcess,
  terminateTree,
  powershell,
  type Identity,
} from "./windows.js";
const root: Identity = {
  pid: 10,
  parent: 1,
  birth: "2026-01-01T00:00:00",
  command: "node fixture",
};
const kid: Identity = { pid: 11, parent: 10, birth: "2026-01-01T00:00:01", command: "node child" };
test("进程树排除重用 PID，并保留已退出父进程的受管后代", (): void => {
  expect(sameProcess(root, { ...root, birth: "new" })).toBe(false);
  expect(descendants(root, [root, kid])).toEqual([root, kid]);
  expect(descendants(root, [kid])).toEqual([kid]);
  const reused = { ...root, birth: "2026-01-02T00:00:00", command: "external" };
  const external = { ...kid, birth: "2026-01-03T00:00:00" };
  expect(descendants(root, [reused, external])).toEqual([]);
});
test("读取系统快照并拒绝损坏响应", async (): Promise<void> => {
  const current = await snapshot(1);
  expect(
    current.processes.some(
      (p: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
        p.pid === process.pid,
    ),
  ).toBeTruthy();
  await expect(snapshot(1, async (): Promise<string> => "{}")).rejects.toThrow();
  expect((await powershell("'hello'")).trim()).toBe("hello");
});
test("停止前后核对身份，终止失败明确返回错误", async (): Promise<void> => {
  let calls = 0;
  const result = await terminateTree(root, 1, async (script: string): Promise<string> => {
    calls++;
    if (script.includes("Invoke-CimMethod")) return "";
    return JSON.stringify({ processes: calls === 1 ? [root, kid] : [], owners: [] });
  });
  expect(result).toBeUndefined();
  expect(calls).toBe(3);
  await terminateTree(
    root,
    1,
    async (): Promise<string> => JSON.stringify({ processes: [], owners: [] }),
  );
  await expect(
    terminateTree(root, 1, async (script: string): Promise<string> => {
      if (script.includes("Invoke-CimMethod")) throw new Error("cannot terminate");
      return JSON.stringify({ processes: [root], owners: [] });
    }),
  ).rejects.toThrow(/cannot terminate/);
  await expect(
    terminateTree(
      root,
      1,
      async (script: string): Promise<string> =>
        script.includes("Invoke-CimMethod")
          ? ""
          : JSON.stringify({ processes: [root], owners: [] }),
    ),
  ).rejects.toThrow(/did not exit/);
});
