---
id: 44e45fcf-18c2-5086-a85f-5ada6fad20f5
---

# Mutex 与 RWMutex

## 互斥锁

### 概念

- `sync.Mutex`: 一次只允许一个 goroutine 进入临界区;
- 使用场景: 保护共享变量、map、计数器等可变数据;
- 解锁要求: `Lock` 成功后必须调用 `Unlock`;

### 语法格式

```go
package main

import "sync"

func main() {
	var mu sync.Mutex
	count := 0

	mu.Lock()   // 加锁，进入临界区
	count++     // 访问共享数据
	mu.Unlock() // 解锁，离开临界区

	println(count)
}
```

## 读写锁

### 概念

- `sync.RWMutex`: 适合读多写少场景的读写锁;
- 读锁: 多个 goroutine 可同时持有 `RLock`;
- 写锁: `Lock` 独占访问并阻塞其他读写;
- defer 解锁: 加锁成功后可用 `defer` 保证释放;

### 语法格式

```go
var mu sync.RWMutex
var count int

func read() int {
	mu.RLock()         // 多个读者可并发持有
	defer mu.RUnlock() // 释放读锁
	return count
}
```

## 使用场景

| 工具           | 优先使用场景                      |
| -------------- | --------------------------------- |
| `sync.Mutex`   | 共享变量、map、计数器需要互斥访问 |
| `sync.RWMutex` | 共享数据读多写少                  |
