---
id: 89ab936f-9aad-4fc5-a8fc-6821d91cfe4e
---

# Ticker 心跳

## 如何创建、消费并停止周期性 Ticker？

- `time.NewTicker`: 按固定时间间隔产生 tick;
- `ticker.C`: 接收每次 tick 对应的 `time.Time`;
- `ticker.Stop`: 停止 ticker 并释放资源;

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

- 停止含义: `Stop` 阻止后续 tick, 但不关闭 `ticker.C`;
- 结论: 不能靠遍历 channel 等待结束;
- 处理速度: 接收方处理过慢时, ticker 会调整或丢弃 tick, 不保证补发每一次间隔;

## Ticker 的前提与退出条件是什么？

- 周期前提: interval 必须大于零, 否则 NewTicker 会 panic;
- 退出条件: 独立于 `Stop`, 示例按计数退出;
- API 依据: [time.Ticker](https://pkg.go.dev/time#Ticker);
- 不漏执行: 需单独记录任务状态;
- 误区: 不要把每个 tick 当作可靠队列消息;
