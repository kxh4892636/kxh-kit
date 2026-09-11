---
id: f7075127-36df-45e7-9635-2fd79c73fa6d
---

# Once

## 如何用 Once 保证初始化最多执行一次？

- `sync.Once`: 保证函数在多个 goroutine 中只执行一次;
- `Do(fn)`: 首次调用时执行 `fn`, 后续调用不再执行;
- 使用场景: 配置加载, 全局资源初始化, 单例初始化;
- 并发保证: 多个 goroutine 同时调用 `Do` 时，只有一个执行 `fn`，其余调用会等待该次执行结束;
- panic 边界: `fn` 即使发生 panic 也被视为已经执行，后续 `Do` 不会自动重试;
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

- 实例边界: “一次”按同一个 Once 实例计算，多个实例分别执行；初始化函数内再次调用同一 Once.Do 会等待自身而死锁;

- 失败策略: 若初始化可能返回可重试错误，普通 Once.Do 仍会把该次调用计为已执行；应先明确失败是否永久，不能把“最多一次”误当作“直到成功一次”;

- 初始化可见性: 对同一个 Once 调用 Do 的函数会等初始化调用结束再返回，因此后续代码可使用初始化时建立的状态;
- 后续修改: 初始化完成不等于资源永远安全；如果之后还会修改 config，仍需另行设计同步或不可变快照;
