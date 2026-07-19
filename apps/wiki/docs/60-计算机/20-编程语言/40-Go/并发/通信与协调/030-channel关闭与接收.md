---
id: 78b92ccf-f8bc-4897-98aa-45c05ad85a74
---

# channel 关闭与接收

## 关闭 channel

### 概念

- 关闭方: 通常由发送方关闭;
- 接收关闭 channel: 读完缓冲后得到元素零值和 `false`;
- 发送关闭 channel: 引发 panic;
- `range channel`: 持续接收，直到 channel 关闭且缓冲耗尽;

### 语法格式

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

## comma ok 接收

```go
func main() {
	ch := make(chan int, 1)
	ch <- 1
	close(ch)

	v, ok := <-ch
	println(v, ok) // 1 true；接收到缓冲中的值

	v, ok = <-ch
	println(v, ok) // 0 false；channel 已关闭且无剩余值
}
```
