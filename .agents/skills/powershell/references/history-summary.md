# PowerShell 历史总结

来源范围：来自一台 Windows 工作站的本地 Codex 历史记录，于 2026-05-31 审阅，并泛化为适用于任意 Windows 电脑的规则。

隐私规则：本总结只保留泛化后的工程模式。有意省略用户专属路径、项目名称和原始对话记录。

## 提取出的信号

1. PowerShell 中文显示需要显式 UTF-8 设置。

   在代表性修复会话中，可靠的最终状态包括：已验证的 PowerShell 7 可执行文件、`chcp 65001`、控制台输入/输出编码 `65001`，以及 PowerShell 和 `cmd /c echo` 中都可读的 `中文测试`。当前用户的 PowerShell profile 会在新的 `pwsh` 会话中设置 UTF-8。

2. WindowsApps/MSIX PowerShell 桩程序不适合可靠的 Codex 自动化。

   历史记录显示，按用户配置的 PowerShell 路径可能存在，但会因 `Access is denied` 失败，而标准 PowerShell 7 安装可以正常工作。因此本 skill 倾向于验证 `Get-Command pwsh`，避免盲目信任应用执行别名。

3. Codex shell 配置需要谨慎写入，以保留 UTF-8。

   历史配置修复使用了 `integratedTerminalShell = "powershell"` 和 `runCodexInWindowsSubsystemForLinux = false`。一次失败尝试来自 PowerShell 字符串转义，而不是目标 TOML 变更本身。成功尝试先备份配置，使用更简单的引用方式，并写入 UTF-8 无 BOM。

4. PowerShell regex 与引用可能破坏内联 JavaScript。

   一次 Drizzle ORM skill 提取会话运行了 `node -e` 命令，其中 JavaScript regex 放在 PowerShell 双引号字符串内。PowerShell 解析了 regex 的一部分，并以 `ParserError: Missing type name after '['` 失败。改用 PowerShell 单引号外层字符串后避免了解析失败。

5. PowerShell 中的动态 regex pattern 需要转义，或改用字面量过滤。

   一次配置检查尝试在 `Select-String -Pattern` 中包含带引号和反斜杠的 TOML 项目 key，导致 regex 无效。把文件拆成行并使用更简单的过滤后成功。通用规则是：对动态字面量使用 `[regex]::Escape()`，或在字面量匹配足够时避免 regex。

6. PowerShell 语句块不能像表达式那样接管道。

   多条历史记录显示，在右花括号后的管道附近出现 `ParserError`。稳定模式是先收集 `foreach` 输出、使用原生管道的 `ForEach-Object`，或在接管道前显式包裹脚本块。

7. Windows Git 换行符行为造成了真实的工作流噪音。

   历史记录显示了 `LF will be replaced by CRLF` 等警告，尤其出现在 shell hook 附近。一个任务使用窄范围 `.gitattributes` 规则让 hook 文件保持 LF。另一个任务显示，换行符配置变更后大量文件看似被修改，而真实内容 diff 小得多。本 skill 将换行符视为验证目标，并避免大范围扰动。

8. 实时 Codex 历史文件可能被锁定。

   在这次提取期间，多个活跃 JSONL 文件无法用普通 `ReadLines` 读取，因为 Codex 仍持有打开句柄。对实时日志使用共享读访问，或记录文件被锁定，而不是把它当成缺失。

9. PowerShell 中的破坏性操作需要路径解析和 `-LiteralPath`。

   历史删除命令在 `Remove-Item` 前，会用工作区验证解析后的路径。递归删除或移动操作应复用这种模式，不要拆成 PowerShell 枚举加 `cmd /c` 破坏性命令。

## 代表性验证提示

评估本 skill 未来修订时使用这些提示：

- "在 Windows 上运行一条 PowerShell 命令，读取带中文路径的 Markdown 文件，并确认输出没有乱码。"
- "用 PowerShell 生成一个仓库文本文件，要求 UTF-8 无 BOM 且仅使用 LF，然后验证它。"
- "使用 PowerShell 运行一个包含 JavaScript regex 和模板语法的 `node -e` 片段，不触发 PowerShell `ParserError`。"
- "检查活跃 Codex JSONL 会话中的 PowerShell 错误，并且不要因为当前被 Codex 锁定的文件而失败。"
