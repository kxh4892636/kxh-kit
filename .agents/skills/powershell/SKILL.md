---
name: powershell
description: General Windows/Codex PowerShell safety and reliability rules. Use this skill every time Codex will run PowerShell, pwsh, powershell.exe, shell_command on Windows, or any command that will be interpreted by PowerShell, even when the user did not explicitly mention PowerShell. Mandatory for Codex on any Windows computer. It prevents common Windows failures: Chinese text mojibake, non-UTF-8 output, CRLF/LF drift, fragile quoting, inline JS/regex parse errors, live log file locks, unsafe deletion, and pwsh path or WindowsApps stub confusion.
---

# PowerShell

Use this skill before every PowerShell command in Codex on any Windows computer. The goal is simple: commands should preserve Chinese text, produce predictable UTF-8 output, keep generated text files on LF line endings, and avoid PowerShell parsing surprises.

This is a general Windows skill. It was extracted from real Codex-on-Windows failure patterns, but all paths and examples should be adapted to the current machine. See `references/history-summary.md` when updating the skill or diagnosing why a rule exists.

## Completion Standard

A PowerShell action is ready only when these are true:

- Chinese paths and text remain readable in command output and written files.
- New or modified text files are UTF-8 without BOM and LF unless the existing file explicitly requires another format.
- Inline commands do not let PowerShell accidentally parse another language's syntax.
- Paths are handled literally, especially paths with Chinese, spaces, brackets, or wildcard characters.
- Destructive actions verify resolved target paths before changing or deleting anything.

## First Step In Every Command

Start PowerShell commands with the UTF-8 and plain-output prelude when output may contain Chinese, when text is written, or when output will be parsed:

```powershell
$ErrorActionPreference = 'Stop'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
if (Get-Variable PSStyle -ErrorAction SilentlyContinue) { $PSStyle.OutputRendering = 'PlainText' }
try { chcp 65001 > $null } catch {}
```

If calling `pwsh -NoProfile`, include this prelude inside the invoked command because `-NoProfile` bypasses the profile that normally sets UTF-8.

## Chinese And UTF-8

Prefer a verified PowerShell 7 executable when launching PowerShell explicitly. Resolve it on the current machine rather than hard-coding a user-specific path:

```powershell
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source
& $pwsh -NoLogo -Command '$PSVersionTable.PSVersion.ToString(); chcp; [Console]::InputEncoding.CodePage; [Console]::OutputEncoding.CodePage; Write-Output "中文测试"; cmd /c echo 中文测试'
```

Avoid relying only on `$env:LOCALAPPDATA\Microsoft\WindowsApps` or other per-user app execution aliases for Codex automation; a stub path can exist but still fail with `Access is denied`. Verify with:

```powershell
Get-Command pwsh -ErrorAction Stop | Format-List Source,Version
```

If `pwsh` is missing or resolves to an unreliable app alias, check standard install locations such as `$env:ProgramFiles\PowerShell\7\pwsh.exe` and install PowerShell 7 using the normal Windows installer for that machine.

Read text with explicit encoding:

```powershell
Get-Content -LiteralPath $path -Encoding UTF8 -Raw
```

When PowerShell must write text, normalize LF and write UTF-8 without BOM:

```powershell
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
$text = $text -replace "`r`n?", "`n"
[System.IO.File]::WriteAllText($path, $text, $Utf8NoBom)
```

For repo edits, prefer `apply_patch` over `Set-Content`, `Out-File`, or redirection. Windows PowerShell defaults and shell redirection can silently change encoding or line endings.

## LF Line Endings

Default generated or modified text files to LF. Treat Git warnings such as `LF will be replaced by CRLF` as real risk for scripts, hooks, Markdown, skills, generated docs, and files consumed by Unix-like tooling.

Use focused verification:

```powershell
git diff --check
git ls-files --eol -- <path>
```

If a shell hook or script must always stay LF on Windows, add the narrowest possible `.gitattributes` rule, for example:

```gitattributes
.vite-hooks/* text eol=lf
```

Do not make broad line-ending changes just to silence status noise. A global line-ending change can make hundreds of files appear modified while real content changes are small.

## Quoting Rules

PowerShell parses the command before `node`, `python`, `git`, or another program sees it. Inline code with regex, `$`, backticks, quotes, `[]`, or template strings is high risk.

For `node -e`, use a PowerShell single-quoted outer string and JavaScript double quotes inside:

```powershell
node -e 'fetch("https://example.com").then(r=>r.text()).then(t=>{const re=/href="([^"]+)"/g; console.log(t.length)})'
```

Avoid this shape because PowerShell can parse `[` or `$` before Node receives the code:

```powershell
node -e "const re=/href=\"([^\"]+)\"/g; console.log(`${1}`)"
```

For dynamic regex patterns in PowerShell, escape dynamic text:

```powershell
$pattern = [regex]::Escape($literalText)
Select-String -LiteralPath $path -Pattern $pattern
```

If a command grows beyond a few lines or contains nested quoting, move the logic into a real script in the repo or use the native tool for that language. Avoid here-strings unless they are clearly the least fragile option. If a here-string is unavoidable, its `@'` and `'@` delimiters must start at column 1 on their own lines with no trailing spaces.

Do not pipe directly from a statement block such as `foreach (...) { ... } | Sort-Object`. PowerShell can treat the pipe after `}` as invalid syntax. Use a pipeline-native cmdlet or collect first:

```powershell
$items = foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root
}
$items | Sort-Object Name
```

## Paths And Deletion

Use `-LiteralPath` by default. Do not pass PowerShell-expanded paths into `cmd /c` for deletion or moving.

Before recursive delete or move, resolve and verify the absolute target stays inside the intended root:

```powershell
$intendedRoot = (Resolve-Path -LiteralPath $intendedRootPath).Path
$target = (Resolve-Path -LiteralPath $targetPath).Path
if (-not $target.StartsWith($intendedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Target is outside intended root: $target"
}
Remove-Item -LiteralPath $target -Recurse -Force
```

For background GUI or helper processes, use `Start-Process -WindowStyle Hidden` unless the user explicitly asked for a visible interactive window.

## Live Codex Logs

Active Codex JSONL history files can be locked by the running app. If `ReadLines` or `Get-Content` fails with "being used by another process", reopen with shared read access:

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

Do not treat a locked history file as missing data; record it as a lock and use shared read or skip only that active file.

## Codex Windows Shell Setup

Common Codex Desktop configuration shape on Windows:

```toml
[desktop]
integratedTerminalShell = "powershell"
runCodexInWindowsSubsystemForLinux = false
```

Before changing Codex config, back it up, read and write it as UTF-8, and verify Chinese project paths still render correctly. Prefer facts from the current installed Codex version over assumptions, because shell resolution can change between releases.

Use the current user's PowerShell profile path for persistent UTF-8 behavior:

```powershell
# $PROFILE.CurrentUserCurrentHost
try { chcp 65001 > $null } catch {}
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
```

## Quick Verification

For a PowerShell task that touches text or Codex configuration, run only the checks relevant to the change:

```powershell
Get-Command pwsh -ErrorAction Stop | Format-List Source,Version
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source
& $pwsh -NoLogo -Command '$Utf8NoBom = New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding = $Utf8NoBom; [Console]::OutputEncoding = $Utf8NoBom; $OutputEncoding = $Utf8NoBom; chcp 65001 > $null; [Console]::InputEncoding.CodePage; [Console]::OutputEncoding.CodePage; Write-Output "中文测试"; cmd /c echo 中文测试'
git diff --check
```

Expected encoding result is code page `65001`, UTF-8 console input and output, and readable `中文测试` from both PowerShell and native command output.
