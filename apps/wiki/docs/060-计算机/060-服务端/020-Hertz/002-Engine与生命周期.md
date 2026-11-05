---
id: 651144e8-bec4-4512-83f6-3e7f7d46140f
anki: true
---

# Engine 与生命周期

## server.Default 和 server.New 差在哪？

- Default 多装 `recovery.Recovery()`，New 一个默认中间件都不装;

```go
h := server.Default(server.WithHostPorts(":8888")) // Default = New + Recovery

h = server.New(
	server.WithHostPorts(":8888"),
	server.WithReadTimeout(3*time.Second),
	server.WithWriteTimeout(5*time.Second),
	server.WithIdleTimeout(60*time.Second),
	server.WithMaxRequestBodySize(1<<20),
	server.WithExitWaitTime(10*time.Second),
)
h.Use(recovery.Recovery()) // New 必须自己装
```

- Option 只在构造时生效: 地址、超时、body 上限、退出等待都要在 `Spin` 前定完。

## 不同类型的超时如何配置？

- `WithReadTimeout` 管收完请求、`WithWriteTimeout` 管写响应、`WithIdleTimeout` 管 keep-alive 空闲;
- 业务超时在 Handler 里 `context.WithTimeout` 派生;

## HTTP/2 与 H2C 怎么开才生效？

- 两步: 加 `WithALPN`/`WithH2C`，再 `AddProtocol("h2", ...)` 注册协议工厂；只改请求头不会升级协议;

```go
h := server.Default(
	server.WithTLS(&tls.Config{Certificates: []tls.Certificate{cert}}),
	server.WithALPN(true),
)
h.AddProtocol("h2", factory.NewServerFactory()) // hertz-contrib/http2/factory

h = server.Default(server.WithH2C(true)) // 明文 HTTP/2，只在受控网络
h.AddProtocol("h2", factory.NewServerFactory())
```

- 没注册协议工厂时，H2C 连接回退 HTTP/1.1;

## 服务从启动到退出按什么顺序走？如何配置优雅退出?

- 启动: 读配置 → 初始化依赖 → 注册中间件与路由 → `Spin`；依赖就绪后才打开 readiness;
- `WithExitWaitTime` 配置优雅退出时间; DB 在 `Spin` 返回后关;
- `OnShutdown` 早于在途 Handler 结束, 仅发送停止通知;
- `SetCustomSignalWaiter` 执行摘流操作;

```go
h := server.Default(server.WithExitWaitTime(10 * time.Second))
h.Engine.OnShutdown = append(h.Engine.OnShutdown, func(ctx context.Context) {
	// 并发触发，且早于在途 Handler 结束：这里只发停止通知。
})
h.SetCustomSignalWaiter(func(errs chan error) error {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errs:
		return err
	case <-signals:
		ready.Store(false)      // 先让 readiness 失败，摘流
		time.Sleep(time.Second) // 示例：等摘流传播
		return nil
	}
})
h.Spin()
```
