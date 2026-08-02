---
id: e5f03202-fdc3-4560-be6f-4f7f49f0d25b
---

# Kitex 心智模型

## 定位

- Kitex: 面向微服务的 Go RPC 框架; 核心价值为高性能网络、IDL 驱动开发、服务治理与可扩展接口;
- RPC: Client 像调用本地方法一样调用远端 Handler; 框架负责寻址、编码、传输、超时与错误转换;
- 一次调用: 业务请求 → Client middleware → 服务发现与负载均衡 → 编码与传输 → Server middleware → Handler;
- 控制面: Registry、Resolver、配置中心提供实例与策略;
- 数据面: Client、Server、Codec、Transport 执行每次请求;

## 开发闭环

- 第一步: 使用 Thrift 或 proto3 定义 service、method、request、response;
- 第二步: 使用 `kitex` 生成 `kitex_gen` 桩代码和可选 Server scaffold;
- 第三步: 实现 Handler，使用生成的 `NewServer` 启动服务;
- 第四步: 使用生成的 `NewClient` 创建可复用 Client;
- 第五步: 配置寻址、超时、重试、熔断与可观测能力;

## 核心对象

| 对象        | 职责                           | 生命周期               |
| ----------- | ------------------------------ | ---------------------- |
| IDL         | 跨语言契约与字段编号           | 随接口演进             |
| `kitex_gen` | 类型、编解码、Client/Server 桩 | 由工具重新生成         |
| Handler     | 业务实现                       | Server 生命周期        |
| Client      | 发现缓存、连接池、治理策略     | 进程级复用             |
| Option      | 构造期或单次调用配置           | 取决于 Option 类型     |
| middleware  | 横切治理逻辑                   | Client/Server 生命周期 |

## 默认主线

- Thrift unary: 最适合快速理解 Kitex 原生开发模型;
- PingPong: 请求对应一个响应; 常规业务接口默认选择;
- 长连接池: 默认连接模型; Client 不应按请求创建;
- 生产最低要求: 明确服务名、寻址、RPC timeout、错误分类与基本观测;

## 选型边界

- Protobuf: 已有 proto3 契约或跨语言生态时使用; 必须声明 `go_package`;
- gRPC: 需要 gRPC 互通或 streaming 时使用; unary proto 默认仍可能采用 Kitex Protobuf;
- StreamX: 长连接双向数据流或持续推送场景; 普通请求响应不需要;
- 泛化调用: 网关、测试平台、流量代理无法静态生成每个服务类型时使用;
- HTTP 服务: Kitex 本身解决 RPC; 对外 HTTP API 通常由 Hertz 等网关层承载;
