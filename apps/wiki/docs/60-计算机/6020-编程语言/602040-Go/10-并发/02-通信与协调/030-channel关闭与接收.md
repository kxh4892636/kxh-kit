---
id: 78b92ccf-f8bc-4897-98aa-45c05ad85a74
---

# channel 关闭与接收

## 关闭 channel 的规则与后果是什么？

- 关闭方: 通常由发送方关闭;
- 接收状态入口: 缓冲读取与 `ok` 的含义见本篇 comma ok 接收;
- 发送关闭 channel: 引发 panic;
- `range channel`: 持续接收, 直到 channel 关闭且缓冲耗尽;

```go
func main() {
	ch := make(chan int)
	go func() {
		ch <- 1
		close(ch) // 表示不会再发送值
	}()
	for v := range ch {
		println(v)
	}
}
```

- 关闭前提: 必须确认不会再有发送；关闭 nil channel 或重复关闭都会 panic，多发送者通常由协调者等待全部发送完成后关闭;

## comma ok 接收如何判断 channel 状态？

- 状态判断: `ok=true` 表示本次收到发送过的值；只有通道已关闭且缓冲耗尽时才返回元素零值和 false，不能只看 `v` 是否为零判断结束;

```go
func main() {
	ch := make(chan int, 1)
	ch <- 1
	close(ch)

	v, ok := <-ch
	println(v, ok) // 1 true;接收到缓冲中的值

	v, ok = <-ch
	println(v, ok) // 0 false;channel 已关闭且无剩余值
}
```
