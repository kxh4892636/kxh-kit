---
name: powershell
description: Windows/Codex 中 PowerShell 的通用安全与可靠性规则。每当 Codex 要在 Windows 上运行 PowerShell、pwsh、powershell.exe、shell_command，或任何会被 PowerShell 解释的命令时，都必须使用本 skill，即使用户没有明确提到 PowerShell。在任何 Windows 电脑上使用 Codex 时都必须启用。它用于避免常见 Windows 问题：中文乱码、非 UTF-8 输出、CRLF/LF 漂移、脆弱的引用、内联 JS/regex 解析错误、实时日志文件锁、危险删除，以及 pwsh 路径或 WindowsApps 桩程序混淆。
---

# PowerShell

在任何 Windows 电脑上的 Codex 中运行 PowerShell 命令前，都要使用本 skill。目标很简单：命令应保留中文文本，产生可预测的 UTF-8 输出，让生成的文本文件保持 LF 换行，并避免 PowerShell 解析带来的意外。

这是一个通用 Windows skill。它来自真实的 Codex-on-Windows 失败模式，但所有路径和示例都应根据当前机器调整。更新本 skill 或诊断某条规则存在的原因时，查看 `references/history-summary.md`。

## 完成标准

只有满足以下条件，PowerShell 操作才算准备就绪：

- 命令输出和写入文件中的中文路径与文本保持可读。
- 新增或修改的文本文件使用 UTF-8 无 BOM 和 LF，除非现有文件明确要求其他格式。
- 内联命令不会让 PowerShell 意外解析其他语言的语法。
- 路径按字面量处理，尤其是包含中文、空格、方括号或通配符的路径。
- 破坏性操作在修改或删除任何内容前，先验证解析后的目标路径。

## 每条命令的第一步

当输出可能包含中文、会写入文本，或输出将被解析时，PowerShell 命令开头应加入 UTF-8 与纯文本输出前置设置：

```powershell
$ErrorActionPreference = 'Stop'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
if (Get-Variable PSStyle -ErrorAction SilentlyContinue) { $PSStyle.OutputRendering = 'PlainText' }
try { chcp 65001 > $null } catch {}
```

如果调用 `pwsh -NoProfile`，要把这段前置设置包含在被调用的命令内部，因为 `-NoProfile` 会绕过通常负责设置 UTF-8 的 profile。

## 中文与 UTF-8

显式启动 PowerShell 时，优先使用已验证的 PowerShell 7 可执行文件。应在当前机器上解析路径，而不是硬编码某个用户专属路径：

```powershell
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source
& $pwsh -NoLogo -Command '$PSVersionTable.PSVersion.ToString(); chcp; [Console]::InputEncoding.CodePage; [Console]::OutputEncoding.CodePage; Write-Output "中文测试"; cmd /c echo 中文测试'
```

不要只依赖 `$env:LOCALAPPDATA\Microsoft\WindowsApps` 或其他按用户配置的应用执行别名来做 Codex 自动化；桩路径可能存在，但仍会因 `Access is denied` 失败。用以下命令验证：

```powershell
Get-Command pwsh -ErrorAction Stop | Format-List Source,Version
```

如果缺少 `pwsh`，或它解析到不可靠的应用别名，就检查标准安装位置，例如 `$env:ProgramFiles\PowerShell\7\pwsh.exe`，并使用该机器的常规 Windows 安装程序安装 PowerShell 7。

读取文本时显式指定编码：

```powershell
Get-Content -LiteralPath $path -Encoding UTF8 -Raw
```

当 PowerShell 必须写入文本时，先规范化为 LF，再以 UTF-8 无 BOM 写入：

```powershell
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
$text = $text -replace "`r`n?", "`n"
[System.IO.File]::WriteAllText($path, $text, $Utf8NoBom)
```

编辑仓库文件时，优先使用 `apply_patch`，而不是 `Set-Content`、`Out-File` 或重定向。Windows PowerShell 默认行为和 shell 重定向可能静默改变编码或换行符。

## LF 换行

生成或修改文本文件时，默认使用 LF。对于脚本、hook、Markdown、skills、生成文档，以及会被类 Unix 工具消费的文件，要把 Git 的 `LF will be replaced by CRLF` 等警告视为真实风险。

使用聚焦验证：

```powershell
git diff --check
git ls-files --eol -- <path>
```

如果某个 shell hook 或脚本在 Windows 上必须始终保持 LF，就添加尽可能窄的 `.gitattributes` 规则，例如：

```gitattributes
.vite-hooks/* text eol=lf
```

不要为了消除状态噪音而做大范围换行符变更。全局换行符变更可能让数百个文件显示为已修改，而真实内容改动其实很小。

## 引用规则

在 `node`、`python`、`git` 或其他程序看到命令之前，PowerShell 会先解析命令。包含 regex、`$`、反引号、引号、`[]` 或模板字符串的内联代码风险很高。

对于 `node -e`，外层使用 PowerShell 单引号字符串，内部使用 JavaScript 双引号：

```powershell
node -e 'fetch("https://example.com").then(r=>r.text()).then(t=>{const re=/href="([^"]+)"/g; console.log(t.length)})'
```

避免以下写法，因为在 Node 收到代码前，PowerShell 可能先解析 `[` 或 `$`：

```powershell
node -e "const re=/href=\"([^\"]+)\"/g; console.log(`${1}`)"
```

在 PowerShell 中使用动态 regex pattern 时，要转义动态文本：

```powershell
$pattern = [regex]::Escape($literalText)
Select-String -LiteralPath $path -Pattern $pattern
```

如果命令超过几行，或包含嵌套引用，就把逻辑移到仓库中的真实脚本里，或使用该语言的原生工具。避免使用 here-string，除非它显然是最不脆弱的选项。如果无法避免 here-string，它的 `@'` 和 `'@` 分隔符必须在各自行的第 1 列开始，且不能有尾随空格。

不要从 `foreach (...) { ... } | Sort-Object` 这样的语句块直接接管道。PowerShell 可能把 `}` 后面的管道当作非法语法。使用原生管道 cmdlet，或先收集结果：

```powershell
$items = foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root
}
$items | Sort-Object Name
```

## 路径与删除

默认使用 `-LiteralPath`。不要把 PowerShell 展开的路径传给 `cmd /c` 来删除或移动。

递归删除或移动前，解析并验证绝对目标路径仍在预期根目录内：

```powershell
$intendedRoot = (Resolve-Path -LiteralPath $intendedRootPath).Path
$target = (Resolve-Path -LiteralPath $targetPath).Path
if (-not $target.StartsWith($intendedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Target is outside intended root: $target"
}
Remove-Item -LiteralPath $target -Recurse -Force
```

对于后台 GUI 或辅助进程，除非用户明确要求可见的交互窗口，否则使用 `Start-Process -WindowStyle Hidden`。

## 实时 Codex 日志

正在运行的应用可能锁定活跃的 Codex JSONL 历史文件。如果 `ReadLines` 或 `Get-Content` 因 "being used by another process" 失败，就用共享读访问重新打开：

```powershell
$share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
$fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
try {
    $reader = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)
    $text = $reader.ReadToEnd()
} finally {
    if ($reader) { $reader.Dispose() } else { $fs.Dispose() }
}
```

不要把被锁定的历史文件当成缺失数据；应记录它处于锁定状态，并使用共享读，或只跳过那个活跃文件。

## Codex Windows Shell 设置

Windows 上常见的 Codex Desktop 配置形态：

```toml
[desktop]
integratedTerminalShell = "powershell"
runCodexInWindowsSubsystemForLinux = false
```

修改 Codex 配置前，先备份，以 UTF-8 读取和写入，并验证中文项目路径仍然能正确显示。优先依据当前已安装 Codex 版本的事实，而不是假设，因为 shell 解析可能在不同版本之间变化。

使用当前用户的 PowerShell profile 路径来持久化 UTF-8 行为：

```powershell
# $PROFILE.CurrentUserCurrentHost
try { chcp 65001 > $null } catch {}
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
```

## 快速验证

对于涉及文本或 Codex 配置的 PowerShell 任务，只运行与改动相关的检查：

```powershell
Get-Command pwsh -ErrorAction Stop | Format-List Source,Version
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source
& $pwsh -NoLogo -Command '$Utf8NoBom = New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding = $Utf8NoBom; [Console]::OutputEncoding = $Utf8NoBom; $OutputEncoding = $Utf8NoBom; chcp 65001 > $null; [Console]::InputEncoding.CodePage; [Console]::OutputEncoding.CodePage; Write-Output "中文测试"; cmd /c echo 中文测试'
git diff --check
```

预期编码结果是代码页 `65001`、UTF-8 控制台输入和输出，并且 PowerShell 与原生命令输出中的 `中文测试` 都可读。
