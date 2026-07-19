---
id: 11ca99a8-30be-4df1-9d5c-a9730c6fe1fb
---

# atomic

## 基本概念

### 概念

- `sync/atomic`: 提供并发安全的原子读写操作;
- 使用场景: 简单计数器、状态标记;
- 适用边界: 只适合简单数值或指针状态，复杂共享数据优先使用锁;

## 语法格式

```go
package main

import "sync/atomic"

func main() {
	var count atomic.Int64

	count.Add(1)          // 原子自增，并发场景下不会丢失更新
	println(count.Load()) // 原子读取当前值
}
```

## 同步工具选择

| 工具             | 优先使用场景                     |
| ---------------- | -------------------------------- |
| `sync/atomic`    | 简单计数器、状态标记的无锁读写   |
| `sync.Mutex`     | 需要共同维护多项状态或复合不变量 |
| `sync.WaitGroup` | 等待多个并发任务结束             |
| `sync.Once`      | 只执行一次的初始化               |
