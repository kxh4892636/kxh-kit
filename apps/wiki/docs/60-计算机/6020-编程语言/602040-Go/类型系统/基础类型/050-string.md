---
id: 3178e108-4c42-5024-a4dc-afe901d128be
---

# string

## 字符串类型

### 语法格式

```go
func main() {
	s := "hello"  // string 为不可变字节序列
	println(len(s)) // len 返回底层字节数
}
```

## 内部存储

### 概念

- string 底层: 只读字节序列;
- 编码约定: Go 源码中的字符串字面量通常为 UTF-8;
- 索引结果: `s[i]` 返回 byte, 不返回 rune;
- 修改限制: string 不可原地修改;

### 语法格式

```go
func main() {
	s := "语言"
	println(len(s)) // 输出字节数, 不是字符数量
	println(s[0])   // 返回第 0 个 byte

	escaped := "line1\nline2" // 双引号字符串处理反斜杠转义
	path := `C:\tmp\file.txt` // 反引号字符串不处理反斜杠转义
	println(escaped, path)
}
```

## 字符串比较

### 概念

- string 可比较: 可使用 `==`、`!=`、`<`、`<=`、`>`、`>=`;
- 比较方式: 按字节序列逐字节比较;
- 排序语义: 不等于自然语言排序;

### 语法格式

```go
func main() {
	println("go" == "go") // true
	println("abc" < "abd") // true; 按字节序比较
}
```
