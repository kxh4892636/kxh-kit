---
id: 651144e8-bec4-4512-83f6-3e7f7d46140f
anki: true
---

# Engine 与生命周期

## server.Default 和 server.New 差在哪？

- 差别一条: Default 多装 `recovery.Recovery()`，New 不装，漏装时 panic 会直接断连;

```go
// Default = New + Recovery 中间件。
h := server.Default(server.WithHostPorts(":8888"))

// New 不带任何默认中间件，Recovery 必须自己装。
h = server.New(
	server.WithHostPorts(":8888"),
	server.WithReadTimeout(3*time.Second),
	server.WithWriteTimeout(5*time.Second),
	server.WithIdleTimeout(60*time.Second),
	server.WithMaxRequestBodySize(1<<20),
	server.WithExitWaitTime(10*time.Second),
)
h.Use(recovery.Recovery())
```

- Option 只在构造时生效：地址、超时、body 上限和路由都要在启动前定完;
- 默认值：监听 `:8888`、read timeout 3m、body 上限 4 MiB、exit wait 5s;

## 读、写、空闲三个超时各管什么？

- 三个都是连接级超时: read 管收请求、write 管写响应、idle 管空闲，业务超时在 Handler 里 `context.WithTimeout` 派生，预算分层见 000「超时预算」;

- read timeout: 读完整个请求的上限，防慢速请求占住连接;
- write timeout: 写响应的上限，流式接口不要套短值;
- idle timeout: keep-alive 空闲连接的上限，不是业务超时;

## HTTP/2 与 H2C 怎么开才生效？

- 两步: 加 `WithALPN`/`WithH2C`（默认 false，只改请求头不会升级协议），再用 `AddProtocol("h2", ...)` 注册协议工厂;

```go
// TLS + ALPN：与客户端、网关协商 HTTP/2。
h := server.Default(
	server.WithTLS(&tls.Config{Certificates: []tls.Certificate{cert}}),
	server.WithALPN(true),
)
h.AddProtocol("h2", factory.NewServerFactory()) // hertz-contrib/http2/factory

// 明文 HTTP/2：只在受控网络里开。
h = server.Default(server.WithH2C(true))
h.AddProtocol("h2", factory.NewServerFactory())
```

- 没注册协议工厂时，H2C 连接会回退 HTTP/1.1;
- 公网走 TLS + ALPN，客户端、网关、Hertz 三段都要支持；H2C 不提供加密与认证;
- 验收是在真实连接上看协议版本，再验证请求、错误与 HTTP/1.1 回退；协议判断见 000（070-通信）;

## 服务从启动到退出按什么顺序走？

- 启动: 读配置 → 初始化依赖 → 注册中间件与路由 → `Spin`;

- 依赖就绪后才打开 readiness，未就绪不接流量；见 000「健康检查与摘流」;
- 退出时序、`OnShutdown` 与 `SetCustomSignalWaiter` 的写法见 [014-运维接入](./016-运维接入.md);
