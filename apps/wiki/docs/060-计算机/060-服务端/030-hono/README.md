# Hono 服务端开发

Hono 是运行在 Web 标准之上的 HTTP 框架。本目录只写「术」: Hono 的 API、默认行为与运行时陷阱。原理与判断规则去 [000-服务端知识](../000-服务端知识/README.md)。

## 篇目

- [001-最小服务](./001-最小服务.md) — 依赖、三份文件、`serve()`、名词表;
- [002-路由与请求](./002-路由与请求.md) — 注册与匹配、路径参数、子路由、读参数/头/体;
- [003-响应与错误](./003-响应与错误.md) — `c.*` 响应、改已生成的响应、`onError`、404 与 405;
- [004-校验与类型](./004-校验与类型.md) — `zValidator`、`Bindings`/`Variables`、`factory`、`hc`;
- [005-中间件](./005-中间件.md) — 洋葱顺序、`createMiddleware`、注册顺序;
- [006-常用中间件](./006-常用中间件.md) — 跨源、鉴权、Cookie 与安全头、压缩、边界与缓存;
- [007-测试](./007-测试.md) — `app.request` 与 `testClient`;
- [008-构建与运行产物](./008-构建与运行产物.md) — `tsc` 产物、ESM、镜像、性能与 HTTP/2;
- [009-静态文件](./009-静态文件.md) — `serveStatic` 的 root/path 与缓存头;
- [010-运维接入](./010-运维接入.md) — 退出、探针、请求 ID 与日志;
- [011-流式与SSE](./011-流式与SSE.md) — `stream` / `streamText` / `streamSSE` 与关闭语义;
- [012-WebSocket](./012-WebSocket.md) — `upgradeWebSocket`、鉴权、房间与退出;
- [013-JSX与SSR](./013-JSX与SSR.md) — `hono/jsx`、布局、上下文与水合。

阅读顺序: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010；011 至 013 按需查。

## 一条完整的使用路径

```text
初始化 → serve() 跑起来 → 注册路由 → 读请求 → 返回响应 / 处理错误
→ 加校验与中间件 → 接认证与跨源 → 写测试 → 构建 dist → 上线配探针与日志
```

- 第一次用: 001、002 先跑出可 curl 的接口;
- 上线前: 008、010 补构建、探针、日志与退出;
- 需要「为什么」: 去 000，本目录只留指向。

## 边界

- 只覆盖 Node.js 运行时；Cloudflare Workers、Deno、Bun、AWS Lambda 的平台差异按需查官方文档;
- 内容基于 Hono v4，Node.js 20 及以上;
- 来源：[honojs/website/docs](https://github.com/honojs/website/tree/main/docs) 与 [@hono/node-server](https://github.com/honojs/node-server)；目录组织与验收步骤是应用整理，不是官方规范。
