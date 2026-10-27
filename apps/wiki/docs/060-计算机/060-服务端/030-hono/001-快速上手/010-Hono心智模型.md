---
id: e95c3915-3837-4a1f-850e-4834afcae7a9
anki: true
---

# Hono 心智模型

## Hono 是哪种框架？

- 定位: 建在 Web 标准上的小型 HTTP 框架，同一份代码经适配器跑在多个运行时;
- 依赖面: 只用标准 `Request`、`Response`、`URL`、`Headers`、`fetch`，零依赖、无 polyfill;
- 运行时: Cloudflare Workers、Deno、Bun、Fastly、AWS Lambda 直接跑，Node.js 经 `@hono/node-server`;
- 体积: `hono/tiny` 预设压缩后约 14–15KB，未用到的中间件不进包;
- 名字: 来自日语「炎」;

## 一个能跑的 Hono 应用长什么样？

```ts
import { Hono } from "hono";

const app = new Hono();

// 中间件: await next() 之前是请求阶段，之后是响应阶段
app.use(async (c, next) => {
  const start = performance.now();
  await next();
  c.res.headers.set("X-Response-Time", `${performance.now() - start}`);
});

app.get("/", (c) => c.text("Hono!"));
```

- 中间件签名 `(c, next) => Promise<void | Response>`，提前返回 `Response` 即短路;

## 一次请求怎么走？

```text
收到连接 → 适配器组装标准 Request → Router 匹配
  → 中间件 1 前 → 中间件 2 前 → Handler
  → 中间件 2 后 → 中间件 1 后 → Response 写回网络
```

- Handler: 唯一返回 `Response` 的一层，一条请求只命中一个;
- Adapter: 把运行时 HTTP 栈翻译成标准对象，业务代码不感知平台;
- 洋葱模型与横切逻辑该放哪层是框架无关的，见 [请求生命周期](../../000-服务端知识/010-基础模型/010-请求生命周期.md);

## Hono 适合做什么，不做什么？

- 适合: REST/JSON API、BFF 与反向代理、SSE/流式接口，也能当库内嵌进现有 Node 服务;
- 不提供: ORM、DI 容器、模块系统、session 存储，自己选（Drizzle、Prisma、`createFactory`）;
- 纯前端项目用不到它，它是服务端框架;
- 不该用的场景: 要开箱模块化与 DI 的大型团队项目；重度依赖 Express 中间件（如 passport）时改造量更大;

## app、c、Env、Adapter、Helper、Router 分别指什么？

| 名字           | 含义                                                         |
| -------------- | ------------------------------------------------------------ |
| `app`          | `Hono` 实例，一个应用或一个子路由                            |
| `c`（Context） | 每请求一份，读写请求、设置响应、存取请求级变量               |
| `Env`          | 泛型 `Bindings` + `Variables`，决定 `c.env` / `c.var` 的类型 |
| Adapter        | 运行时入口包，如 `@hono/node-server`                         |
| Helper         | 辅助函数集合，如 `hono/cookie`、`hono/streaming`             |
| Router         | 匹配算法，如 `RegExpRouter`、`TrieRouter`                    |

- 逐行展开: [中间件](../002-服务端开发/040-中间件.md)、[类型与请求级变量](../002-服务端开发/030-类型与请求级变量.md)、[路由器与预设](../003-上线/050-路由器与预设.md);
