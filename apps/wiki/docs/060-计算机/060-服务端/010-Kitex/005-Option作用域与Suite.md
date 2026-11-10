---
id: 4fd8230e-1d75-4bd7-b445-bcc03fbdcba5
anki: true
---

# Option 作用域与 Suite

## 一个选项该写在哪一层？

| 类型             | 注入位置     | 作用域          | 典型用途                     |
| ---------------- | ------------ | --------------- | ---------------------------- |
| `server.Option`  | `NewServer`  | Server 生命周期 | 地址、Registry、限流、中间件 |
| `client.Option`  | `NewClient`  | Client 生命周期 | Resolver、超时、重试、协议   |
| `callopt.Option` | RPC 方法尾参 | 单次调用        | 临时超时、目标地址、标签     |

- 优先级: 单次 Call Option 覆盖同类 Client Option;
- 稳定默认值放构造期, 请求特例才放尾参;

## Suite 怎么打包组织级默认值？

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
		client.WithHostPorts("127.0.0.1:8888"), // 调用方覆盖
	)
}
```

- Client Suite: 实现 `Options() []client.Option`;
- Server 侧: 同型, 返回 `[]server.Option`;
- 代价: 默认值藏进 Suite, 排查时看不出实际生效值;
- 要求: 留出覆盖方式, 并固定 Suite 版本;
