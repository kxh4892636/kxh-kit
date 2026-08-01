---
id: 11ca99a8-30be-4df1-9d5c-a9730c6fe1fb
---

# atomic

## 基本概念

### 概念

- `sync/atomic`: 将一次读取、写入或更新作为不可分割的操作，避免并发 goroutine 看到中间状态;
- 使用场景: 简单计数器、状态标记、指针或只读配置快照;
- 适用边界: 只保护单个值的一次操作，多个字段需要共同满足不变量时优先使用 `Mutex`;
- 类型化 API: 优先使用 `atomic.Int64`、`atomic.Bool`、`atomic.Pointer[T]` 等类型，比 `atomic.AddInt64(&n, 1)` 一类函数更易用且不易出错;
- 复制限制: 原子类型使用后不可复制，应通过指针传递包含它们的结构体;

## 常用 API

| API                        | 作用                                                |
| -------------------------- | --------------------------------------------------- |
| `Load()`                   | 原子读取当前值                                      |
| `Store(new)`               | 原子写入新值                                        |
| `Add(delta)`               | 原子加上增量并返回新值，仅适用于整数类型            |
| `Swap(new)`                | 原子写入新值并返回旧值                              |
| `CompareAndSwap(old, new)` | 当前值等于 `old` 时才替换为 `new`，返回是否替换成功 |
| `And(mask)` / `Or(mask)`   | 原子执行按位与或按位或并返回旧值，仅适用于整数类型  |

### 常用类型

- `atomic.Int32`、`atomic.Int64`: 有符号整数，常用于计数器;
- `atomic.Uint32`、`atomic.Uint64`、`atomic.Uintptr`: 无符号整数或位标记;
- `atomic.Bool`: 布尔状态标记;
- `atomic.Pointer[T]`: 类型安全地发布和替换 `*T`;
- `atomic.Value`: 保存任意类型的只读快照；首次 `Store` 后，后续 `Store` 必须使用相同的具体类型，且不能存储 `nil`;

## 组合示例

```go
package main

import (
	"fmt"
	"sync/atomic"
)

type Config struct {
	Region string
}

func main() {
	var requests atomic.Int64
	var enabled atomic.Bool
	var config atomic.Pointer[Config]
	var labels atomic.Value

	requests.Store(10)
	fmt.Println(requests.Load()) // 10：原子读取
	fmt.Println(requests.Add(1)) // 11：原子累加并返回新值
	fmt.Println(requests.Swap(20)) // 11：替换为 20 并返回旧值
	fmt.Println(requests.CompareAndSwap(20, 21)) // true：当前值匹配，替换成功

	enabled.Store(true)
	fmt.Println(enabled.Swap(false)) // true：关闭并返回关闭前的状态

	config.Store(&Config{Region: "cn"})
	old := config.Swap(&Config{Region: "sg"})
	fmt.Println(old.Region, config.Load().Region) // cn sg

	labels.Store([]string{"stable"})
	current := labels.Load().([]string)
	fmt.Println(current[0]) // stable
}
```
