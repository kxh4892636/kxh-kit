# 路径发现与通配符

当路径来自变量、缓存或版本化目录，可能不存在，包含特殊字符，或操作需要通配符和目录内容时，应用本规则。

## 发现并固定路径

必须存在的路径用 `Resolve-Path -LiteralPath -ErrorAction Stop` 解析一次，后续复用解析结果：

```powershell
$resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
```

可选路径先用 `Test-Path -LiteralPath` 分支处理。缓存、插件或版本化目录先枚举当前实际目录，再选择符合任务的版本；文件系统事实优先于历史路径或硬编码版本号。

## 字面路径与通配符

`-LiteralPath` 把 `*`、`?` 和 `[]` 当普通字符，不会展开。处理目录内容时先字面枚举，再逐项传递：

```powershell
$children = Get-ChildItem -LiteralPath $source -Force
foreach ($child in $children) {
    Copy-Item -LiteralPath $child.FullName -Destination $target -Recurse -Force
}
```

原生程序同样不应依赖 PowerShell 展开路径通配符；使用程序自己的 glob 参数，或把枚举得到的绝对路径作为参数。具体规则见 [`native-programs.md`](native-programs.md)。

## 创建动态目录

cmdlet 的参数集合并不一致；只有 `Get-Command <cmdlet> -Syntax` 证明支持时才使用 `-LiteralPath`。`New-Item` 没有 `-LiteralPath`，创建已验证的动态目录可使用 .NET 字面 API：

```powershell
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$resolvedDirectory = (Resolve-Path -LiteralPath $directory -ErrorAction Stop).Path
```

仓库文本文件仍使用 `apply_patch` 创建或编辑。完成时，必需路径已解析，可选路径已显式分支，通配符只在负责解释它的层级出现。
