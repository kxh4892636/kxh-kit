---
id: 89ab936f-9aad-4fc5-a8fc-6821d91cfe4e
---

# Ticker 心跳

Ticker 心跳是什么？Ticker 心跳如何声明或使用？生命周期如何运作？

## Ticker 心跳是什么

### Ticker 心跳是什么的核心规则

- `time.NewTicker`: 按固定时间间隔产生 tick;
- `ticker.C`: 接收每次 tick 对应的 `time.Time`;
- `ticker.Stop`: 停止 ticker 并释放资源;

## Ticker 心跳如何声明或使用

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
- 停止含义: `Stop` 阻止后续 tick，但不会关闭 `ticker.C`，因此不能依靠遍历 channel 等待结束;
- 处理速度: 接收方处理过慢时，ticker 会调整或丢弃 tick，不保证补发每一次间隔;
