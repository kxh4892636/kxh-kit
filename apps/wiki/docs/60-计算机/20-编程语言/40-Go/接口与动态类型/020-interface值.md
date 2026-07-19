---
id: aebde013-28c5-467b-8a82-a1e04feebf5c
---

# interface 值

## 动态类型与动态值

### 概念

- 接口值: 保存动态类型和动态值;
- 理解模型: 接口值可理解为 `(动态类型, 动态值)`;
- nil interface: 动态类型和动态值都为空;
- 非 nil interface: 只要动态类型存在，接口值就不等于 nil;
- typed nil: 具体类型为指针、值为 nil 的动态值;

## typed nil

### 语法格式

```go
package main

import "fmt"

type User struct{}

func (u *User) String() string {
	return "user"
}

func main() {
	var v fmt.Stringer

	// v 可理解为 (nil, nil)
	fmt.Println(v == nil) // true

	var u *User = nil

	// v 可理解为 (*User, nil)
	v = u
	fmt.Println(u == nil) // true
	fmt.Println(v == nil) // false
}
```

## typed nil 边界

- 常见陷阱: 保存 nil 指针的接口值不等于 nil;
- 判断方式: 优先在返回 error/interface 前避免把 nil 指针装入接口;

## 空接口

### 概念

- `interface{}`: 空方法集合接口;
- `any`: `interface{}` 的别名;
- 类型信息: 使用空接口会丢失具体静态类型;

### 语法格式

```go
func printAny(v any) {
	fmt.Println(v)
}
```
