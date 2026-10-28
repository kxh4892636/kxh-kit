# Hono 服务端开发

Hono 是运行在 Web 标准之上的 HTTP 框架，本目录只写「术」：Hono 怎么接、API 怎么用。原理与判断规则去 [000-服务端知识](../000-服务端知识/README.md)。

## 阅读顺序

1. [001-快速上手](./001-快速上手/README.md)：跑起服务，再学路由、读请求、写响应、处理错误；
2. [002-服务端开发](./002-服务端开发/README.md)：校验与类型、中间件、常用横切能力、测试；
3. [003-上线](./003-上线/README.md)：构建产物、静态文件、退出/探针/日志；
4. [090-按需查阅](./090-按需查阅/README.md)：流式与 SSE、WebSocket、JSX 与 SSR。

## 一条完整的使用路径

```text
初始化 → serve() 跑起来 → 注册路由 → 读请求 → 返回响应 / 处理错误
→ 加校验与中间件 → 接认证与跨源 → 写测试 → 构建 dist → 上线配探针与日志
```

- 第一次用：001 的 010 → 020，十分钟内跑出可 curl 的接口；
- 写业务：001 的 030 之后进 002，按校验、中间件、测试的顺序补；
- 上线前：003 的 010、030，把构建、探针、日志与退出补齐；
- 需要原理：去 000；换框架时只重读接入代码。

## 边界

- 只覆盖 Node.js 运行时；Cloudflare Workers、Deno、Bun、AWS Lambda 等平台差异按需查官方文档；
- 内容基于 Hono v4，Node.js 20 及以上；
- 来源：[honojs/website/docs](https://github.com/honojs/website/tree/main/docs) 与 [@hono/node-server](https://github.com/honojs/node-server)；目录组织与验收步骤是应用整理，不是官方规范。
