---
id: 7ba617f0-f4a3-48c0-a102-14840942be0e
---

# Hertz 心智模型

Hertz 解决什么问题，Engine、Handler 与 RequestContext 如何分工？一个 HTTP 请求从连接到响应会经过哪些环节？初学 Hertz 应该先掌握哪条主线？什么时候才需要代码生成、HTTP/2、WebSocket、SSE 或第三方扩展？

## 定位

- Hertz: CloudWeGo 的 Go HTTP 框架; 负责网络收发、路由、请求上下文、中间件和响应渲染;
- HTTP 框架: 接收 HTTP 请求、匹配地址和方法、调用业务代码并生成 HTTP 响应的基础设施;
- Engine: 服务入口和路由树；路由树负责把“方法 + 路径”匹配到 Handler，Engine 还管理监听、协议、超时与生命周期;
- Handler: 处理一次 HTTP 请求的函数；把协议输入转换为业务调用，再把结果写回响应;
- RequestContext: 本次请求的可变 HTTP 状态；包含参数、请求、响应和中间件数据，请求结束后会被复用;
- `context.Context`: 取消信号、截止时间和跨层请求范围值; 不等同于 `RequestContext`;

## 请求链路

```text
连接 → HTTP 解析 → 全局中间件 → 路由匹配 → 路由组中间件
    → Handler → Service → Repository → 响应编码 → 网络写回
```

- 数据面: Engine、network、protocol、route 和 Handler 执行每次请求;
- 中间件: 在 Handler 前后运行的通用处理链，用于认证、日志、恢复、限流和观测;
- Service: 不依赖 HTTP 细节的业务规则层;
- Repository: 隔离数据库或其他持久化实现的数据访问层;

## 默认主线

- 入门: 直接注册路由，理解 `Engine → Handler → RequestContext`;
- 工程化: 使用 `hz + Thrift IDL` 生成模型、路由和 Handler 骨架;
- API 风格: JSON REST API; HTTP 状态码表示协议结果，业务错误码保持稳定;
- 生产最低要求: 超时、安全边界、统一错误、健康检查、优雅退出、日志、指标和测试;

## 选型边界

- Thrift IDL: 在 Hertz 中描述 HTTP API 并驱动代码生成; 不表示请求必须使用 Thrift 传输;
- Kitex: 解决服务间 RPC; Hertz 解决 HTTP 服务与网关，两者可在同一服务中协作;
- HTTP/2、WebSocket、SSE: 按长连接、双向通信或服务端推送需求选择; 普通 CRUD 无需默认启用;
- 第三方扩展: 优先围绕接口和能力选择; 不把某个日志、注册中心或鉴权库写进业务层;
