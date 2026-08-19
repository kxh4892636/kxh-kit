---
id: 4fd8230e-1d75-4bd7-b445-bcc03fbdcba5
---

# Option 配置体系

Kitex 的配置分几种作用域？它们何时生效、优先级如何？常用 Client Option 和 Server Option 有哪些？为什么用 Suite 组合配置？有哪些配置陷阱？

## 一句话理解

- Option: 创建 Server、Client 或发起单次调用时传入的“配置项”;
- 作用域决定配置的生命周期: 进程级、Client 级还是单次请求级;
- 类比: `server.Option` 是餐厅装修方案，`client.Option` 是长期会员权益，`callopt.Option` 是本次点单的临时备注;

## 三种作用域

| 类型             | 注入位置        | 作用域          | 典型用途                     |
| ---------------- | --------------- | --------------- | ---------------------------- |
| `server.Option`  | `NewServer`     | Server 生命周期 | 地址、Registry、限流、中间件 |
| `client.Option`  | `NewClient`     | Client 生命周期 | Resolver、超时、重试、协议   |
| `callopt.Option` | RPC method 尾参 | 单次调用        | 临时超时、目标地址、标签     |

- 优先级: 单次 Call Option 通常覆盖同类 Client Option;
- 配置原则: 稳定默认值放构造期，请求特例才放 Call Option;

## Suite 组合配置

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

## 常用 Client Option

- `WithClientBasicInfo`: 调用方身份;
- `WithResolver`: 服务发现;
- `WithHostPorts`: 固定地址;
- `WithConnectTimeout`: 建连上限;
- `WithRPCTimeout`: 单次 RPC 上限;
- `WithFailureRetry` / `WithBackupRequest`: 重试策略;
- `WithCircuitBreaker`: 熔断实现;
- `WithMiddleware` / `WithInstanceMW`: 服务级或实例级中间件;
- `WithTransportProtocol`: TTHeader、Framed 或 gRPC 等传输选择;

## 常用 Server Option

- `WithServiceAddr`: 监听地址;
- `WithServerBasicInfo`: 服务身份;
- `WithRegistry`: 服务注册;
- `WithLimit`: 内置 QPS 与连接数限制;
- `WithMiddleware`: 认证、访问控制与观测;
- `WithReadWriteTimeout`: 传输读写等待，不是 Handler 执行超时;
- `WithExitWaitTime`: 退出时等待在途请求;

## 配置陷阱

- timeout: 默认 RPC timeout 为 0，即无限等待; 生产必须显式设置;
- protocol: Client 选择必须与 IDL、Server 能力相容;
- middleware: 注册顺序会改变包裹顺序与错误观测结果;
- limiter: 同时配置内置与自定义同类 limiter 时，自定义实现生效;
- mux: 旧 `WithMuxConnection` / `WithMuxTransport` 依赖的 netpollmux 已不再维护;
- gRPC Option: 大量窗口、buffer、keepalive 参数只在有证据表明默认值不适用时调整;

## 常见误区

- 误区: 把单次特例配置变成全局默认; 会让调用路径不可预测;
- 误区: 不用 Suite 导致每个 Client 配置漂移;
- 误区: 生产不设置 RPC timeout; 默认无限等待会拖垮调用方;
