# PowerShell 解析边界

当 PowerShell 命令嵌入另一种语言、regex、模板语法、here-string 或多层引号时，应用本规则。目标是只跨越一个清晰的解析边界。

## 嵌入代码

单行代码使用 PowerShell 单引号包住整体，让内层语言使用双引号：

```powershell
node -e 'const re = /href="([^"]+)"/g; console.log(re.test(`href="ok"`))'
```

代码超过一行或出现嵌套引号、模板字符串、复杂 regex 时，把代码写入该语言的真实脚本，再把脚本路径作为独立参数执行。这样 PowerShell 只解析路径，不解析另一种语言的源码。

## Regex 与 here-string

动态文本作为 regex 字面量时先转义：

```powershell
$pattern = [regex]::Escape($literalText)
Select-String -LiteralPath $path -Pattern $pattern
```

here-string 仅在它能形成最简单解析边界时使用。开头标记后立即换行，结尾标记独占一行；为兼容 Windows PowerShell 与 PowerShell 7，把结尾标记放在第 1 列：

```powershell
$script = @'
console.log("$ remains literal")
'@
```

## 可展开字符串

双引号字符串中，变量后紧跟 `:` 或可能继续组成变量名的字符时，用花括号明确边界；否则 PowerShell 可能把它解析成作用域变量：

```powershell
"${path}:$lineNumber"
"${index}: $line"
```

需要组合多个值时，格式运算符能完全避开变量边界歧义：

```powershell
'{0}:{1}: {2}' -f $path, $lineNumber, $line
```

## 语句块输出

需要排序或筛选 `foreach` 语句的输出时，先收集结果，再接管道：

```powershell
$items = foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root
}
$items | Sort-Object Name
```

完成时，PowerShell 能解析命令，目标程序收到预期源码或参数，动态文本保持字面语义，可展开变量的边界明确。
