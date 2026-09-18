---
id: 4fd8230e-1d75-4bd7-b445-bcc03fbdcba5
---

# Option 配置

## 如何确定 Option 的生效范围？

| 类型             | 注入位置        | 作用域          | 典型用途                     |
| ---------------- | --------------- | --------------- | ---------------------------- |
| `server.Option`  | `NewServer`     | Server 生命周期 | 地址、Registry、限流、中间件 |
| `client.Option`  | `NewClient`     | Client 生命周期 | Resolver、超时、重试、协议   |
| `callopt.Option` | RPC method 尾参 | 单次调用        | 临时超时、目标地址、标签     |

- 优先级: 单次 Call Option 通常覆盖同类 Client Option;
- 配置原则: 稳定默认值放构造期，请求特例才放 Call Option;

## 如何用 Suite 复用配置？

- Suite: 把一组组织级 Option 打包复用，避免每个 Client 重复排列;
- 适用: 多服务共享超时、重试、中间件、观测等规范;
- 风险: Suite 会隐藏默认值和顺序; 必须提供覆盖方式和版本策略;

```go
type orgClientSuite struct{}

func (orgClientSuite) Options() []client.Option {
	return []client.Option{
		client.WithConnectTimeout(200 * time.Millisecond),
		client.WithRPCTimeout(time.Second),
		// 可继续加入重试、熔断和 Middleware 等组织级配置。
	}
}

func newUserClient() (userservice.Client, error) {
	cli, err := userservice.NewClient(
		"user",
		client.WithSuite(orgClientSuite{}),
		client.WithHostPorts("127.0.0.1:8888"),
	)
	if err != nil {
		return nil, fmt.Errorf("create user client: %w", err)
	}
	return cli, nil
}
```

## 如何查找 Client 的配置入口？

- `WithClientBasicInfo`: 调用方身份;
- `WithResolver`: 服务发现;
- `WithHostPorts`: 固定地址;
- `WithConnectTimeout`: 建连上限;
- `WithRPCTimeout`: 单次 RPC 上限;
- `WithFailureRetry` / `WithBackupRequest`: 重试策略;
- `WithCircuitBreaker`: 熔断实现;
- `WithMiddleware` / `WithInstanceMW`: 服务级或实例级中间件;
- `WithTransportProtocol`: TTHeader、Framed 或 gRPC 等传输选择;

## 如何查找 Server 的配置入口？

- `WithServiceAddr`: 监听地址;
- `WithServerBasicInfo`: 服务身份;
- `WithRegistry`: 服务注册;
- `WithLimit`: 内置 QPS 与连接数限制;
- `WithMiddleware`: 认证、访问控制与观测;
- `WithReadWriteTimeout`: 传输读写等待，不是 Handler 执行超时;
- `WithExitWaitTime`: 退出时等待在途请求;

## 如何检查配置组合是否有效？

- 超时: 默认值与跨进程传播前提见 [超时与重试](../002-服务端开发/020-超时与重试.md);
- 协议: 通过 [协议互通表](../090-协议速查/020-传输与序列化协议.md) 对齐 IDL、Client 与 Server;
- Middleware: 先注册者包裹后注册者；公共配置必须说明注入顺序;
- 限流: 内置与自定义同类 limiter 的覆盖规则见 [流量保护](../002-服务端开发/030-熔断降级与流量保护.md);
- 连接: 旧 mux 的废弃状态与连接池边界见 [消息与连接](../090-协议速查/010-消息类型与连接.md);
- gRPC 参数: 窗口、buffer 和 keepalive 只在测量证明默认值不适合时调整;

## 需要核对具体用法时查哪里？

- 官方入口: [Client Option](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/kitex/Tutorials/options/client_options.md)、[Server Option](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/kitex/Tutorials/options/server_options.md)、[Suite 扩展](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/kitex/Tutorials/framework-exten/suite.md);
