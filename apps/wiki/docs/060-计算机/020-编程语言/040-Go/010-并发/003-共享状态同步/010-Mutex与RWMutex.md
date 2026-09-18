---
id: 44e45fcf-18c2-5086-a85f-5ada6fad20f5
---

# Mutex 与 RWMutex

## Mutex 互斥锁的核心规则与写法是什么？

- `sync.Mutex`: 一次只允许一个 goroutine 进入临界区;
- 使用场景: 保护共享变量, map, 计数器等可变数据;
- 解锁要求: `Lock` 成功后必须调用 `Unlock`;

```go
package main

import "sync"

func main() {
	var mu sync.Mutex
	count := 0

	mu.Lock()   // 加锁,进入临界区
	count++     // 访问共享数据
	mu.Unlock() // 解锁,离开临界区

	println(count)
}
```

- 临界区: 必须作为整体保护的共享数据操作区间；所有访问同一份可变数据的路径应遵守同一锁约定;
- 使用限制: Mutex 零值可用，开始使用后不得复制；锁不是可重入锁，同一执行路径重复 Lock 而不解锁会阻塞;

## RWMutex 读写锁的核心规则与写法是什么？

- `sync.RWMutex`: 适合读多写少场景的读写锁;
- 读锁: 多个 goroutine 可同时持有 `RLock`, 阻塞写;
- 写锁: `Lock` 独占访问并阻塞其他读写;
- defer 解锁: 加锁成功后可用 `defer` 保证释放;

```go
// 读1 ─┐
// 读2 ─┼── 可以同时读取
// 读3 ─┘

// 写入 ─── 等所有读锁释放 ─── 修改配置

var (
	mu     sync.RWMutex
	config map[string]string
)

func Get(key string) string {
	mu.RLock()         // 多个 goroutine 可同时读取配置
	defer mu.RUnlock() // 读取结束后释放读锁
	return config[key]
}

func Reload(newConfig map[string]string) {
	mu.Lock()         // 独占访问,等待已有读锁释放
	defer mu.Unlock() // 更新结束后释放写锁
	config = newConfig
}

```

- 选择边界: 读多写少只是候选条件，锁开销与竞争程度仍需测量；RWMutex 不支持从读锁升级为写锁，也不支持降级;
- 共享数据边界: 示例 Reload 直接保存 map，调用方发布后不得绕过这把锁继续修改该 map;
- API 依据: [sync](https://pkg.go.dev/sync);
