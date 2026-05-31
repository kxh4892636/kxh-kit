# PowerShell History Summary

Source range: local Codex history from one Windows workstation, reviewed on 2026-05-31 and generalized for any Windows computer.

Privacy rule: this summary keeps only generalized engineering patterns. User-specific paths, project names, and raw conversation transcripts are intentionally omitted.

## Extracted Signals

1. PowerShell Chinese display required explicit UTF-8 setup.

   In the representative repair session, the reliable final state was a verified PowerShell 7 executable, `chcp 65001`, console input/output encoding `65001`, and readable `中文测试` from both PowerShell and `cmd /c echo`. A current-user PowerShell profile set UTF-8 on new `pwsh` sessions.

2. WindowsApps/MSIX PowerShell stubs are not reliable for Codex automation.

   History showed a per-user PowerShell path could exist but fail with `Access is denied`, while a standard PowerShell 7 install worked. The skill therefore prefers verifying `Get-Command pwsh` and avoiding blind trust in app execution aliases.

3. Codex shell configuration needed careful UTF-8 preserving writes.

   The historical config fix used `integratedTerminalShell = "powershell"` and `runCodexInWindowsSubsystemForLinux = false`. A failed attempt came from PowerShell string escaping, not from the target TOML change. The successful attempt backed up the config, used simpler quoting, and wrote UTF-8 without BOM.

4. PowerShell regex and quoting can break inline JavaScript.

   A Drizzle ORM skill extraction session ran a `node -e` command containing a JavaScript regex inside a PowerShell double-quoted string. PowerShell parsed part of the regex and failed with `ParserError: Missing type name after '['`. Retrying with a PowerShell single-quoted outer string avoided the parse failure.

5. Dynamic regex patterns in PowerShell need escaping or replacement with literal filtering.

   A config inspection attempted to include a TOML project key with quotes and backslashes inside `Select-String -Pattern`, producing an invalid regex. Splitting the file into lines and using simpler filters succeeded. The general rule is to use `[regex]::Escape()` for dynamic literals or avoid regex when literal matching is enough.

6. PowerShell statement blocks do not pipe like expressions.

   Multiple history entries showed `ParserError` near a pipe following a closing brace. The stable pattern is to collect `foreach` output first, use a pipeline-native `ForEach-Object`, or wrap a script block explicitly before piping.

7. Windows Git line-ending behavior caused real workflow noise.

   History showed warnings such as `LF will be replaced by CRLF`, especially around shell hooks. One task used a narrow `.gitattributes` rule to keep hook files LF. Another task showed many files appearing modified after line-ending configuration changes, while real content diff was much smaller. The skill treats line endings as a verification target and avoids broad churn.

8. Live Codex history files can be locked.

   During this extraction, several active JSONL files could not be read with normal `ReadLines` because Codex still held them open. Use shared read access for live logs or record the file as locked rather than treating it as missing.

9. Destructive actions in PowerShell need path resolution and `-LiteralPath`.

   Historical deletion commands verified resolved paths against the workspace before `Remove-Item`. This pattern should be reused for recursive delete or move operations, and not split between PowerShell enumeration and `cmd /c` destructive commands.

## Representative Validation Prompts

Use these when evaluating future revisions of the skill:

- "Run a PowerShell command on Windows that reads a Markdown file with Chinese paths and confirms the output is not mojibake."
- "Generate a repo text file from PowerShell that must be UTF-8 without BOM and LF-only, then verify it."
- "Use PowerShell to run a `node -e` snippet containing a JavaScript regex and template syntax without triggering a PowerShell `ParserError`."
- "Inspect active Codex JSONL sessions for PowerShell errors without failing on files currently locked by Codex."
