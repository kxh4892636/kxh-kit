---
id: f7075127-36df-45e7-9635-2fd79c73fa6d
---

# Once

## 基本概念

### 概念

- `sync.Once`: 保证函数在多个 goroutine 中只执行一次;
- `Do(fn)`: 首次调用时执行 `fn`，后续调用不再执行;
- 使用场景: 配置加载、全局资源初始化、单例初始化;

## 语法格式

```go
package main

import "sync"

var once sync.Once
var config string

func loadConfig() {
	once.Do(func() {
		config = "ready" // 多次调用 loadConfig，这里也只执行一次
	})
}

func main() {
	loadConfig()
	loadConfig()
	println(config)
}
```
