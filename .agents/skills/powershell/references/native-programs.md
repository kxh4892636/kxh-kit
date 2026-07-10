# 原生程序

调用 `git`、`rg`、`node`、`python` 或其他原生可执行文件时，应用本规则。PowerShell 先解析参数，原生程序再按自己的参数与退出码契约解释结果。

## 解析可执行文件

优先使用当前工具或运行环境提供的已验证绝对路径。否则从当前机器发现候选，并明确选择一个可执行文件：

```powershell
$command = Get-Command rg -CommandType Application -ErrorAction Stop |
    Select-Object -First 1
$rg = $command.Source
```

当 `Get-Command -All` 返回多个候选时，逐个验证实际可执行性；PowerShell 7 的完整探测示例见 [`windows-runtime.md`](windows-runtime.md)。缓存、插件版本目录或用户专属安装路径先按 [`paths.md`](paths.md) 发现，避免硬编码旧版本路径。

## 参数与通配符

把可执行文件、选项和每个参数作为独立值传递。PowerShell 不会可靠地替原生程序展开 `*.md` 这类路径通配符；使用程序自己的 glob 选项，或先枚举文件再传绝对路径：

```powershell
& $rg -n $pattern -g '*.md' $root
$code = $LASTEXITCODE
```

路径需要 PowerShell 枚举时，使用 [`paths.md`](paths.md) 的字面路径规则。嵌入源码、regex 或多层引号时，同时应用 [`quoting.md`](quoting.md)。

## 退出码契约

原生程序返回后立即保存 `$LASTEXITCODE`，再运行任何其他原生程序。查询型命令常用非零值表达“否定”而不是错误，例如 `rg` 用 `1` 表示无匹配：

```powershell
& $rg -n $pattern -g '*.md' $root
$code = $LASTEXITCODE
switch ($code) {
    0 { $matched = $true }
    1 { $matched = $false }
    default { throw "rg failed with exit code $code" }
}
$global:LASTEXITCODE = 0
[pscustomobject]@{ Matched = $matched }
```

只把程序文档明确列出的值当作预期结果。`git check-ignore`、`git diff --quiet` 等命令也有自己的 `0` / `1` 语义；读取其契约后再映射。处理后的顶层 shell 显式归一化为成功，未列出的退出码抛错。

完成时，实际可执行文件已确定，参数没有被 PowerShell 或通配符意外改写，每个退出码都已按契约分类。
