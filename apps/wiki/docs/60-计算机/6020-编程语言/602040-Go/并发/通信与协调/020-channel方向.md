---
id: 84ae2b8c-3a4a-4f66-9a9b-58fe9d3164de
---

# channel 方向

## 单向 channel

### 概念

- 单向 channel: 在函数签名中表达通信方向;
- `chan<- T`: 只允许向 channel 发送 `T`;
- `<-chan T`: 只允许从 channel 接收 `T`;
- 使用场景: 限制函数能力, 提升接口清晰度;

## 发送方向

```go
func send(ch chan<- int) {
	ch <- 1 // chan<- int 只能发送
}
```

## 接收方向

```go
func recv(ch <-chan int) int {
	return <-ch // <-chan int 只能接收
}
```

## 方向对比

| 类型       | 允许发送 | 允许接收 |
| ---------- | -------- | -------- |
| `chan T`   | 是       | 是       |
| `chan<- T` | 是       | 否       |
| `<-chan T` | 否       | 是       |
