---
id: aebde013-28c5-467b-8a82-a1e04feebf5c
---

# interface 值

## 为什么装入 typed nil 后接口值仍不等于 nil？

- 接口值: 保存动态类型和动态值;
- 理解模型: 接口值可理解为 `(动态类型, 动态值)`;
- nil interface: 动态类型和动态值都为空;
- 非 nil interface: 只要动态类型存在, 接口值就不等于 nil;
- typed nil: 带有具体类型的 nil，例如 `(*User)(nil)`；装入接口后动态类型仍在，因此接口非 nil;

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

- 判断方式: 优先在返回 error/interface 前避免把 nil 指针装入接口;

## 空接口 `interface{}` 与 any 是什么？ 有何代价？

- `interface{}`: 空方法集合接口;
- `any`: `interface{}` 的别名;
- 类型信息: 使用空接口会丢失具体静态类型;

```go
func printAny(v any) {
	fmt.Println(v)
}
```

- 类型恢复: `any` 仍保留动态类型和值，只是静态接口没有具体操作；需要具体行为时使用[类型断言](./030-类型断言.md)或改用更窄的接口;
