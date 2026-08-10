---
id: f7075127-36df-45e7-9635-2fd79c73fa6d
---

# Once

Once是什么？Once如何声明或使用？

## Once是什么

### Once是什么的核心规则

- `sync.Once`: 保证函数在多个 goroutine 中只执行一次;
- `Do(fn)`: 首次调用时执行 `fn`, 后续调用不再执行;
- 使用场景: 配置加载, 全局资源初始化, 单例初始化;
- 并发保证: 多个 goroutine 同时调用 `Do` 时，只有一个执行 `fn`，其余调用会等待该次执行结束;
- panic 边界: `fn` 即使发生 panic 也被视为已经执行，后续 `Do` 不会自动重试;
- 不可复制: `sync.Once` 开始使用后不能再按值复制;

## Once如何声明或使用

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
