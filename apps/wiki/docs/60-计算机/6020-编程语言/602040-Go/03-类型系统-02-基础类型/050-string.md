---
id: 3178e108-4c42-5024-a4dc-afe901d128be
---

# string

## 为什么 string 按字节索引且不能原地修改？

```go
func main() {
	s := "hello"  // string 为不可变字节序列
	println(len(s)) // len 返回底层字节数
}
```

- string 底层: 只读字节序列;
- 编码约定: Go 源码中的字符串字面量通常为 UTF-8;
- 索引结果: `s[i]` 返回 byte, 不返回 rune;
- 修改限制: string 不可原地修改;

```go
s := "语言"
println(len(s), s[0]) // 6 个字节；索引得到第一个 UTF-8 字节
```

- 字符计数: Unicode 码点与字节不是同一单位，需要按字符解码时见[rune](./060-rune.md);

## 字符串字面量如何表达转义文本与原始文本？

- 双引号: 解释 `\n` 等反斜杠转义，适合需要换行、制表符等控制字符的文本;
- 反引号: 保留原始文本与换行，不解释反斜杠转义；内容不能直接包含反引号;

```go
escaped := "line1\nline2"
path := `C:\tmp\file.txt`
println(escaped, path)
```

## 字符串如何比较？ 排序语义有何不同？

- string 可比较: 可使用 `==`, `!=`, `<`, `<=`, `>`, `>=`;
- 比较方式: 按字节序列逐字节比较;
- 排序语义: 不等于自然语言排序;

```go
func main() {
	println("go" == "go") // true
	println("abc" < "abd") // true; 按字节序比较
}
```
