---
id: e5f03202-fdc3-4560-be6f-4f7f49f0d25b
---

# Kitex 接口开发流程

如何用 Kitex 完成一个可调用的 RPC 接口？IDL、Handler、Server 和 Client 应按什么顺序开发？默认选什么协议和连接方式？上线前还要补齐哪些配置？

## 默认方案

- 接口协议: 新服务默认使用 Thrift unary;
- 开发方式: 先写 IDL，再生成代码，不手写编解码和 RPC 桩;
- 服务端: Handler 只做协议适配，业务规则放 Service;
- 客户端: 每个目标服务创建一个 Client，并在进程级复用;
- 生产要求: 显式配置寻址、RPC timeout、错误处理和基础观测;

## 一次调用发生了什么

- 控制面: 决定“调用谁、用什么策略”; 包括 Registry、Resolver、配置中心;
- 数据面: 真正处理每一次请求; 包括 Client、Server、Codec、Transport;
- 记忆点: 控制面管“选路和规则”，数据面管“跑请求”;

```text
业务代码
  → Client middleware（日志/超时/重试等横切逻辑）
  → 服务发现 + 负载均衡（选一个实例）
  → 序列化 + 传输（把结构体变成字节并送上网）
  → Server 接收
  → Server middleware
  → Handler（你的业务函数）
  → 原路返回响应
```

## 开发对象

| 对象        | 通俗解释                                  | 生命周期               |
| ----------- | ----------------------------------------- | ---------------------- |
| IDL         | 双方都认的“接口合同”                      | 随接口演进             |
| `kitex_gen` | 由 IDL 自动生成的“翻译官”代码             | 由工具重新生成         |
| Handler     | 服务端真正写业务逻辑的地方                | Server 生命周期        |
| Client      | 调用方手里的“遥控器”，管理连接与策略      | 进程级复用             |
| Option      | 创建 Server/Client 或单次调用时的配置旋钮 | 取决于注入位置         |
| middleware  | 包在调用外面的通用处理层                  | Client/Server 生命周期 |

- Handler: 实现 IDL 中定义的 service 接口，只关心业务，不处理网络和编解码;
- Client: 创建一次后长期复用；内部管理连接池、服务发现缓存、超时重试等;
- Option: 分为 `server.Option`、`client.Option`、`callopt.Option` 三种作用域;

## 开发步骤

- 第一步: 用 Thrift 或 proto3 写 IDL，定义 service、method、请求和响应;
- 第二步: 用 `kitex` 命令生成 `kitex_gen` 桩代码;
- 第三步: 服务端实现 Handler，用 `NewServer` 启动;
- 第四步: 客户端用 `NewClient` 创建可复用 Client，然后调用方法;
- 第五步: 按生产需要配置寻址、超时、重试、熔断和可观测性;

## 完成标准

- 本地调用: Client 能通过固定地址调用 Server 并得到正确响应;
- 代码边界: 生成代码没有手工修改，Handler 不承载复杂业务;
- 生命周期: Client 被复用，Server 能优雅退出;
- 生产配置: 服务名、寻址方式、RPC timeout、错误分类和观测字段明确;

## 选型边界

- Protobuf: 已有 proto3 契约，或需要和 Protobuf 生态互通时使用; 必须声明 `go_package`;
- gRPC: 需要标准 gRPC 互通或 streaming 时使用; unary proto 默认走 Kitex Protobuf;
- StreamX: 需要长连接、持续推送或双向流时使用; 普通请求响应不需要;
- 泛化调用: 网关、测试平台、流量代理等无法为每个服务静态生成代码时使用;
- HTTP: Kitex 面向 RPC; 对外 HTTP API 通常由 Hertz 等网关层承载;

## 常见误区

- 误区: 每个请求都新建 Client; 正确做法是进程级复用;
- 误区: 把 middleware 当业务代码; middleware 应放通用横切逻辑;
- 误区: 一开始就学全部协议; 先跑通 Thrift unary，再按需扩展;
