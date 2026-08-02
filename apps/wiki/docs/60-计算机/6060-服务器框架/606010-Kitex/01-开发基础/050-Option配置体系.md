---
id: 4fd8230e-1d75-4bd7-b445-bcc03fbdcba5
---

# Option 配置体系

## 三种作用域

| 类型             | 注入位置        | 作用域          | 典型用途                     |
| ---------------- | --------------- | --------------- | ---------------------------- |
| `server.Option`  | `NewServer`     | Server 生命周期 | 地址、Registry、限流、中间件 |
| `client.Option`  | `NewClient`     | Client 生命周期 | Resolver、超时、重试、协议   |
| `callopt.Option` | RPC method 尾参 | 单次调用        | 临时超时、目标地址、标签     |

- 优先级: 单次 Call Option 通常覆盖同类 Client Option;
- 配置原则: 稳定默认值放构造期; 请求特例才放 Call Option;
- 组合原则: 将一组组织级配置封装为 `Suite`, 避免每个 Client 重复排列 Option;

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
- mux: 旧 `WithMuxConnection` / `WithMuxTransport` 依赖的 netpollmux 已不再维护; 新系统不要采用;
- gRPC Option: 大量窗口、buffer、keepalive 参数只在证据表明默认值不适用时调整;
