---
id: 834b9fce-206f-54f0-9839-3a2f34f73448
---

# goroutine

## goroutine 如何被调度并结束生命周期？

- goroutine: Go runtime 调度的轻量级并发执行单元;
- 调度者: Go runtime 将 goroutine 调度到系统线程;
- 启动方式: `go f()` 启动新的 goroutine 执行函数调用;
- 进程退出: main goroutine 结束后程序退出;

- 结束: 通常在函数返回时结束；未恢复的 panic 会终止整个程序，不能把它当作只结束当前任务的方式;
- 泄漏风险: goroutine 若永久等待无人发送的 channel、永不释放的锁或无法结束的 I/O，就会一直占用资源;

## goroutine 如何启动, 如何等待它完成？

```go
package main

func main() {
	done := make(chan struct{})

	go func() {
		println("run in goroutine")
		close(done)
	}()

	<-done // 等到子 goroutine 明确发出完成信号
}
```

- 协调原则: `go` 只负责启动，不负责等待；调用方需要用 channel、`sync.WaitGroup` 等机制表达完成条件;
- 错误示例: `time.Sleep` 只能延迟当前 goroutine，不能保证另一个 goroutine 已完成，不应作为同步手段;

- 参数求值: `go f(x)` 中的函数值和实参先由当前 goroutine 求值，函数体随后在新 goroutine 执行；启动不等于函数已经完成;
