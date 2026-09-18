---
id: 30cab41a-0e9b-4e67-9063-9fcdd39f63aa
---

# recover

## 如何在同一 goroutine 的延迟函数中恢复 panic？

- recover: 捕获当前 goroutine 正在传播的 panic;
- 调用位置: 必须在 defer 函数中直接调用;
- 返回值: 存在 panic 时返回传给 `panic` 的值, 否则返回 nil;
- 恢复效果: 捕获后停止 panic 继续向上传播;
- 执行恢复: 不会回到 `panic` 后继续执行, 当前函数从 defer 后返回;

```go
package main

import "fmt"

func safeRun() {
	defer func() {
		if v := recover(); v != nil {
			fmt.Println("recover:", v)
		}
	}()

	panic("boom")
	fmt.Println("after panic") // 不会执行
}

func main() {
	safeRun()
	fmt.Println("after safeRun") // main 继续执行
}

// 输出:
// recover: boom
// after safeRun
```

- 适用位置: goroutine 边界, 框架边界, 任务边界兜底;
- 作用范围: 只处理当前 goroutine 中正在传播的 panic;
- 控制流: 安装恢复 defer 的函数会执行剩余 defer，再返回自己的调用方；panic 位置到该边界之间的函数调用不会继续执行;

## 恢复 panic 后为什么仍需检查业务状态？

- 错误策略入口: 可预期失败与异常状态的选择见[panic](./030-panic.md)；本篇 recover 只负责在明确边界停止异常传播，不保证业务状态已经恢复;
