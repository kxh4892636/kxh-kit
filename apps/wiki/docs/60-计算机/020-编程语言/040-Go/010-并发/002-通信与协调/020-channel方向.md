---
id: 84ae2b8c-3a4a-4f66-9a9b-58fe9d3164de
---

# channel 方向

## 单向 channel 如何限制函数的通信权限？

- 单向 channel: 在函数签名中表达通信方向;
- 使用场景: 限制函数能力, 提升接口清晰度;

| 类型       | 允许发送 | 允许接收 |
| ---------- | -------- | -------- |
| `chan T`   | 是       | 是       |
| `chan<- T` | 是       | 否       |
| `<-chan T` | 否       | 是       |

- 类型限制示例: 同一个底层通道可以交给不同函数使用，每个参数类型只暴露该函数需要的能力;

```go
ch := make(chan int, 1)
var sendOnly chan<- int = ch
var receiveOnly <-chan int = ch
sendOnly <- 7
println(<-receiveOnly) // 7
// <-sendOnly // 编译错误：发送端不允许接收
```

## 如何用 `chan<- T` 表达发送方向？

- 发送能力: `chan<- T` 参数只能发送，不能接收；它也允许 close，但是否负责关闭仍须由所有权约定决定;

```go
func send(ch chan<- int) {
	ch <- 1 // chan<- int 只能发送
}
```

## 如何用 `<-chan T` 表达接收方向？

- 接收能力: `<-chan T` 参数不能发送或关闭；双向 channel 可以传给单向参数，函数内的限制不会改变底层通道;

```go
func recv(ch <-chan int) int {
	return <-ch // <-chan int 只能接收
}
```

```go
ch := make(chan int, 1)
send(ch) // 双向通道被当作发送端传入
value := recv(ch) // 同一通道被当作接收端传入
println(value) // 1
```
