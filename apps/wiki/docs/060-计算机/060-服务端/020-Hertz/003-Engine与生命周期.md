---
id: 651144e8-bec4-4512-83f6-3e7f7d46140f
anki: true
---

# Engine 与生命周期

## server.Default 和 server.New 差在哪？

- 只差一条: Default 多装 `recovery.Recovery()`，New 一个默认中间件都不装;

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

## 默认值是多少？

| 项           | 默认值                                  |
| ------------ | --------------------------------------- |
| 监听         | `:8888`                                 |
| read timeout | 3m                                      |
| body 上限    | 4 MiB                                   |
| exit wait    | 5s                                      |
| HTTP/2、H2C  | 关（`WithALPN` / `WithH2C` 默认 false） |

## 三个连接级超时分别对应哪个 Option？

- `WithReadTimeout` 管收完请求、`WithWriteTimeout` 管写响应、`WithIdleTimeout` 管 keep-alive 空闲;
- 业务超时在 Handler 里 `context.WithTimeout` 派生，四类超时的分工见 [超时类型与传递](../000-服务端知识/040-可靠性/020-超时类型与传递.md)。

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
- 验收在真实连接上看协议版本，再验请求、错误与回退; 代理与 TLS 终结的分层见 [反向代理与网关](../000-服务端知识/070-通信/030-反向代理与网关.md)。

## 服务从启动到退出按什么顺序走？

- 启动: 读配置 → 初始化依赖 → 注册中间件与路由 → `Spin`；依赖就绪后才打开 readiness;
- 退出: `OnShutdown`、`SetCustomSignalWaiter` 与 `WithExitWaitTime` 的写法见 [016-运维接入](./016-运维接入.md)。
