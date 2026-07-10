# PowerShell 历史总结

来源范围：来自一台 Windows 工作站的本地 Codex 历史记录。初次审阅于 2026-05-31；最近一次增量复盘覆盖上海时区 2026-06-28 00:00 至 2026-07-11 23:59，并泛化为适用于任意 Windows 电脑的规则。

隐私规则：本总结只保留泛化后的工程模式。有意省略用户专属路径、项目名称和原始对话记录。

## 2026-07-11 增量复盘

本次按记录内时间戳筛选并按 session ID 去重，排除当前活跃会话。最终覆盖 102 个会话、19,195 条范围内记录和 2,938 次已完成的 shell/exec 调用，其中 148 次返回失败。1 条 JSONL 记录无法解析，4 个调用在范围内没有对应输出；未把这些不完整项用于规则判断。

提取出的新增信号：

1. 查询型原生命令的非零退出码需要按契约解释。

   37 次失败、分布于 16 个会话，来自 `rg` 等命令用 `1` 表示“无匹配”，却被外层 shell 当成任务失败。稳定做法是立即保存 `$LASTEXITCODE`，映射已知的否定结果，拒绝未知值，并显式归一化已处理结果。

2. 通配符必须由正确的层级解释。

   代表性失败包括把 `*.md` 直接传给原生程序，以及把 `*` 放进 `-LiteralPath`。PowerShell 不会替所有原生程序展开通配符，而 `-LiteralPath` 明确把星号当普通字符。稳定做法是使用原生程序的 glob 选项，或先字面枚举再逐项传递。

3. PowerShell 解析边界仍是高频失败源。

   18 次 parser failure 分布于 9 个会话。重复模式包括 `foreach { ... } | ...`、双引号中的 `$path:` / `$i:`，以及动态 regex 的反斜杠。稳定做法是先收集语句块结果、用 `${name}` 划定变量边界，并优先选择字面路径判断。

4. 路径发现应先于依赖路径的命令。

   18 次路径错误分布于 15 个会话，代表性原因是缓存版本已经变化、可选目录不存在，以及把字面通配符当真实路径。稳定做法是先发现当前路径，区分必需与可选路径，解析一次后复用。

5. Codex 历史扫描必须限定为文本会话数据。

   对整个 Codex home 使用 `rg -a` 会进入 SQLite、cache、tmp 和 lock 文件，产生二进制乱码与文件锁错误。稳定做法是只枚举 JSONL、共享读取、按内容时间戳过滤并输出脱敏聚合。

6. 有意保留 CRLF 的文件需要匹配其 EOL 的 Git 空白检查。

   代表性会话中，普通 `git diff --check` 把新增 CRLF 行的 CR 当成尾随空白。使用 `core.whitespace=cr-at-eol` 做聚焦检查，并用 `git ls-files --eol` 证明实际行尾，可避免整文件换行扰动。

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
- "使用 `rg` 检查一个没有匹配的模式，把结果解释为 `Matched = false`，同时让顶层 shell 成功结束。"
- "复制目录内容时保留字面根路径，让通配符只由明确选定的层级解释。"
- "检查活跃 Codex JSONL 会话中的 PowerShell 错误，并且不要因为当前被 Codex 锁定的文件而失败。"
