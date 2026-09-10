import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseSnapshot,
  type Identity,
  type ProcessSnapshot,
  type ProcessSource,
} from "./processes.js";
const exec = promisify(execFile);
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
// Windows 进程退出后 CommandLine 变为 null，与 POSIX 僵尸进程的语义一致。
export const snapshot = async (
  port: number,
  run: PowerShell = powershell,
): Promise<ProcessSnapshot> => {
  const result = await run(`$ErrorActionPreference='Stop'
$p = @(Get-CimInstance Win32_Process | ForEach-Object { @{pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; birth=$_.CreationDate.ToUniversalTime().ToString('o'); command=$_.CommandLine} })
$n = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq ${port} | ForEach-Object { [int]$_.OwningProcess })
@{processes=$p; owners=$n} | ConvertTo-Json -Depth 4 -Compress`);
  return parseSnapshot(JSON.parse(result));
};
// 终止前重新核对身份：pid 与创建时间同时相符才结束进程，避免误杀重用 pid 的外部进程。
export const terminate = async (
  identities: Identity[],
  run: PowerShell = powershell,
): Promise<void> => {
  const encoded = Buffer.from(JSON.stringify(identities), "utf8").toString("base64");
  await run(`$ErrorActionPreference='Stop'
$owned = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
foreach ($item in @($owned)) {
  $p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$item.pid)
  if ($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $item.birth) {
    $result=Invoke-CimMethod -InputObject $p -MethodName Terminate
    if ($result.ReturnValue -ne 0) { throw "Cannot terminate managed process" }
  }
}`);
};
export const windowsPlatform = (run: PowerShell = powershell): ProcessSource => ({
  snapshot: (port: number): Promise<ProcessSnapshot> => snapshot(port, run),
  terminate: (identities: Identity[]): Promise<void> => terminate(identities, run),
});
