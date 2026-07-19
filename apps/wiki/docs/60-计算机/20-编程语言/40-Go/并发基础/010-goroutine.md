---
id: 834b9fce-206f-54f0-9839-3a2f34f73448
---

# goroutine

## 基本概念

### 概念

- goroutine: Go runtime 调度的轻量级并发执行单元;
- 调度者: Go runtime 将 goroutine 调度到系统线程;
- 进程退出: main goroutine 结束后程序退出;

### 语法格式

```go
package main

import "time"

func main() {
	go println("run in goroutine") // go f() 启动新的 goroutine 执行函数调用
	time.Sleep(time.Millisecond)   // main 结束后进程退出, 这里临时等待子 goroutine
}
```

## 数据竞争

### 概念

- data race: 多个 goroutine 并发访问同一变量, 且至少一个写入;
- 风险: 结果不确定, 程序行为不可靠;
- 处理方式: channel 传递数据、mutex 保护共享数据、避免共享可变状态;

## CSP 模型

### 概念

- CSP: Communicating Sequential Processes;
- 核心思想: 并发实体通过通信协作, 而不是直接共享状态;
- Go 表达: goroutine 表示并发执行单元, channel 表示通信通道;
- 实践原则: 通过通信共享内存, 而不是通过共享内存通信;
