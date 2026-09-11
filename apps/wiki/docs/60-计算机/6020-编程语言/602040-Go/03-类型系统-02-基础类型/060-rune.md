---
id: dcaa06ae-1aef-5727-a493-a86a6a6bc737
---

# rune

## rune 与字符码点是什么关系？

- rune: `int32` 的别名，通常用来存放 Unicode 码点，即 Unicode 为字符分配的编号；一个用户看到的字符也可能由多个码点组成;

```go
package main

import "fmt"

func main() {
	var r rune = '中'     // rune 是 int32 别名, 表示 Unicode code point
	fmt.Printf("%c %U\n", r, r) // %c 显示字符; %U 显示 Unicode 码点
}
```

## 字符字面量有哪些写法？

```go
func main() {
	a := 'a'        // rune literal
	newline := '\n' // 转义字符
	han := '\u4e2d' // Unicode code point
	println(a, newline, han) // 97 10 20013
}
```

## 为什么单引号字符与双引号字符串不能互换？

| 写法   | 类型             | 含义                           |
| ------ | ---------------- | ------------------------------ |
| `"a"`  | string           | 字符串, 底层为只读 byte 序列   |
| `'a'`  | 无类型 rune 常量 | 字符码点，默认具体类型为 int32 |
| `"中"` | string           | UTF-8 编码后的多个 byte        |
| `'中'` | 无类型 rune 常量 | 单个 Unicode code point        |

```go
func main() {
	s := "a" // 双引号; string
	r := 'a' // 单引号; rune, 输出数值为 97
	println(s, r) // a 97
}
```

## 如何遍历字符串？ range 返回的索引是什么？

- `range string`: 按 UTF-8 解码后遍历 rune;
- range index: 当前 rune 在原字符串中的起始 byte 位置;

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

- 解码边界: 非法 UTF-8 字节会得到替换码点 `U+FFFD`，并前进一个字节；按 rune 遍历不等于按用户可见字符分割;
