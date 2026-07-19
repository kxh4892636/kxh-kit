---
id: bb87ade7-23f1-521c-abaf-99e693207181
---

# interface 声明与实现

## 基本概念

### 概念

- interface: 由方法集合定义的抽象类型;
- 实现方式: 类型拥有接口要求的全部方法，即实现接口;
- 隐式实现: 不需要写 `implements`;

### 语法格式

```go
type Reader interface {
	Read(p []byte) (n int, err error) // 接口由方法集合定义
}
```

## 实现接口

### 概念

- method: `String` 是 `User` 的方法，不是普通函数;
- receiver: `(u User)` 表示该方法属于 `User` 类型;
- 接口匹配: `String() string` 与 `fmt.Stringer` 要求的方法签名完全一致;

```go
package main

import "fmt"

type User struct {
	Name string
}

func (u User) String() string {
	return u.Name
}

func printString(s fmt.Stringer) {
	// 静态类型为 fmt.Stringer，只能直接调用接口声明的方法
	fmt.Println(s.String())
}

func main() {
	u := User{Name: "Tom"}

	// User 拥有 String() string，自动满足 fmt.Stringer
	var s fmt.Stringer = u
	fmt.Println(s.String()) // 输出 Tom
	printString(u)          // 输出 Tom
}
```

## 实现条件

- 方法签名: 类型的方法必须与接口声明完全一致;
- 方法集合: 类型的方法集合必须覆盖接口的方法集合;
- 使用方式: 实现接口后可赋值给接口变量或传给接口参数;
