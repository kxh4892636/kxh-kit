---
id: 4fd8230e-1d75-4bd7-b445-bcc03fbdcba5
anki: true
---

# 作用域与 Suite

## 一个选项该写在哪一层？

- 判断: 看它属于 Server 生命周期、Client 生命周期，还是单次调用; 优先级是单次 Call Option 通常覆盖同类 Client Option; 稳定默认值放构造期，请求特例才放 Call Option; 分层与启动顺序见 [配置与启动顺序](../000-服务端知识/010-基础模型/040-配置与启动顺序.md);

| 类型             | 注入位置        | 作用域          | 典型用途                     |
| ---------------- | --------------- | --------------- | ---------------------------- |
| `server.Option`  | `NewServer`     | Server 生命周期 | 地址、Registry、限流、中间件 |
| `client.Option`  | `NewClient`     | Client 生命周期 | Resolver、超时、重试、协议   |
| `callopt.Option` | RPC method 尾参 | 单次调用        | 临时超时、目标地址、标签     |

## Suite 怎么复用组织级配置？

```go
type orgClientSuite struct{}

func (orgClientSuite) Options() []client.Option {
	return []client.Option{
		client.WithConnectTimeout(200 * time.Millisecond),
		client.WithRPCTimeout(time.Second),
	}
}

func newOrgClient() (userservice.Client, error) {
	return userservice.NewClient("user-service",
		client.WithSuite(orgClientSuite{}),     // 组织级默认
		client.WithHostPorts("127.0.0.1:8888"), // 调用方显式覆盖
	)
}
```

- 作用与风险: 把一组组织级选项打包复用，多服务共享超时、重试、中间件、观测规范; 代价是隐藏默认值与顺序，必须提供覆盖方式和版本策略，否则排查时看不出实际生效值;
