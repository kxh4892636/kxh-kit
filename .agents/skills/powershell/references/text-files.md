# 文本、编码与换行

当命令输出非 ASCII 文本、写入文本文件，或其输出会被其他程序解析时，应用本规则。

## 命令前置设置

把以下设置放在命令开头：

```powershell
$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
if (Get-Variable PSStyle -ErrorAction SilentlyContinue) {
    $PSStyle.OutputRendering = 'PlainText'
}
try { chcp 65001 > $null } catch {}
```

使用 `pwsh -NoProfile` 启动子进程时，把同样的设置放进子进程命令；父进程设置不会替代被 `-NoProfile` 跳过的 profile。

## 读取与写入

读取文本时显式指定编码：

```powershell
Get-Content -LiteralPath $path -Encoding UTF8 -Raw
```

程序必须直接写入时，先规范化为 LF，再以 UTF-8 无 BOM 写入：

```powershell
$text = $text -replace "`r`n?", "`n"
[System.IO.File]::WriteAllText($path, $text, $Utf8NoBom)
```

只有目标文件已有明确的 BOM、CRLF 或其他编码约定时，才沿用该约定；先读取实际字节或仓库规则，不依赖 PowerShell 版本默认值。

## 验证

非 ASCII 输出需要实际回显代表性文本；涉及原生程序时同时验证原生程序的输出：

```powershell
Write-Output '中文测试'
cmd /c echo 中文测试
```

对要求 UTF-8 无 BOM 与 LF 的文件做字节级检查：

```powershell
$bytes = [System.IO.File]::ReadAllBytes($path)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "UTF-8 BOM found: $path"
}
$strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
$decoded = $strictUtf8.GetString($bytes)
if ($decoded.Contains("`r")) {
    throw "CR or CRLF found: $path"
}
```

仓库中的 LF 文件运行：

```powershell
git diff --check -- <path>
git ls-files --eol -- <path>
```

文件已有明确的 CRLF 约定时，让 Git 把行尾 CR 视为合法，再检查实际 EOL；这样不会把新增 CRLF 行误报为尾随空白：

```powershell
git -c core.whitespace=cr-at-eol diff --check -- <path>
git ls-files --eol -- <path>
```

完成时，代表性非 ASCII 输出可读；每个修改文件都符合其已确认的编码与换行约定，空白检查使用了与该 EOL 约定一致的模式。
