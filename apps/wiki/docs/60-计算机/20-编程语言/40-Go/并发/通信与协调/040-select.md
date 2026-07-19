---
id: 324d95e5-0b30-5c1a-aa97-5fb03e7030b1
---

# select

## 分支选择

### 概念

- `select`: 在多个 channel 操作中选择一个可执行分支;
- `case`: 必须是 channel 发送或接收操作;
- 多个就绪: 随机选择一个执行;
- 全部未就绪: 阻塞等待;

### 语法格式

```go
func main() {
	a := make(chan int, 1)
	b := make(chan int, 1)
	a <- 1

	select {
	case v := <-a:
		println("a", v) // a 已就绪
	case v := <-b:
		println("b", v)
	}
}
```

## default

### 概念

- `default`: 没有 `case` 就绪时立即执行;
- 非阻塞选择: 带 `default` 的 `select` 不等待 channel 就绪;

### 语法格式

```go
func main() {
	ch := make(chan int)
	select {
	case v := <-ch:
		println(v)
	default:
		println("no value")
	}
}
```

## 超时分支

```go
select {
case v := <-ch:
	println(v)
case <-time.After(time.Second): // 指定时间后超时
	println("timeout")
}
```
