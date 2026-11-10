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

- 计数前提: 启动 goroutine 前先 Add, 免得 Wait 过早看到零;
- Done 次数: 必须与增加的计数匹配;
- 计数变负: 会 panic;
- 能力边界: 不保护任务间的共享写入, 也不传回错误;
- 不可复制: 开始使用后不能复制;
- 复用: 先等上一轮 Wait 返回;

- 任务归零: 每个启动成功的任务在自己的退出路径调用 Done;
- 推荐: 用 defer 覆盖普通 return;
- 澄清: 只调用 Add 不会启动任何任务;
- 等待关系: 主 goroutine 用 Wait 等全部完成再读结果;
- 仍需同步: 任务执行期间互相访问的共享数据;
