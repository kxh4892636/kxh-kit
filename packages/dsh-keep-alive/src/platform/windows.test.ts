import { expect, test } from "vitest";
import { powershell, snapshot, terminate, windowsPlatform, type PowerShell } from "./windows.js";
import { onWindows } from "../testing/platform.js";
import type { Identity, ProcessSnapshot } from "./processes.js";
const root: Identity = { pid: 10, parent: 1, birth: "2026-01-01T00:00:00", command: "node dsh" };
const kid: Identity = { pid: 11, parent: 10, birth: "2026-01-01T00:00:01", command: "node child" };
const respond =
  (payload: unknown): PowerShell =>
  async (): Promise<string> =>
    typeof payload === "string" ? payload : JSON.stringify(payload);
test("读取系统快照并拒绝损坏响应", async (): Promise<void> => {
  const empty: ProcessSnapshot = { processes: [], owners: [] };
  expect(await snapshot(1, respond(empty))).toEqual(empty);
  expect(await snapshot(1, respond({ processes: [root, kid], owners: [10] }))).toEqual({
    processes: [root, kid],
    owners: [10],
  });
  for (const payload of ["{}", "not json", JSON.stringify({ processes: [{ pid: "x" }] })])
    await expect(snapshot(1, respond(payload))).rejects.toThrow();
});
test("终止前核对 pid 与创建时间，失败明确抛出", async (): Promise<void> => {
  const scripts: string[] = [];
  await terminate([root], async (script: string): Promise<string> => {
    scripts.push(script);
    return "";
  });
  // 身份列表以 base64 内联进脚本，故从 FromBase64String 的参数取值。
  const encoded = scripts[0].match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)![1];
  expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(JSON.stringify([root]));
  // 身份复核条件必须在脚本里：只凭 pid 终止会误杀重用 pid 的外部进程。
  expect(scripts[0]).toMatch(/CreationDate/);
  await expect(
    terminate([root], async (): Promise<string> => {
      throw new Error("cannot terminate");
    }),
  ).rejects.toThrow(/cannot terminate/);
});
test("适配器把端口与身份转发给注入的 PowerShell", async (): Promise<void> => {
  const scripts: string[] = [];
  const platform = windowsPlatform(async (script: string): Promise<string> => {
    scripts.push(script);
    return script.includes("Invoke-CimMethod")
      ? ""
      : JSON.stringify({ processes: [root], owners: [10] });
  });
  expect((await platform.snapshot(3080)).owners).toEqual([10]);
  expect(scripts[0]).toContain("3080");
  await platform.terminate([root]);
  expect(scripts).toHaveLength(2);
});
onWindows("真实 PowerShell 可用且快照包含当前进程", async (): Promise<void> => {
  const current = await snapshot(1);
  expect(current.processes.some((p: Identity): boolean => p.pid === process.pid)).toBeTruthy();
  expect((await powershell("'hello'")).trim()).toBe("hello");
});
