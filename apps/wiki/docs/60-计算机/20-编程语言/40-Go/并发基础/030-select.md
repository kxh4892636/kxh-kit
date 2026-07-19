---
id: 324d95e5-0b30-5c1a-aa97-5fb03e7030b1
---

# select

## 基本概念

### 概念

- select: 在多个 channel 操作中选择一个可执行分支;
- case: 必须是 channel 发送或接收操作;
- 多个就绪: 随机选择一个执行;
- 全部未就绪: 阻塞等待;

### 语法格式

```go
func main() {
	a := make(chan int, 1)
	b := make(chan int, 1)
	a <- 1

	select {
	case v := <-a:
		println("a", v) // a 已就绪
	case v := <-b:
		println("b", v)
	}
}
```

## default

### 语法格式

```go
func main() {
	ch := make(chan int)
	select {
	case v := <-ch:
		println(v)
	default:
		println("no value") // 没有 case 就绪时立即执行
	}
}
```

## 超时

### 语法格式

```go
package main

import "time"

func main() {
	ch := make(chan int)
	select {
	case v := <-ch:
		println(v)
	case <-time.After(time.Second): // 指定时间后超时
		println("timeout")
	}
}
```

## 心跳

### 语法格式

```go
package main

import "time"

func main() {
	ticker := time.NewTicker(time.Second) // 按固定间隔产生 tick
	defer ticker.Stop()                   // 停止 ticker, 释放资源

	for i := 0; i < 2; i++ {
		t := <-ticker.C // 从 ticker.C 接收本次 tick 对应的 time.Time
		println(t.String())
	}
}
```
