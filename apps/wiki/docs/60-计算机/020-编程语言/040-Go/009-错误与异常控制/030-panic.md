---
id: 2dcd32b0-55e7-5456-85ae-f8e094243301
---

# panic

## panic 是什么, 何时使用 panic？

- panic: 中断当前正常控制流，并沿当前 goroutine 的调用栈展开；未恢复时会终止整个程序;
- 传播入口: defer 顺序与未恢复后果见本篇传播流程;
- 使用场景: 程序无法继续的严重错误, 违反内部不变量;

## panic 如何沿当前 goroutine 的调用栈传播？

```go
package main

func mustPositive(n int) {
	defer println("defer in mustPositive")

	if n <= 0 {
		panic("n must be positive")
	}

	println("ok") // n <= 0 时不会执行
}

func main() {
	defer println("defer in main")
	mustPositive(0)
	println("after mustPositive") // 不会执行
}

// 输出:
// defer in mustPositive
// defer in main
// panic: n must be positive
```

| 阶段 | 行为                                 |
| ---: | ------------------------------------ |
|    1 | `panic` 中止当前函数的正常执行       |
|    2 | 执行当前函数已注册的 `defer`         |
|    3 | 向调用方传播, 并执行调用方的 `defer` |
|    4 | 未被恢复时终止整个程序               |

- 规范依据: [Go 规范：处理 panic](https://go.dev/ref/spec#Handling_panics)；它不会替其他 goroutine 逐一执行清理再正常退出;

## 何时用 error, 何时用 panic？

- `error`: 表达可预期且由调用方处理的失败;
- `panic`: 表达不可恢复或不应继续的异常状态;
