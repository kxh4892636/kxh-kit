# Hono 服务端开发

Hono 是运行在 Web 标准之上的 HTTP 框架，本目录只写「术」：Hono 怎么接、API 怎么用。原理与判断规则去 [000-服务端知识](../000-服务端知识/README.md)。

## 阅读顺序

1. [001-快速上手](./001-快速上手/README.md)：跑起第一个服务，再学路由、读请求、写响应、处理错误；
2. [002-服务端开发](./002-服务端开发/README.md)：factory、校验、类型、中间件、压缩、测试、认证/跨源、会话、请求边界、上传；
3. [003-上线](./003-上线/README.md)：构建产物、静态文件、性能、上下文存储、路由器、退出/探针/日志；
4. [090-按需查阅](./090-按需查阅/README.md)：中间件与 Helper 速查、代理、CLI 回归、hc 客户端、模板/JSX/SSR、流式与 WebSocket。

## 一条完整的使用路径

```text
初始化 → serve() 跑起来 → 注册路由 → 读请求 → 返回响应 / 处理错误
→ 加中间件与校验 → 接认证/CORS/会话 → 写测试
→ 构建 dist → 容器/反代上线 → 配探针、日志、优雅退出
```

- 第一次用：001 的 010 → 020，十分钟内跑出可 curl 的接口；
- 写业务：001 的 030 → 060，再按需看 002；
- 上线前：003 的 010、060，把构建、探针、日志与退出补齐；
- 需要原理：去 000；换框架时只重读接入代码。

## 边界

- 只覆盖 Node.js 运行时；Cloudflare Workers、Deno、Bun、AWS Lambda 等平台差异按需查官方文档；
- 内容基于 Hono v4 文档，Node.js 建议 20 及以上；
- 来源：[honojs/website/docs](https://github.com/honojs/website/tree/main/docs) 与 [@hono/node-server](https://github.com/honojs/node-server)；目录组织与验收步骤是应用整理，不是官方规范。
