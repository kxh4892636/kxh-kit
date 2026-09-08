import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { delay } from "../contract.js";
const exec = promisify(execFile);
const processSchema = z.object({
  pid: z.number(),
  parent: z.number(),
  birth: z.string(),
  command: z.string().nullable(),
});
export type Identity = z.infer<typeof processSchema>;
export interface Snapshot {
  processes: Identity[];
  owners: number[];
}
export type PowerShell = (script: string) => Promise<string>;
export const powershell: PowerShell = async (script: string): Promise<string> => {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await exec(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout;
};
export const snapshot = async (port: number, run: PowerShell = powershell): Promise<Snapshot> => {
  const result = await run(`$ErrorActionPreference='Stop'
$p = @(Get-CimInstance Win32_Process | ForEach-Object { @{pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; birth=$_.CreationDate.ToUniversalTime().ToString('o'); command=$_.CommandLine} })
$n = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq ${port} | ForEach-Object { [int]$_.OwningProcess })
@{processes=$p; owners=$n} | ConvertTo-Json -Depth 4 -Compress`);
  return z
    .object({ processes: z.array(processSchema), owners: z.array(z.number()) })
    .parse(JSON.parse(result));
};
export const sameProcess = (a: Identity, b: Identity): boolean =>
  a.pid === b.pid && a.birth === b.birth && a.command === b.command;
export const descendants = (root: Identity, all: Identity[]): Identity[] => {
  const reused = all.find(
    (p: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
      p.pid === root.pid && !sameProcess(p, root),
  );
  const found = [root];
  for (let i = 0; i < found.length; i++) {
    for (const p of all) {
      if (
        p.parent === found[i].pid &&
        p.birth >= found[i].birth &&
        (!reused || p.birth < reused.birth) &&
        !found.some(
          (f: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
            f.pid === p.pid,
        )
      )
        found.push(p);
    }
  }
  return found.filter(
    (p: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
      all.some(
        (live: { pid: number; parent: number; birth: string; command: string | null }): boolean =>
          sameProcess(p, live),
      ),
  );
};
export const terminateTree = async (
  root: Identity,
  port: number,
  run: PowerShell = powershell,
): Promise<void> => {
  const tracked = [root];
  for (let attempt = 0; attempt < 10; attempt++) {
    const current = await snapshot(port, run);
    const owned = tracked
      .flatMap((ancestor: Identity): Identity[] => descendants(ancestor, current.processes))
      .filter(
        (p: Identity, index: number, list: Identity[]): boolean =>
          list.findIndex((v: Identity): boolean => sameProcess(p, v)) === index,
      );
    if (!owned.length) return;
    for (const p of owned)
      if (!tracked.some((v: Identity): boolean => sameProcess(p, v))) tracked.push(p);
    // 先停父进程以关闭派生入口；保留身份以追查两次快照间产生的后代。
    const identities = Buffer.from(JSON.stringify(owned), "utf8").toString("base64");
    await run(`$ErrorActionPreference='Stop'
$owned = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${identities}')) | ConvertFrom-Json
foreach ($item in @($owned)) {
  $p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$item.pid)
  if ($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $item.birth -and $p.CommandLine -eq $item.command) {
    $result=Invoke-CimMethod -InputObject $p -MethodName Terminate
    if ($result.ReturnValue -ne 0) { throw "Cannot terminate managed process" }
  }
}`);
    await delay(100);
  }
  throw new Error("Managed process tree did not exit");
};
