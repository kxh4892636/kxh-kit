---
id: bb87ade7-23f1-521c-abaf-99e693207181
---

# interface 声明与实现

interface 声明与实现是什么？实现接口是什么？实现条件是什么？

## interface 声明与实现是什么

### interface 声明与实现是什么的核心规则

- interface: 由方法集合定义的抽象类型;
- 实现方式: 类型拥有接口要求的全部方法, 即实现接口;
- 隐式实现: 不需要写 `implements`;

### interface 声明与实现是什么的写法

```go
type Greeter interface {
	Greet() string // 接口要求实现者拥有这个方法
}
```

## 实现接口

## 实现条件

- 方法签名: 类型的方法必须与接口声明完全一致;
- 方法集合: 类型的方法集合必须覆盖接口的方法集合;
- 使用方式: 实现接口后可赋值给接口变量或传给接口参数;

### 示例

- 接口声明: `Greeter` 要求实现者能够通过 `Greet()` 打招呼;
- 接口实现: `Person` 决定如何打招呼;
- 调用方: 只关心传入的值能否打招呼, 不关心它的具体类型;

```go
package main

import "fmt"

// Greeter 声明规则:拥有 Greet() string 方法的类型都满足 Greeter.
type Greeter interface {
	Greet() string
}

type Person struct {
	Name string
}

// Person 拥有了 Greeter 要求的 Greet 方法,自动实现 Greeter.
// Go 不需要额外写 implements Greeter.
func (p Person) Greet() string {
	return "你好,我是" + p.Name
}

// sayHello 接受任何实现了 Greeter 的值.
func sayHello(g Greeter) {
	fmt.Println(g.Greet())
}

func main() {
	p := Person{Name: "小明"}
	sayHello(p) // 输出:你好,我是小明
}
```
