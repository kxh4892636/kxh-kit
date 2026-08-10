---
id: e5f03202-fdc3-4560-be6f-4f7f49f0d25b
---

# Kitex 心智模型

Kitex 解决什么问题，一次 RPC 调用经过哪些环节？从定义接口到完成调用需要哪些步骤？IDL、Handler、Client、Option 与 middleware 分别负责什么？初学 Kitex 应该先掌握哪条主线？什么时候才需要 Protobuf、gRPC、StreamX 或泛化调用？

## 定位

- Kitex: 面向微服务的 Go RPC 框架; 核心价值为高性能网络、IDL 驱动开发、服务治理与可扩展接口;
- RPC: 远程过程调用；Client 像调用本地函数一样请求另一进程中的 Handler，框架负责找到服务、编码数据并通过网络传输;
- IDL: 接口描述语言；用与具体实现分离的文件定义方法和数据结构，再生成两端都遵守的代码;
- middleware: 包围一次调用的中间层，用于日志、超时、重试、鉴权等不属于业务本身的通用逻辑;
- 一次调用: 业务请求 → Client middleware → 服务发现与负载均衡 → 编码与传输 → Server middleware → Handler;
- 控制面: 决定“调用哪个实例、采用什么策略”的部分；Registry、Resolver、配置中心提供实例与规则;
- 数据面: 真正处理每次请求的部分；Client、Server、Codec、Transport 负责调用、编解码和传输;

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

- Handler: 服务端真正处理一个方法的函数实现;
- Client: 调用方持有的可复用对象，内部管理连接、寻址缓存与治理策略;
- Option: 创建 Client、Server 或发起单次调用时传入的配置项;

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
