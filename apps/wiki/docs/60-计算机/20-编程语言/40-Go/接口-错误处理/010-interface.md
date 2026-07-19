---
id: bb87ade7-23f1-521c-abaf-99e693207181
---

# interface

## 基本概念

### 概念

- interface: 方法集合定义的抽象类型;
- 实现方式: 类型拥有接口要求的全部方法即实现接口;
- 隐式实现: 不需要写 `implements`;
- 接口值: 保存动态类型和动态值;

### 语法格式

```go
type Reader interface {
	Read(p []byte) (n int, err error) // 接口由方法集合定义
}
```

## 实现接口

```go
package main

import "fmt"

type User struct {
	Name string
}

// String 是 User 的方法, 不是普通函数
// (u User) 是 receiver, 表示这个方法属于 User 类型
// String() string 与 fmt.Stringer 要求的方法签名完全一致
func (u User) String() string {
	return u.Name
}

func printString(s fmt.Stringer) {
	// s 的静态类型是 fmt.Stringer, 因此只能直接调用 Stringer 接口声明的方法
	fmt.Println(s.String())
}

func main() {
	u := User{Name: "Tom"}

	// User 拥有 String() string 方法, 所以可以赋值给 fmt.Stringer
	var s fmt.Stringer = u
	fmt.Println(s.String()) // 输出 Tom

	// printString 需要 fmt.Stringer, User 自动满足该接口
	printString(u) // 输出 Tom
}
```

## 空接口

### 概念

- `interface{}`: 空方法集合接口;
- 类型信息: 使用空接口会丢失具体静态类型;

### 语法格式

```go
package main

import "fmt"

func printAny(v any) { // any 是 interface{} 的别名, 可接收任意类型
	fmt.Println(v)
}
```

## 接口变量

### 概念

- nil interface: 动态类型和动态值都为空;
- 非 nil interface: 只要动态类型存在, 接口值就不等于 nil;
- typed nil: 具体类型为指针、值为 nil 的动态值;
- 常见陷阱: 保存 nil 指针的接口值不等于 nil;
- 判断方式: 优先在返回 error/interface 前避免把 nil 指针装入接口;
- 理解模型: 接口值可理解为 `(动态类型, 动态值)`;

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

	// nil interface: 动态类型为空, 动态值也为空
	// v 可理解为 (nil, nil)
	fmt.Println(v == nil) // true

	var u *User = nil // typed nil: 具体类型为 *User, 值为 nil

	// 把 nil 指针赋值给接口后, 接口会保存这个指针的具体类型
	// v 可理解为 (*User, nil)
	v = u
	fmt.Println(u == nil) // true; u 是 nil 指针
	fmt.Println(v == nil) // false; v 的动态类型是 *User
}
```
