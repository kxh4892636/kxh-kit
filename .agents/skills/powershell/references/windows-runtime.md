# Windows PowerShell 运行态

显式启动 PowerShell、读取仍被 Codex 使用的日志或启动后台进程时，应用本规则。

## 解析 PowerShell 7

从当前机器收集候选并逐个实际执行；`Get-Command` 可能返回多个安装，因此不能把 `.Source` 的枚举结果直接当成一个路径：

```powershell
$candidates = @(
    (Get-Command pwsh -CommandType Application -All -ErrorAction SilentlyContinue).Source
    (Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe')
) | Select-Object -Unique

$pwsh = $null
foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        continue
    }
    try {
        $version = & $candidate -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
        if ($LASTEXITCODE -eq 0) {
            $pwsh = $candidate
            break
        }
    } catch {}
}
if ($null -eq $pwsh) {
    throw 'No executable PowerShell 7 candidate was found'
}
```

候选包含当前命令解析结果和标准安装位置，但不硬编码用户目录，也不只凭 WindowsApps 路径存在就判定可用。缺少可靠可执行文件时报告该事实；安装软件属于单独的用户授权操作。

子进程需要处理非 ASCII 文本时，把 [`text-files.md`](text-files.md) 的前置设置包含在 `-Command` 内，因为 `-NoProfile` 不加载 profile。

## 读取活跃 Codex 日志

活跃 JSONL 文件可能允许共享读但拒绝普通独占打开。使用 `ReadWrite` 与 `Delete` 共享模式：

```powershell
$share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
$fs = [System.IO.File]::Open(
    $path,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    $share
)
$reader = $null
try {
    $reader = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        # 在这里按时间或记录类型解析；只保留任务需要的聚合结果。
    }
} finally {
    if ($null -ne $reader) {
        $reader.Dispose()
    } else {
        $fs.Dispose()
    }
}
```

共享读仍失败时，把文件记录为活跃且暂不可读；其余日志继续处理，不把锁定误报为文件缺失。

## 扫描 Codex 会话历史

历史复盘只枚举 `sessions/` 与 `archived_sessions/` 下的 `*.jsonl`。先按文件时间缩小候选，再以记录内时间戳作为最终范围，并按 `session_id` 去重；当前活跃会话默认排除，避免把正在形成的结果当历史证据。

逐行共享读取并立即聚合。扫描范围保持在 JSONL，不使用 `rg -a` 遍历整个 Codex home；`state_*.sqlite`、cache、tmp 和 lock 文件可能是二进制或正在被占用，会产生乱码、噪声和锁冲突。

## 后台进程

后台 GUI 或辅助进程默认隐藏窗口：

```powershell
Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden
```

用户明确需要看见或操作该进程时，才使用可见窗口。完成时，`pwsh` 已通过实际执行验证，日志读取区分“锁定”和“缺失”，后台进程的可见性符合任务需求。
