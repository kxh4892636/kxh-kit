---
id: 89ab936f-9aad-4fc5-a8fc-6821d91cfe4e
---

# Ticker 心跳

## 基本概念

### 概念

- `time.NewTicker`: 按固定时间间隔产生 tick;
- `ticker.C`: 接收每次 tick 对应的 `time.Time`;
- `ticker.Stop`: 停止 ticker 并释放资源;

## 语法格式

```go
package main

import "time"

func main() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for i := 0; i < 2; i++ {
		t := <-ticker.C
		println(t.String())
	}
}
```

## 生命周期

- 创建: `time.NewTicker(interval)` 返回持续发送 tick 的 ticker;
- 使用: 从 `ticker.C` 接收定时事件;
- 结束: 不再使用时调用 `Stop`;
