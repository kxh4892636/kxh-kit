import { test } from "node:test";
import assert from "node:assert/strict";
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
void test("进程树排除重用 PID，并保留已退出父进程的受管后代", (): void => {
  assert.equal(sameProcess(root, { ...root, birth: "new" }), false);
  assert.deepEqual(descendants(root, [root, kid]), [root, kid]);
  assert.deepEqual(descendants(root, [kid]), [kid]);
  const reused = { ...root, birth: "2026-01-02T00:00:00", command: "external" };
  const external = { ...kid, birth: "2026-01-03T00:00:00" };
  assert.deepEqual(descendants(root, [reused, external]), []);
});
void test("读取系统快照并拒绝损坏响应", async (): Promise<void> => {
  const current = await snapshot(1);
  assert.ok(
    current.processes.some(
      (p: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
        p.pid === process.pid,
    ),
  );
  await assert.rejects(snapshot(1, async (): Promise<string> => "{}"));
  assert.equal((await powershell("'hello'")).trim(), "hello");
});
void test("停止前后核对身份，终止失败明确返回错误", async (): Promise<void> => {
  let calls = 0;
  const result = await terminateTree(root, 1, async (script: string): Promise<string> => {
    calls++;
    if (script.includes("Invoke-CimMethod")) return "";
    return JSON.stringify({ processes: calls === 1 ? [root, kid] : [], owners: [] });
  });
  assert.equal(result, undefined);
  assert.equal(calls, 3);
  await terminateTree(
    root,
    1,
    async (): Promise<string> => JSON.stringify({ processes: [], owners: [] }),
  );
  await assert.rejects(
    terminateTree(root, 1, async (script: string): Promise<string> => {
      if (script.includes("Invoke-CimMethod")) throw new Error("cannot terminate");
      return JSON.stringify({ processes: [root], owners: [] });
    }),
    /cannot terminate/,
  );
  await assert.rejects(
    terminateTree(
      root,
      1,
      async (script: string): Promise<string> =>
        script.includes("Invoke-CimMethod")
          ? ""
          : JSON.stringify({ processes: [root], owners: [] }),
    ),
    /did not exit/,
  );
});
