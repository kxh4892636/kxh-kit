---
id: e6a3dd8e-140e-4ca6-aced-b368c34ad566
anki: true
---

# HertzClient

## Hertz Client 发一次出站请求要几步？

- 四步: 建可复用 Client、从对象池取请求与响应、设 URI 与方法、`Do` 后归还;

```go
cli, err := client.NewClient(client.WithDialer(standard.NewDialer()))
if err != nil {
	return err
}

req := protocol.AcquireRequest()
resp := protocol.AcquireResponse()
defer protocol.ReleaseRequest(req)
defer protocol.ReleaseResponse(resp)

req.SetRequestURI("https://api.example.com/articles/7")
req.Header.SetMethod(consts.MethodGet)
req.SetOptions(config.WithRequestTimeout(time.Second))

if err := cli.Do(ctx, req, resp); err != nil {
	return fmt.Errorf("request article: %w", err)
}
```

- `Acquire`/`Release` 必须配对，漏归还等于持续分配;
- Client 进程内建一个复用；HTTPS 用 `standard.NewDialer()` 保留默认证书校验。

## 超时和失败该在哪一层处理？

- 只把 `ctx` 传给 `Do` 不等于配好超时: 用 `req.SetOptions(config.WithRequestTimeout(...))`，或 `DoTimeout`/`DoDeadline`；三者写同一份配置，不要互相覆盖;
- 框架没有重试策略，`retryable` 自己判方法与状态;
- 什么能重试、总预算怎么扣见 [重试与幂等](../000-服务端知识/040-可靠性/030-重试与幂等.md)。

## Hertz Client 和 Kitex 什么时候各用哪个？

- 服务间调用优先 Kitex；Hertz Client 适合调外部 HTTP、做网关转发或测试夹具;
- 连接池、代理与 TLS 细节查 `client.Option`，不要为改一个参数复制多个 Client。
