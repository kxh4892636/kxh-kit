---
id: 834b9fce-206f-54f0-9839-3a2f34f73448
---

# goroutine

## 基本概念

### 概念

- goroutine: Go runtime 调度的轻量级并发执行单元;
- 调度者: Go runtime 将 goroutine 调度到系统线程;
- 启动方式: `go f()` 启动新的 goroutine 执行函数调用;
- 进程退出: main goroutine 结束后程序退出;

## 语法格式

```go
package main

import "time"

func main() {
	go println("run in goroutine")
	time.Sleep(time.Millisecond) // 临时等待子 goroutine
}
```

## 生命周期

- 开始: `go` 语句创建并调度 goroutine;
- 执行: Go runtime 决定其运行时机和所在线程;
- 结束: 函数返回或当前 goroutine 因 panic 退出;
- 程序边界: main goroutine 结束不会自动等待其他 goroutine;
