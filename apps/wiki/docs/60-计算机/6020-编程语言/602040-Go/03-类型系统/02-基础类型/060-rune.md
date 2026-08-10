---
id: dcaa06ae-1aef-5727-a493-a86a6a6bc737
---

# rune

字符码点是什么？字符字面量是什么？双引号和单引号的区别是什么？字符串遍历如何完成？

## 字符码点

### 字符码点的写法

```go
package main

import "fmt"

func main() {
	var r rune = '中'     // rune 是 int32 别名, 表示 Unicode code point
	fmt.Printf("%c %U\n", r, r) // %c 显示字符; %U 显示 Unicode 码点
}
```

## 字符字面量

```go
func main() {
	a := 'a'        // rune literal
	newline := '\n' // 转义字符
	han := '\u4e2d' // Unicode code point
	println(a, newline, han) // 97 10 20013
}
```

## 双引号和单引号的区别

| 写法   | 类型   | 含义                         |
| ------ | ------ | ---------------------------- |
| `"a"`  | string | 字符串, 底层为只读 byte 序列 |
| `'a'`  | rune   | 字符码点, 本质为 int32       |
| `"中"` | string | UTF-8 编码后的多个 byte      |
| `'中'` | rune   | 单个 Unicode code point      |

```go
func main() {
	s := "a" // 双引号; string
	r := 'a' // 单引号; rune, 输出数值为 97
	println(s, r) // a 97
}
```

## 字符串遍历

### 字符串遍历的核心规则

- `range string`: 按 UTF-8 解码后遍历 rune;
- range index: 当前 rune 在原字符串中的起始 byte 位置;

### 字符串遍历的写法

```go
package main

import "fmt"

func main() {
	for index, r := range "Go语言" {
		fmt.Println(index, r, string(r)) // index 为起始字节位置; r 为当前 rune
	}
}
// 0 71 G --- 1 byte
// 1 111 o --- 1 byte
// 2 35821 语 --- 3 bytes
// 5 35328 言 --- 3 bytes
```
