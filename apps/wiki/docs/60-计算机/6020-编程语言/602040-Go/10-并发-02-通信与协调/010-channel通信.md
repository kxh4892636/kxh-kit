---
id: c0868707-8a02-5c94-8be4-de302322de56
---

# channel 通信

## channel 通信是什么, 如何声明使用？

- channel: goroutine 之间传递值的通信管道;
- channel 元素类型: 决定管道中传递的值类型;

```go
func main() {
	ch := make(chan int) // 创建传递 int 的 channel
	go func() {
		ch <- 10 // 向 channel 发送值
	}()
	n := <-ch // 从 channel 接收值
	println(n)
}
```

- 零值边界: nil channel 的发送与接收会一直阻塞；通常先用 `make` 创建，再把它交给需要通信的 goroutine;

## 无缓冲 channel 的同步语义是什么？

- unbuffered channel: 没有缓冲空间;
- 同步语义: 发送和接收同时完成值交接;
- 发送完成条件: 必须有接收者接收该值;
- 接收完成条件: 必须有发送者发送值;
- 使用定位: 不是队列, 而是 goroutine 之间的同步交接点;

```go
func main() {
	ch := make(chan string)

	go func() {
		ch <- "ok" // 阻塞到另一个 goroutine 执行接收
	}()

	println(<-ch) // 双方都就绪时完成值交接
	println("wait")
}
```

## 有缓冲 channel 的阻塞条件是什么？

- buffered channel: 拥有固定容量缓冲区;
- 发送阻塞: 缓冲区满时阻塞;
- 接收阻塞: channel 未关闭且缓冲区为空时阻塞；关闭后的接收规则见[channel 关闭与接收](./030-channel关闭与接收.md);

```go
func main() {
	ch := make(chan int, 2) // 容量为 2
	ch <- 1                 // 缓冲未满,发送不阻塞
	ch <- 2
	println(<-ch, <-ch) // 输出 1 2
}
```
