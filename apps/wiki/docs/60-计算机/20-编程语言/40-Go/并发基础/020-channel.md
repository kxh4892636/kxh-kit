---
id: c0868707-8a02-5c94-8be4-de302322de56
---

# channel

## 基本概念

### 概念

- channel: goroutine 之间传递值的通信管道;
- channel 元素类型: 决定管道中传递的值类型;

### 语法格式

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

## 无缓冲 channel

### 概念

- unbuffered channel: 没有缓冲空间;
- 同步语义: 发送和接收同时完成值交接;
- 发送完成条件: 必须有接收者接收该值;
- 接收完成条件: 必须有发送者发送值;
- 使用定位: 无缓冲 channel 不是队列, 更像 goroutine 之间的同步交接点;

### 语法格式

```go
func main() {
	// 未指定容量, 创建无缓冲 channel
	ch := make(chan string) // 无缓冲 channel

	go func() {
		// ch 没有缓冲空间, "ok" 不能先存入 channel 后立刻返回
		// 发送操作会阻塞, 直到另一个 goroutine 执行接收操作
		ch <- "ok" // 发送完成时, 表示接收者已经拿到值
	}()

	// 如果发送 goroutine 尚未执行到 ch <- "ok", 接收操作会阻塞
	// 当发送方和接收方都就绪时, "ok" 从发送方交给接收方
	println(<-ch) // 输出 ok
}
```

## 有缓冲 channel

### 概念

- buffered channel: 拥有固定容量缓冲区;
- 发送阻塞: 缓冲区满时阻塞;
- 接收阻塞: 缓冲区空时阻塞;

### 语法格式

```go
func main() {
	ch := make(chan int, 2) // 容量为 2 的缓冲 channel
	ch <- 1                 // 缓冲未满, 发送不阻塞
	ch <- 2
	println(<-ch, <-ch) // 输出 1 2
}
```

## 单向 channel

### 概念

- 单向 channel: 在函数签名中表达通信方向;
- 使用场景: 限制函数能力, 提升接口清晰度;

### 语法格式

```go
func send(ch chan<- int) {
	ch <- 1 // chan<- int 只能发送
}

func recv(ch <-chan int) int {
	return <-ch // <-chan int 只能接收
}
```

## 关闭 channel

### 概念

- 关闭方: 通常由发送方关闭;
- 接收关闭 channel: 读完缓冲后得到零值和 false;
- 发送关闭 channel: panic;

### 语法格式

```go
func main() {
	ch := make(chan int)
	go func() {
		ch <- 1
		close(ch) // 发送方关闭 channel, 表示不会再发送值
	}()
	for v := range ch { // range 持续接收直到 channel 关闭且缓冲耗尽
		println(v)
	}
}
```

## comma ok 接收

### 语法格式

```go
func main() {
	ch := make(chan int, 1)
	ch <- 1
	close(ch)
	v, ok := <-ch
	println(v, ok) // 1 true; 接收到缓冲中的值
	v, ok = <-ch
	println(v, ok) // 0 false; channel 已关闭且无剩余值
}
```
