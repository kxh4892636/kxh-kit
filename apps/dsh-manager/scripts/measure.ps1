param([string]$Executable = (Join-Path $PSScriptRoot '../dist/dsh-manager.exe'), [int]$IdleSeconds = 60)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DshMeasurement {
 public delegate bool EnumProc(IntPtr window, IntPtr parameter);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr window, int id);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
 public static IntPtr Find(int pid) {
  IntPtr result=IntPtr.Zero;
  EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==pid && GetDlgItem(h,112)!=IntPtr.Zero){result=h;return false;}return true;},IntPtr.Zero);
  return result;
 }
}
'@
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('dsh-perf-' + [Guid]::NewGuid().ToString('N'))
$taskData = Join-Path $taskRoot 'DSHManager'
New-Item -ItemType Directory -Path $taskData -Force | Out-Null
@{port=3080;directory=$env:USERPROFILE;node='';autoUpdate=$false;keepAlive=$false;login=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskData 'config.json')
$previousLocal = $env:LOCALAPPDATA
$env:LOCALAPPDATA = $taskRoot
$runs = @()
try {
 for ($sample=0; $sample -lt 6; $sample++) {
  $timer=[Diagnostics.Stopwatch]::StartNew()
  $child=Start-Process -FilePath (Resolve-Path -LiteralPath $Executable) -ArgumentList '--background' -WindowStyle Hidden -PassThru
  try {
   $window=[IntPtr]::Zero
   while ($window -eq [IntPtr]::Zero -and $timer.Elapsed.TotalSeconds -lt 10) {
    $window=[DshMeasurement]::Find($child.Id)
    if ($child.HasExited) {throw '管理器未创建窗口即退出'}
    if ($window -eq [IntPtr]::Zero) {Start-Sleep -Milliseconds 5}
   }
   if ($window -eq [IntPtr]::Zero) {throw '等待原生窗口超时'}
   $timer.Stop();$startup=$timer.Elapsed.TotalMilliseconds
   $cpuSeconds=$null
   if ($sample -eq 5) {
    Start-Sleep -Seconds 2
    $child.Refresh();$before=$child.TotalProcessorTime.TotalSeconds
    Start-Sleep -Seconds $IdleSeconds
    $child.Refresh();$cpuSeconds=$child.TotalProcessorTime.TotalSeconds-$before
   }
   $child.Refresh()
   if ($child.HasExited) {throw '测量期间管理器意外退出，结果无效'}
   $runs+= [pscustomobject]@{sample=$sample;startupMs=[Math]::Round($startup,2);workingSetMiB=[Math]::Round($child.WorkingSet64/1MB,2);idleCpuSeconds=$cpuSeconds}
  } finally {
   if ($window -ne [IntPtr]::Zero) {[void][DshMeasurement]::PostMessage($window,0x111,[IntPtr]400,[IntPtr]::Zero)}
   if (-not $child.WaitForExit(10000)) {throw "测试管理器未正常退出，PID=$($child.Id)"}
  }
 }
 [pscustomobject]@{os=[Environment]::OSVersion.VersionString;executable=(Resolve-Path -LiteralPath $Executable).Path;idleSeconds=$IdleSeconds;runs=$runs} | ConvertTo-Json -Depth 4
} finally { $env:LOCALAPPDATA=$previousLocal }
