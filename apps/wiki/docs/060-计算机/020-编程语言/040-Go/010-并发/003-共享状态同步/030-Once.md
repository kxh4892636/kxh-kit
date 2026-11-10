---
id: f7075127-36df-45e7-9635-2fd79c73fa6d
---

# Once

## 如何用 Once 保证初始化最多执行一次？

- `sync.Once`: 保证函数在多个 goroutine 中只执行一次;
- `Do(fn)`: 首次调用时执行 `fn`, 后续调用不再执行;
- 使用场景: 配置加载, 全局资源初始化, 单例初始化;
- 并发保证: 多个 goroutine 同时调 `Do` 时只有一个执行 `fn`;
- 其余调用: 等待该次执行结束;
- panic 边界: `fn` 即使发生 panic 也被视为已经执行, 后续 `Do` 不会自动重试;
- 不可复制: `sync.Once` 开始使用后不能再按值复制;

```go
package main

import "sync"

var once sync.Once
var config string

func loadConfig() {
	once.Do(func() {
		config = "ready" // 多次调用 loadConfig,这里也只执行一次
	})
}

func main() {
	loadConfig()
	loadConfig()
	println(config)
}
```

- 实例边界: 一次按同一个 Once 实例计算, 多实例各执行一次;
- 死锁: 初始化函数内再次调同一 `Once.Do` 会等自己;

- 失败策略: 初始化可能返回可重试错误时, `Once.Do` 仍把该次计为已执行;
- 先明确: 失败是否永久;
- 误区: 最多一次不等于直到成功一次;

- 初始化可见性: 同一个 Once 上的 `Do` 会等初始化结束再返回;
- 结果: 后续代码可用初始化时建立的状态;
- 后续修改: 初始化完成不等于资源永远安全;
- 之后仍改 config: 需另行设计同步或不可变快照;
