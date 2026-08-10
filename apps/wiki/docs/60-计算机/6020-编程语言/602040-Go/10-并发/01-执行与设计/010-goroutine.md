---
id: 834b9fce-206f-54f0-9839-3a2f34f73448
---

# goroutine

goroutine 是什么？如何启动 goroutine 并等待它完成？goroutine 的生命周期由谁控制？

## goroutine是什么

### goroutine是什么的核心规则

- goroutine: Go runtime 调度的轻量级并发执行单元;
- 调度者: Go runtime 将 goroutine 调度到系统线程;
- 启动方式: `go f()` 启动新的 goroutine 执行函数调用;
- 进程退出: main goroutine 结束后程序退出;

## goroutine如何声明或使用

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

## 生命周期

- 开始: `go` 语句创建并调度 goroutine;
- 执行: Go runtime 决定其运行时机和所在线程;
- 结束: 函数返回或当前 goroutine 因 panic 退出;
- 程序边界: main goroutine 结束不会自动等待其他 goroutine;
- 泄漏风险: goroutine 若永久等待无人发送的 channel、永不释放的锁或无法结束的 I/O，就会一直占用资源;
