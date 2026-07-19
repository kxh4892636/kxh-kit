---
id: 219db326-0f7d-49e5-b947-a44bd1186413
---

# WaitGroup

## 基本概念

### 概念

- `sync.WaitGroup`: 等待一组 goroutine 完成;
- `Add(n)`: 增加等待计数;
- `Done()`: 完成一个任务，等价于 `Add(-1)`;
- `Wait()`: 阻塞直到等待计数归零;
- 使用场景: 主 goroutine 等待多个并发任务结束;

## 语法格式

```go
package main

import "sync"

func main() {
	var wg sync.WaitGroup

	for i := 0; i < 2; i++ {
		wg.Add(1) // 启动 goroutine 前增加等待计数
		go func(id int) {
			defer wg.Done() // goroutine 结束时减少等待计数
			println(id)
		}(i)
	}

	wg.Wait() // 等待两个 goroutine 都执行完
}
```
