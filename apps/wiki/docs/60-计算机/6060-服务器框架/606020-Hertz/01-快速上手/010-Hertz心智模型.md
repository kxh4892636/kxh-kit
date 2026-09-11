---
id: 7ba617f0-f4a3-48c0-a102-14840942be0e
---

# Hertz 接口开发流程

## 如何选择 Hertz 的开发方式？

- 接口风格: 默认使用 JSON REST API;
- 小型服务: 直接注册路由并编写 Handler;
- 契约驱动项目: 使用 Thrift IDL 和 `hz` 生成模型、路由和 Handler 骨架;
- 代码边界: Handler 负责 HTTP 适配，Service 负责业务规则，Repository 负责持久化;
- 生产要求: 显式配置请求边界、统一错误、健康检查、优雅退出、日志、指标和测试;

## HTTP 请求如何到达业务层？

```text
连接 → HTTP 解析 → 全局中间件 → 路由匹配 → 路由组中间件
    → Handler → Service → Repository → 响应编码 → 网络写回
```

- 数据面: Engine、network、protocol、route 和 Handler 执行每次请求;
- 中间件: 在 Handler 前后运行的通用处理链，用于认证、日志、恢复、限流和观测;
- Service: 不依赖 HTTP 细节的业务规则层;
- Repository: 隔离数据库或其他持久化实现的数据访问层;

## 如何完成一个 HTTP 接口的开发？

- 第一步: 定义 HTTP 方法、路径、请求字段、成功状态和错误响应;
- 第二步: 注册路由或通过 `hz` 生成路由与模型;
- 第三步: Handler 完成绑定、身份读取、Service 调用和响应映射;
- 第四步: Service 实现业务规则，Repository 隔离数据库;
- 第五步: 用 curl 或 HTTP 测试跑通成功、参数错误和资源不存在路径;
- 第六步: 补齐安全、生命周期、观测、测试和部署配置;

## 如何判断 Hertz 的使用边界？

- Thrift IDL: 在 Hertz 中描述 HTTP API 并驱动代码生成; 不表示请求必须使用 Thrift 传输;
- Kitex: 解决服务间 RPC; Hertz 解决 HTTP 服务与网关，两者可在同一服务中协作;
- HTTP/2、WebSocket、SSE: 按长连接、双向通信或服务端推送需求选择; 普通 CRUD 无需默认启用;
- 第三方扩展: 优先围绕接口和能力选择; 不把某个日志、注册中心或鉴权库写进业务层;

## 需要核对具体用法时查哪里？

- 官方入口: [快速开始](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/getting-started/_index.md)、[Engine](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/basic-feature/engine.md);
