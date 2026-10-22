---
id: e95c3915-3837-4a1f-850e-4834afcae7a9
---

# Hono 是什么

## Hono 是什么？

- 定位: 建在 Web Standards（`Request`、`Response`、`URL`、`Headers`、`fetch`）上的小型 HTTP 框架;
- 零依赖: 运行时只用标准 API，不引入 polyfill;
- 多运行时: Cloudflare Workers、Deno、Bun、Fastly、AWS Lambda 都能跑，Node.js 通过 `@hono/node-server` 适配;
- 体积: `hono/tiny` 预设压缩后小于 14KB，未用到的中间件不进包;
- 名字来源: 日语「炎」;

```ts
import { Hono } from "hono";

const app = new Hono();
app.get("/", (c) => c.text("Hono!"));
```

## 为什么同一份代码能跑在 Node 上？

- 框架只依赖标准对象，不碰运行时的私有 API;
- 各运行时自身实现了 Fetch 语义，Node 用适配器补齐;
- 适配器负责把 `node:http` 的请求/响应翻译成标准 `Request`/`Response`，因此业务代码不需要感知平台;

```text
业务代码（标准 Request/Response）
    ↑                        ↓
Adapters: @hono/node-server / workerd / deno / bun
    ↑                        ↓
具体运行时的 HTTP 栈
```

## Hono 和 Express、Nest 有什么不同？

| 维度     | Hono                                  | Express                 | Nest                     |
| -------- | ------------------------------------- | ----------------------- | ------------------------ |
| 请求对象 | 标准 `Request` + `Context` 封装       | `req`/`res` 原生扩展    | 装饰器 + DI 容器         |
| 中间件   | 洋葱模型，`await next()`              | 洋葱模型，回调 `next()` | Guard/Interceptor/Pipe   |
| 类型     | 一等 TypeScript，路径参数是字面量类型 | 需额外声明              | 较强，但依赖装饰器元数据 |
| 依赖     | 0                                     | 多                      | 多                       |
| 多运行时 | 支持                                  | 仅 Node                 | 仅 Node                  |
| 学习成本 | 低（API 面小）                        | 低                      | 高                       |

- 结论: 要做「HTTP API 服务」且希望代码小、类型强，Hono 是 Express 的直接替代品;
- 边界: Hono 不提供 ORM、DI 容器和模块系统，这些要自己选（Drizzle、Prisma、`createFactory` 手写注入）;

## 什么样的需求适合用 Hono？

- 适合: REST/JSON API、BFF 与反向代理、SSE/流式接口、需要类型安全客户端的全栈项目、当作库的内嵌 HTTP 服务器;
- 不太适合: 需要开箱即用的模块化架构与依赖注入的大型团队项目；重度依赖 Express 生态中间件（如 passport 全家桶）时改造量更大;
- 纯前端项目不需要 Hono，它是服务端框架;
