---
name: powershell
description: PowerShell 安全规则。每当在 Windows 上运行 `shell_command`，或显式调用 `pwsh` / `powershell.exe` 时使用；覆盖 UTF-8/LF 文本、字面量路径、原生程序、嵌入代码和破坏性文件操作。
---

# PowerShell

让 Windows 命令以字面、UTF-8、有边界且可验证的方式运行。更新本 skill 或追查某条规则的来源时，读取 [`references/history-summary.md`](references/history-summary.md)；普通命令不加载这份历史材料。

## 执行步骤

1. **标记风险分支**

   一条命令可以命中多个分支；执行前读取每个命中分支的引用：

   - 输出含非 ASCII 文本、写入文本，或输出会被继续解析：读取 [`references/text-files.md`](references/text-files.md)。
   - 调用 `git`、`rg`、`node`、`python` 或其他原生程序：读取 [`references/native-programs.md`](references/native-programs.md)。
   - 嵌入 JavaScript、Python、regex、模板语法、here-string 或多层引号：读取 [`references/quoting.md`](references/quoting.md)。
   - 使用通配符、缓存/版本化路径、可能不存在的路径，或枚举、复制目录内容：读取 [`references/paths.md`](references/paths.md)。
   - 递归删除或移动：读取 [`references/destructive-filesystem.md`](references/destructive-filesystem.md)。
   - 显式启动 `pwsh`、读取活跃 Codex 日志或启动后台进程：读取 [`references/windows-runtime.md`](references/windows-runtime.md)。

   **完成标准：** 命令的每一种风险都已映射到规则；没有命中分支的短只读命令无需加载引用。

2. **构造最短安全命令**

   - cmdlet 提供 `-LiteralPath` 时，不需要通配展开的路径默认使用它；需要展开通配符时，先按路径分支确定由 PowerShell 还是原生程序解释。
   - 调用原生程序时，把可执行文件和参数作为独立值传递；出现嵌套解析时应用引用规则，不拼接一条脆弱的命令字符串。
   - 编辑仓库文件使用 `apply_patch`。只有程序本身必须生成文本时，才让 PowerShell 写文件，并应用文本分支的编码与换行规则。
   - 递归删除或移动全程留在 PowerShell 中；解析并验证源、目标和预期根目录后，才调用 `Remove-Item` 或 `Move-Item`。

   **完成标准：** 每个命中分支的防护都已体现在待执行命令中，且所有破坏性路径已经过严格子路径验证。

3. **执行并保留真实结果**

   使用一个 shell 完成同一文件操作。原生程序返回后立即保存 `$LASTEXITCODE`，按该程序的退出码契约区分“成功”“预期的否定结果”和“错误”；处理预期非零值后显式归一化最终退出状态，再执行后续操作。

   **完成标准：** 每个非零退出码都已分类；预期的否定结果不会误报失败，未处理的错误也不会被后续成功命令掩盖。

4. **按风险验证**

   执行所有已加载引用中的验证。文本改动还要检查实际 diff；文件操作只核对用户指定的源和目标，不扩大检查或修改范围。

   **完成标准：** 第 1 步标记的每个风险都有对应证据，命令结果符合预期，且没有无关文件变化。
