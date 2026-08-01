---
id: 2dcd32b0-55e7-5456-85ae-f8e094243301
---

# panic

## 基本概念

### 概念

- panic: 当前 goroutine 的异常退出流程;
- 执行顺序: 先执行已注册 `defer`, 再向上传播;
- 使用场景: 程序无法继续的严重错误, 违反内部不变量;

## 传播过程

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

## 流程摘要

| 阶段 | 行为                                 |
| ---: | ------------------------------------ |
|    1 | `panic` 中止当前函数的正常执行       |
|    2 | 执行当前函数已注册的 `defer`         |
|    3 | 向调用方传播, 并执行调用方的 `defer` |
|    4 | 未被恢复时结束当前 goroutine         |

## 使用边界

- `error`: 表达可预期且由调用方处理的失败;
- `panic`: 表达不可恢复或不应继续的异常状态;
