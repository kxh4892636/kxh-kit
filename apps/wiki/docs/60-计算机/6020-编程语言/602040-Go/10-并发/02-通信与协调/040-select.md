---
id: 324d95e5-0b30-5c1a-aa97-5fb03e7030b1
---

# select

## select 的分支选择规则是什么？

- `select`: 在多个 channel 操作中选择一个可执行分支;
- `case`: 必须是 channel 发送或接收操作;
- 多个就绪: 随机选择一个执行;
- 全部未就绪: 没有 default 时阻塞等待，有 default 时按下一节的非阻塞规则处理;

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

- nil 分支: nil channel 的收发永远不会就绪，可用它暂时禁用分支；已关闭 channel 的接收持续就绪，需要处理 `ok=false` 后退出或禁用;

## default 分支的作用是什么？

- `default`: 没有 `case` 就绪时立即执行;
- 非阻塞选择: 带 `default` 的 `select` 不等待 channel 就绪;

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

- 忙等风险: 在无限循环中不断执行带 default 的 select 可能空转占用 CPU；需要等待事件时通常省略 default;

## 如何用 select 实现超时？

- 超时竞争: 同时等待结果通道和定时器通道，哪一个先就绪就有机会被选择；两者同时就绪时不保证结果优先，也不会自动取消后台任务;

```go
select {
case v := <-ch:
	println(v)
case <-time.After(time.Second): // 指定时间后超时
	println("timeout")
}
```
