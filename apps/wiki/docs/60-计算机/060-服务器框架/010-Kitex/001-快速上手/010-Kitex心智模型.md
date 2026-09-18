---
id: e5f03202-fdc3-4560-be6f-4f7f49f0d25b
---

# Kitex 接口开发流程

## 一次 RPC 怎样到达业务函数？

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

## 开发链路中的对象如何分工？

| 对象             | 承担的职责                         | 继续学习                            |
| ---------------- | ---------------------------------- | ----------------------------------- |
| IDL / 生成代码   | 定义契约并生成类型、编解码和调用桩 | [代码生成](./020-IDL与代码生成.md)  |
| Handler / Server | 实现方法并接收 RPC                 | [服务端](./030-服务端开发.md)       |
| Client           | 按契约调用远端方法                 | [客户端](./040-客户端调用.md)       |
| Option / Suite   | 在明确作用域配置行为               | [配置体系](./050-Option配置体系.md) |
| Middleware       | 在业务前后执行公共逻辑             | [服务端](./030-服务端开发.md)       |

## 如何完成一个 Kitex 接口的开发？

- 第一步: 用 Thrift 或 proto3 写 IDL，定义 service、method、请求和响应;
- 第二步: 用 `kitex` 命令生成 `kitex_gen` 桩代码;
- 第三步: 服务端实现 Handler，用 `NewServer` 启动;
- 第四步: 客户端用 `NewClient` 创建可复用 Client，然后调用方法;
- 第五步: 按生产需要配置寻址、超时、重试、熔断和可观测性;

## 如何找到适合当前接口的通信方案？

- 契约选择: Thrift 与 proto3 的生成前提见 [IDL](./020-IDL与代码生成.md);
- 协议选择: 编码相同不代表网络互通，比较 [传输与序列化协议](../090-协议速查/020-传输与序列化协议.md);
- 持续收发: 按 [StreamX](../090-协议速查/030-StreamX流式通信.md) 选择流的方向;
- 动态接口: 网关或测试平台运行时才知道方法时，参见 [泛化调用](../091-特殊需求/010-高级能力.md);
- HTTP 边界: 对外 HTTP API 通常由 Hertz 承载，再调用内部 Kitex 服务;

## 需要核对具体用法时查哪里？

- 官方入口: [基础示例](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/kitex/Getting%20started/quick_start.md)、[前置知识](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/kitex/Getting%20started/pre-knowledge.md);
