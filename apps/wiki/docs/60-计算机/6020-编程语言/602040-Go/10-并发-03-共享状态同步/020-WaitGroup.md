---
id: 219db326-0f7d-49e5-b947-a44bd1186413
---

# WaitGroup

## 如何用 WaitGroup 等待一组任务全部完成？

- `sync.WaitGroup`: 等待一组 goroutine 完成;
- `Add(n)`: 增加等待计数;
- `Done()`: 完成一个任务, 等价于 `Add(-1)`;
- `Wait()`: 阻塞直到等待计数归零;
- 使用场景: 主 goroutine 等待多个并发任务结束;

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

- 计数前提: 在启动 goroutine 前 Add，确保 Wait 不会过早观察到零；Done 次数必须与增加的计数匹配，计数变负会 panic;
- 能力边界: WaitGroup 不负责保护任务之间的共享写入，也不负责传回错误；开始使用后不可复制，复用前应等上一轮 Wait 返回;

- 任务归零: 每个启动成功的任务都应在自己的退出路径调用 Done，使用 defer 可覆盖普通 return；仅仅调用 Add 不会启动任何任务;
- 等待关系: 主 goroutine 通过 Wait 等待全部完成后读取结果，但任务执行期间互相访问共享数据仍要另行同步;
