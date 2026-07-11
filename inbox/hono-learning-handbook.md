---
id: 574ae033-fc7d-4189-8274-0e3594be6e1d
---

# Hono 初学者学习手册

## 学习完成标准

- 完成标准: 能从零解释 Hono 的定位、Web Standards 心智模型、runtime/adapter 差异、路由、中间件、校验、错误处理、RPC、测试和部署选择;
- 最小产出: 能写出一个包含 GET/POST、path param、query、JSON body、middleware、validation、error handler 和 `app.request()` 测试的 Hono API;
- 判断能力: 能根据部署约束选择 Cloudflare Workers、Node.js、Bun、Deno、Vercel 等 runtime, 并知道哪些代码是通用 Hono 代码, 哪些代码是 runtime entry point 或 adapter 代码;
- 边界意识: 能识别常见误区, 包括 Express 心智模型迁移错误、middleware 顺序错误、RPC 类型丢失、`Content-Type` 缺失、header 大小写误用、Hono 版本不一致;

## 资料口径

- 来源事实: 本手册依据仓库内 Hono skill 的官方 docs 快照整理, snapshot commit 为 `3593c79adbe4caf5c519ee8f15f0e31f1a2a63c5`;
- 必读快照: `index.md`、`getting-started/basic.md`、`api/hono.md`、`api/routing.md`、`api/context.md`、`api/request.md`、`api/exception.md`、`guides/middleware.md`、`guides/validation.md`、`guides/rpc.md`、`guides/testing.md`、`guides/best-practices.md`、`middleware/builtin/cors.md`、`middleware/builtin/logger.md`、`middleware/builtin/jwt.md`;
- 补充快照: 为部署和 runtime 章节补充读取 `getting-started/nodejs.md`、`getting-started/bun.md`、`getting-started/cloudflare-workers.md`、`getting-started/vercel.md`、`getting-started/deno.md`;
- 稳定判断: API 名称、import path、middleware 选项以本地官方快照为准; 最新线上版本可能已有变化, 生产升级前应再对照当前官方 docs;

## Hono 定位

### 本质

- Hono: 基于 Web Standards 的小型、简单、高性能 Web framework, 主要用于构建 Web API、edge app、backend proxy、full-stack app 的 server side 部分;
- 不是 frontend 框架: Hono 可以返回 HTML/JSX, 但默认定位是 server/router/middleware 层, 不等于 React/Vue 这类 client UI framework;
- 类 Express 体验: API 写法接近 `app.get('/path', handler)`, 但底层心智模型不是 Node `req/res`, 而是 Web `Request`/`Response`;
- Multi-runtime: 同一套路由和 handler 逻辑可运行在 Cloudflare Workers、Fastly Compute、Deno、Bun、Vercel、Netlify、AWS Lambda、Lambda@Edge、Node.js 等环境;
- Zero dependencies: Hono core 体积小, middleware/helper 只在使用时引入, 适合 edge runtime 对冷启动和 bundle size 敏感的场景;

### 适合场景

| 场景                | Hono 价值                                   | 新手关注点                        |
| ------------------- | ------------------------------------------- | --------------------------------- |
| Web API             | 路由、JSON response、中间件、校验直接可用   | 先掌握 `Context` 和 `HonoRequest` |
| Edge API            | 基于 Fetch API, 贴近 Workers/Deno/Bun       | 不要依赖 Node-only API            |
| Backend proxy       | 读取 request, 调用上游, 返回 raw `Response` | 注意 body 消费和 headers          |
| Full-stack server   | Hono RPC 共享 server route type             | 需要 TypeScript strict 和版本一致 |
| Library base server | 可把 Hono app 挂载到平台 adapter            | 区分 app logic 和 runtime entry   |

### 与 Express 的关键差异

- Handler 返回值: Hono handler 必须返回 `Response` 或 Hono response helper 生成的 `Response`, 而不是调用 `res.send()` 后结束;
- Request/Response: Hono 使用 Web `Request`/`Response`, Node.js 原生 `IncomingMessage`/`ServerResponse` 只在 Node adapter 的 binding 中访问;
- Middleware: Hono middleware 通过 `await next()` 放行, 或直接返回 `Response` 提前结束;
- 类型推断: Hono 路由 path param、validator input、`c.json()` output 可参与 TypeScript 类型推断, 过度抽离 controller 会丢失一部分推断;

## Web Standards 心智模型

### 请求生命周期

```text
Client Request
  -> runtime entry point: fetch(request, env, ctx) or adapter server
  -> Hono app.fetch(request, env, ctx)
  -> router match by method + path
  -> middleware chain before next()
  -> route handler returns Response
  -> middleware chain after next()
  -> runtime sends Response to client
```

- `Request`: 浏览器 Fetch API 的 request 对象, 包含 method、url、headers、body;
- `Response`: 浏览器 Fetch API 的 response 对象, 包含 status、headers、body;
- `Headers`: Web 标准 headers 容器, Hono helper 也会读写它;
- `URL`: 解析 query/path 时的基础模型, Hono 提供更顺手的 `c.req.query()` 和 `c.req.param()`;
- `FormData`/`File`/`Blob`/`ArrayBuffer`: 处理 form、upload、binary body 时的标准对象;

### Hono 的三层模型

- `Hono app`: 路由表、middleware 注册表、notFound/onError、runtime entry 的聚合对象;
- `Context c`: 每个 request 独有的上下文, 负责读取 request、写 response、访问 env、临时存储变量;
- `HonoRequest c.req`: 对原始 Web `Request` 的轻量封装, 提供 param/query/header/body parsing/validated data 等便捷 API;

### 关键规则

- Handler 只处理一个 request: 不要把跨请求状态放进 `c.set()` 或 `c.var`;
- Body 通常只能消费一次: validator 或 `c.req.json()` 消费 body 后, 需要再次读取 raw request 时使用 `cloneRawRequest(c.req)`;
- Runtime 提供环境能力: Cloudflare 的 KV/R2/D1、Node 的 socket、Bun/Deno 的 static helper 都不是 Hono core 的通用能力;
- 业务代码优先保持 runtime-neutral: 路由、handler、schema、service 尽量不直接写平台 API, runtime entry point 单独放在入口文件;

## Runtime 与 Adapter

### Runtime 选择

| Runtime                   | Entry point                                          | Adapter 状态             | 适合场景                             |
| ------------------------- | ---------------------------------------------------- | ------------------------ | ------------------------------------ |
| Cloudflare Workers        | `export default app` 或 `{ fetch: app.fetch }`       | 原生 Fetch runtime       | Edge API、KV/R2/D1、低冷启动         |
| Node.js                   | `serve(app)` 或 `serve({ fetch: app.fetch })`        | 需要 `@hono/node-server` | 传统服务器、Node SDK、长连接进程     |
| Bun                       | `export default app` 或 `{ port, fetch: app.fetch }` | Bun 支持 Fetch server    | Bun 项目、快速本地 TS runtime        |
| Deno                      | `Deno.serve(app.fetch)`                              | Deno 支持 Fetch server   | Deno Deploy、JSR/npm import          |
| Vercel                    | `export default app`                                 | 使用 Vercel template     | Serverless API、Vercel frontend 共仓 |
| AWS Lambda/Netlify/Fastly | 依平台 guide/template                                | 使用对应 adapter/preset  | 平台约束强的 serverless/edge 部署    |

### 通用 Hono App

```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

export default app;
```

- 通用部分: `new Hono()`、`app.get()`、handler、middleware、`c.text()` 等核心 API;
- 变化部分: 最后一行如何导出或启动, 取决于 runtime;

### Cloudflare Workers Entry

```typescript
import { Hono } from "hono";

type Bindings = {
  API_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/token-name", (c) => {
  return c.text(typeof c.env.API_TOKEN);
});

export default app;
```

- Workers 默认入口: `export default app`;
- 需要其他 event handler: 可导出 `{ fetch: app.fetch, scheduled: async (...) => {} }`;
- Bindings: 环境变量、KV、R2、D1 等通过 `c.env` 访问, 用 `new Hono<{ Bindings: ... }>()` 获得类型;

### Node.js Entry

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Node.js!");
});

serve(app);
```

- Node.js 要点: Hono 最初不是为 Node.js 设计, 通过 `@hono/node-server` adapter 运行;
- Node 版本: 官方快照要求 Node.js 大版本为 18.14.1+、19.7.0+、20.0.0+;
- 原生 Node API: 需要时通过 `c.env.incoming` 和 `c.env.outgoing` 访问, 并声明 `HttpBindings`;

### Bun Entry

```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Bun!");
});

export default {
  port: 3000,
  fetch: app.fetch,
};
```

- Bun 要点: 可以直接运行 TypeScript, `export default app` 也可作为基础入口;
- 端口设置: 需要固定端口时导出 `{ port, fetch: app.fetch }`;

### Deno Entry

```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Deno!");
});

Deno.serve({ port: 8787 }, app.fetch);
```

- Deno 要点: 使用 `Deno.serve(app.fetch)` 或带 port 的重载;
- import 来源: Hono 可通过 npm 或 JSR 使用, middleware import 要按 Deno import map 配置;

### Adapter 判断

- 事实: Hono core 基于 Web Standards, 但 static files、WebSocket、raw platform API 等能力常由 runtime-specific module 或 adapter 提供;
- 判断: 新项目优先用 `create-hono` 选择目标 runtime template, 避免手写入口时漏掉平台要求;
- 约束: 如果服务依赖 Node-only SDK、文件系统、长生命周期进程, Node adapter 更直接; 如果目标是全球 edge API, Cloudflare Workers/Fastly/Deno Deploy 更契合;

## 项目结构

### 小型项目

```text
src/
├── index.ts        # runtime entry + app route, 适合 demo 或极小 API
└── index.test.ts   # app.request() 路由测试
```

- 小型项目: 允许把 app 和 routes 放在 `src/index.ts`, 便于学习;
- 拆分时机: route 数量增加、middleware 复用、schema 增加、service 逻辑变重时再拆;

### 中型项目

```text
src/
├── app.ts                    # Hono app 装配: middleware, route, notFound, onError
├── index.ts                  # runtime entry: export default app / serve(app) / Deno.serve(...)
├── routes/
│   ├── posts.ts              # posts 子路由, 导出 Hono app
│   └── users.ts              # users 子路由
├── middleware/
│   ├── auth.ts               # createMiddleware 封装认证变量
│   └── request-logger.ts     # 自定义日志或平台日志桥接
├── schemas/
│   └── posts.ts              # validator/zod schema
├── services/
│   └── posts-service.ts      # 业务逻辑, 尽量不依赖 Hono Context
└── tests/
    └── posts.test.ts         # app.request() 或 runtime-specific test
```

- `app.ts`: 只做 HTTP 装配, 不承载复杂业务计算;
- `index.ts`: 只做 runtime 启动或导出, 保持 adapter 代码集中;
- `routes/*`: 直接在 route path 后写 handler, 保留 path param 推断;
- `services/*`: 接收普通参数并返回普通数据, 降低 Hono 与业务逻辑耦合;
- `schemas/*`: 存放 request validation schema, 让 handler 只消费 validated data;

### 大型应用路由聚合

```typescript
import { Hono } from "hono";
import posts from "./routes/posts";
import users from "./routes/users";

const app = new Hono();

export const routes = app.route("/posts", posts).route("/users", users);

export default app;
```

- `app.route()`: 把子 Hono app 挂载到 path 前缀下;
- RPC 友好写法: 用链式 `export const routes = app.route(...).route(...)`, 再由预编译 client 计算 `hc<typeof routes>`;
- 顺序注意: 子路由要先注册完, 再 `app.route('/prefix', child)`, 否则可能挂载到空路由表;

## 最小可运行 API

### Create Hono

```shell
npm create hono@latest my-app
pnpm create hono@latest my-app
bun create hono@latest my-app
deno init --npm hono@latest my-app
```

- Starter template: 创建时选择目标 runtime, 如 `cloudflare-workers`、`nodejs`、`bun`、`deno`、`vercel`;
- 本地运行: 通常是 `npm run dev`、`pnpm dev`、`bun run dev`、`deno task start`, 具体以模板为准;

### Hello World

```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/api/hello", (c) => {
  return c.json({
    ok: true,
    message: "Hello Hono!",
  });
});

export default app;
```

- `new Hono()`: 创建应用实例;
- `app.get(path, handler)`: 注册 GET route;
- `c.text()`: 返回 `Content-Type: text/plain` 的 response;
- `c.json()`: 返回 `Content-Type: application/json` 的 response;
- `export default app`: 对 Workers/Bun/Vercel 等 Fetch-style runtime 常见;

## 路由 Routing

### 基础方法

| API                             | 用途                     | 示例                                           |
| ------------------------------- | ------------------------ | ---------------------------------------------- |
| `app.get(path, handler)`        | GET route                | `app.get('/users', handler)`                   |
| `app.post(path, handler)`       | POST route               | `app.post('/users', handler)`                  |
| `app.put(path, handler)`        | PUT route                | `app.put('/users/:id', handler)`               |
| `app.delete(path, handler)`     | DELETE route             | `app.delete('/users/:id', handler)`            |
| `app.all(path, handler)`        | 任意 HTTP method         | `app.all('/health', handler)`                  |
| `app.on(method, path, handler)` | 自定义或多个 method/path | `app.on(['PUT', 'DELETE'], '/posts', handler)` |
| `app.use(path?, middleware)`    | 注册 middleware          | `app.use('/api/*', cors())`                    |

### Path Param 与 Query

```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/posts/:id", (c) => {
  const id = c.req.param("id");
  const page = c.req.query("page") ?? "1";

  return c.json({
    id,
    page,
  });
});
```

- Path param: `:id` 会被 `c.req.param('id')` 读取;
- Query param: `/posts/1?page=2` 的 `page` 通过 `c.req.query('page')` 读取;
- 全量读取: `c.req.param()` 返回所有 path params, `c.req.query()` 返回所有 query params;

### 复杂路径

```typescript
const app = new Hono();

app.get("/files/*", (c) => c.text("wildcard"));
app.get("/api/animal/:type?", (c) => c.text("optional param"));
app.get("/posts/:date{[0-9]+}/:title{[a-z]+}", (c) => {
  const { date, title } = c.req.param();
  return c.json({ date, title });
});
app.get("/images/:filename{.+\\.png}", (c) => {
  return c.text(c.req.param("filename"));
});
```

- Wildcard: `*` 匹配一段不固定路径;
- Optional param: `:type?` 同时匹配有参和无参路径;
- RegExp param: `:date{[0-9]+}` 用正则限制匹配内容;
- 包含 slash: path param 需要吞掉 slash 时使用正则, 如 `:id{.+}`;

### 路由分组

```typescript
import { Hono } from "hono";

const books = new Hono();

books.get("/", (c) => c.json({ type: "list books" }));
books.post("/", (c) => c.json({ type: "create book" }, 201));
books.get("/:id", (c) => {
  return c.json({ id: c.req.param("id") });
});

const app = new Hono();

app.route("/books", books);

export default app;
```

- 子 app: 每个业务域可独立创建 `new Hono()`;
- 挂载路径: `app.route('/books', books)` 后, 子路由 `/` 实际变成 `/books`;
- 类型保留: RPC 项目中优先链式写法, 让 `typeof route` 捕获完整 schema;

### Base Path

```typescript
const api = new Hono().basePath("/api");

api.get("/books", (c) => {
  return c.text("GET /api/books");
});
```

- `basePath()`: 给当前 app 增加固定 path prefix;
- 适用场景: 多个 route 共享 `/api`、`/v1` 等前缀;

### 路由优先级

```typescript
const app = new Hono();

app.get("/books/a", (c) => c.text("a"));
app.get("/books/:slug", (c) => c.text(c.req.param("slug")));
app.get("*", (c) => c.text("fallback"));
```

- 注册顺序: handler 和 middleware 按注册顺序执行;
- 先命中先返回: 如果 `app.get('*')` 放在具体路由前, 具体路由可能永远不会执行;
- Fallback: 通配 fallback route 应放在更具体 route 后面;

### Strict Mode

- 默认 strict: `/hello` 和 `/hello/` 是不同 route;
- 宽松模式: `new Hono({ strict: false })` 可把两者视为相同;
- 判断建议: API 项目默认保持 strict, 避免 cache key、redirect、client SDK 出现歧义;

## Context、Request、Response

### Context `c`

- 生命周期: `Context` 每个 request 创建一次, response 返回后结束;
- 作用: 读取 `c.req`, 设置 status/header/body, 访问 `c.env`, 存取 request-scoped variables, 读取或替换 `c.res`;
- 类型参数: `new Hono<{ Bindings: ...; Variables: ... }>()` 给 `c.env`、`c.set()`、`c.get()`、`c.var` 提供类型;

### Response Helper

```typescript
app.get("/responses", (c) => {
  c.status(201);
  c.header("X-Message", "created");

  return c.json({
    ok: true,
  });
});

app.get("/plain", (c) => c.text("plain text"));
app.get("/html", (c) => c.html("<h1>Hello</h1>"));
app.get("/redirect", (c) => c.redirect("/", 302));
app.get("/raw", () => new Response("raw response"));
```

- `c.status(code)`: 设置 HTTP status, 默认 200;
- `c.header(name, value)`: 设置 response header;
- `c.body(body, status?, headers?)`: 返回通用 body response, text/html 优先用 `c.text()`/`c.html()`;
- `c.text()`: text/plain response;
- `c.json()`: application/json response, RPC 中建议显式写 status code;
- `c.html()`: text/html response;
- `c.redirect()`: 默认 302, 可传 301 等 status;
- Raw Response: 可直接 `return new Response(...)`;

### HonoRequest `c.req`

```typescript
app.post("/posts/:id", async (c) => {
  const id = c.req.param("id");
  const tags = c.req.queries("tag") ?? [];
  const userAgent = c.req.header("User-Agent");
  const body = await c.req.json();

  return c.json({
    id,
    tags,
    userAgent,
    body,
  });
});
```

- `c.req.param(name?)`: 读取 path params;
- `c.req.query(name?)`: 读取 query string 单值;
- `c.req.queries(name)`: 读取重复 query string, 如 `?tag=a&tag=b`;
- `c.req.header(name?)`: 读取 request header;
- `c.req.json()`: 解析 `application/json` body;
- `c.req.text()`: 解析 `text/plain` body;
- `c.req.parseBody()`: 解析 `multipart/form-data` 或 `application/x-www-form-urlencoded`;
- `c.req.formData()`/`blob()`/`arrayBuffer()`: 按 Web 标准类型解析 body;
- `c.req.valid(target)`: 读取 validator 产出的 validated data;
- `c.req.raw`: 原始 Web `Request`;

### Header 大小写

- 单个 header: `c.req.header('X-Foo')` 可按原始 header 名读取;
- 全量 header: `c.req.header()` 返回的 record key 全部为 lowercase;
- Validation header: `validator('header', ...)` 中也要用 lowercase key, 如 `idempotency-key`;

### Request-Scoped Variables

```typescript
import { Hono } from "hono";

type User = {
  id: string;
  name: string;
};

type Variables = {
  user: User;
};

const app = new Hono<{ Variables: Variables }>();

app.use("/auth/*", async (c, next) => {
  c.set("user", {
    id: "u1",
    name: "Ada",
  });
  await next();
});

app.get("/auth/me", (c) => {
  return c.json(c.var.user);
});
```

- `c.set()`/`c.get()`: 在同一个 request 内传递值;
- `c.var`: 读取 variables 的便捷属性形式;
- 不跨请求: `c.set()` 保存的数据不会持久化到下一次 request;
- Global augmentation 风险: `ContextVariableMap` 会全局声明变量类型, 只适合 app-wide 且必定执行的 middleware, 否则会掩盖 runtime `undefined`;

### Env 与平台能力

- `c.env`: runtime 注入的 bindings 或 adapter bindings;
- Cloudflare: 环境变量、secrets、KV、D1、R2 等通过 `c.env.KEY` 访问;
- Node.js: raw Node API 可通过 `c.env.incoming`、`c.env.outgoing` 访问, 需要 `@hono/node-server` bindings 类型;
- `c.executionCtx`: Cloudflare Workers 的 `ExecutionContext`, 可用 `waitUntil()` 执行后台任务;

## 中间件 Middleware

### Middleware 本质

- Handler: 最终返回 `Response`, 一个 request 只会由一个最终 handler 产生响应;
- Middleware: 在 handler 前后执行, 必须 `await next()` 放行, 或直接返回 `Response` 提前结束;
- 注册方式: `app.use()`, 或作为 `app.get()`/`app.post()` 等 route 参数;
- 顺序规则: 注册顺序决定执行顺序, `next()` 前是正序, `next()` 后是逆序;

```typescript
app.use(async (c, next) => {
  console.log("middleware 1 start");
  await next();
  console.log("middleware 1 end");
});

app.use(async (c, next) => {
  console.log("middleware 2 start");
  await next();
  console.log("middleware 2 end");
});

app.get("/", (c) => {
  console.log("handler");
  return c.text("Hello");
});
```

```text
middleware 1 start
middleware 2 start
handler
middleware 2 end
middleware 1 end
```

- 异常传播: Hono 会捕获 handler/middleware 抛出的错误并交给 `app.onError()` 或默认 500, `next()` 本身不需要被 try/catch 包裹;
- Response 修改: `await next()` 后可通过 `c.header()` 或 `c.res` 修改下游 response;

### 内置 Middleware

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());
app.use(
  "/api/*",
  cors({
    origin: "https://example.com",
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});
```

- `logger()`: 记录 request method、path、response status、耗时等信息;
- `cors()`: 设置 CORS headers, 应在 route 前注册;
- CORS `origin`: 默认 `*`, 可传 string、string array 或 `(origin, c) => string`;
- CORS `allowMethods`: 默认包含 `GET`、`HEAD`、`PUT`、`POST`、`DELETE`、`PATCH`, 可传函数按 origin 动态决定;
- CORS `allowHeaders`/`exposeHeaders`/`maxAge`/`credentials`: 控制预检、暴露 header、缓存和 cookie 凭证;

### JWT Middleware

```typescript
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import type { JwtVariables } from "hono/jwt";

type Variables = JwtVariables;

const app = new Hono<{ Variables: Variables }>();

app.use(
  "/auth/*",
  jwt({
    secret: "it-is-very-secret",
    alg: "HS256",
  }),
);

app.get("/auth/page", (c) => {
  const payload = c.get("jwtPayload");
  return c.json(payload);
});
```

- Import path: `jwt` 来自 `hono/jwt`;
- Header 默认: 未设置 `cookie` option 时读取 `Authorization` header;
- Scheme 必需: 客户端 header 需要类似 `Bearer my.token.value` 或 `Basic my.token.value`;
- 必填选项: `secret` 和 `alg`;
- 支持算法: `HS256`、`HS384`、`HS512`、`RS256`、`RS384`、`RS512`、`PS256`、`PS384`、`PS512`、`ES256`、`ES384`、`ES512`、`EdDSA`;
- 环境变量: `secret` 来自 `c.env.JWT_SECRET` 时, 在 wrapper middleware 内创建 `jwt(...)` 并返回调用结果;

```typescript
app.use("/auth/*", (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
    alg: "HS256",
  });

  return jwtMiddleware(c, next);
});
```

### 自定义 Middleware

```typescript
import { createMiddleware } from "hono/factory";

type Variables = {
  requestId: string;
};

const requestIdMiddleware = createMiddleware<{
  Variables: Variables;
}>(async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
  c.header("X-Request-Id", c.var.requestId);
});
```

- `createMiddleware()`: 分离 middleware 文件时保留 `Context` 和 `next` 类型;
- 类型累积: 链式 `.use()` 可让后续 handler 推断前面 middleware 设置的 `Variables`;
- 复用建议: 认证、request id、数据库 client、feature flag、observability 放 middleware; 业务计算放 service;

## 校验 Validation

### 为什么需要校验

- Runtime 边界: HTTP request 来自外部, TypeScript 编译期类型不能证明 runtime data 正确;
- 安全边界: path/query/header/body/cookie 都需要视为不可信输入;
- 类型桥梁: Validator 把 unknown input 变成 handler 可使用的 typed validated data;
- RPC 前提: Hono RPC 依赖 validator input 和 `c.json()` output 推断 client 类型;

### Manual Validator

```typescript
import { Hono } from "hono";
import { validator } from "hono/validator";

const app = new Hono();

app.post(
  "/posts",
  validator("json", (value, c) => {
    const title = value["title"];

    if (!title || typeof title !== "string") {
      return c.json({ error: "title is required" }, 400);
    }

    return {
      title,
    };
  }),
  (c) => {
    const data = c.req.valid("json");
    return c.json({ ok: true, title: data.title }, 201);
  },
);
```

- Import path: `validator` 来自 `hono/validator`;
- 使用方式: validator 是 middleware, 放在 handler 前;
- 成功返回: callback 返回 validated data;
- 失败返回: callback 可直接返回 `Response`, request 提前结束;
- 读取结果: handler 中用 `c.req.valid('json')`;

### Validation Targets

| Target   | 数据来源          | 常见用途                   |
| -------- | ----------------- | -------------------------- |
| `json`   | JSON request body | API create/update          |
| `form`   | form body         | HTML form、file upload     |
| `query`  | query string      | pagination、filter         |
| `param`  | path params       | resource id                |
| `header` | request headers   | idempotency key、signature |
| `cookie` | cookies           | session token              |

### Content-Type 与 Header 陷阱

- JSON/form 校验: request 必须带匹配的 `Content-Type`, 如 `application/json`, 否则 validator callback 可能收到 `{}`;
- 测试请求: `app.request()` 发送 JSON body 时也必须设置 `Content-Type`;
- Header 校验: `validator('header', ...)` 内使用 lowercase key, 如 `value['idempotency-key']`;

```typescript
const res = await app.request("/posts", {
  method: "POST",
  body: JSON.stringify({ title: "Hello" }),
  headers: new Headers({
    "Content-Type": "application/json",
  }),
});
```

### Zod Validator

```typescript
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";

const createPostSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const route = app.post("/posts", zValidator("json", createPostSchema), (c) => {
  const data = c.req.valid("json");
  return c.json(
    {
      ok: true,
      title: data.title,
    },
    201,
  );
});

export type CreatePostRoute = typeof route;
```

- 官方建议: Hono core validator 很薄, 复杂校验推荐结合第三方 validator;
- `@hono/zod-validator`: Hono 生态常用 Zod middleware;
- Standard Schema: `@hono/standard-validator` 可接入 Zod、Valibot、ArkType 等 Standard Schema-compatible validator;
- 多个 validator: 可连续校验 `param`、`query`、`json`, handler 中分别 `c.req.valid(target)`;

## 错误处理

### Not Found

```typescript
const app = new Hono();

app.notFound((c) => {
  return c.json({ error: "not found" }, 404);
});
```

- `app.notFound()`: 自定义 404 response;
- 作用范围: 官方快照提示 `notFound` 只从 top-level app 调用;
- RPC 注意: 如果想让 client 正确推断 404 body, route 内优先 `return c.json({ error: 'not found' }, 404)`, 不要依赖 `c.notFound()`;

### onError

```typescript
import { HTTPException } from "hono/http-exception";

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  console.error(err);
  return c.json({ error: "internal server error" }, 500);
});
```

- `app.onError()`: 捕获未处理异常并返回自定义 response;
- 优先级: parent app 和 route 都有 `onError` 时, route-level handler 优先;
- 生产建议: 未知错误记录日志, 对客户端返回稳定错误结构, 不泄露内部 stack;

### HTTPException

```typescript
import { HTTPException } from "hono/http-exception";

app.post("/login", async (c) => {
  const ok = false;

  if (!ok) {
    throw new HTTPException(401, {
      message: "Unauthorized",
      cause: {
        reason: "invalid password",
      },
    });
  }

  return c.redirect("/");
});
```

- `HTTPException`: Hono custom `Error`, 用 status + message/custom response 描述可预期 HTTP 错误;
- `cause`: 可携带调试信息, 不应直接暴露给外部 client;
- `getResponse()`: 基于 error status/message/custom response 生成新 `Response`;
- 边界: `HTTPException.getResponse()` 不感知当前 `Context`, 已设置在 `Context` 上的 headers 需要手动合并到新 response;

### 错误响应形状

```typescript
type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};
```

- 统一结构: 保持 `error.code` 供 client 分支处理, `error.message` 供展示或日志;
- 显式 status: `400`、`401`、`403`、`404`、`409`、`422`、`500` 等不要混用;
- RPC 友好: route 内对业务错误显式 `c.json(errorBody, status)`, 让 client 可按 `res.status` 收窄类型;

## Hono RPC

### 大型 RPC 心智模型

- Hono RPC: server 导出 route 类型, client 用该类型生成 typed client, 从而推断 request input 与 response output;
- 类型来源: Validator 提供 request 类型, handler 的 `c.json(body, status)` 提供 response body 与 status 类型;
- 大型应用重点: 子路由必须链式声明并在顶层 `route()` 后导出最终 `typeof routes`;
- 性能重点: route 很多时不在业务代码里反复 `hc<typeof routes>()`, 而是在预编译文件中导出 `hcWithType`;
- Monorepo 要求: client/server 都开启 `compilerOptions.strict`, Hono 版本保持一致, frontend 依赖 API/shared package 的编译产物;

### Server Routes

- 链式子路由: 子 app 内也用链式 `.get().post()` 保留类型;
- Validator: `zValidator('query' | 'json', schema)` 决定 client 的 query/json input 类型;
- 显式 status: `c.json(body, 200/201/404)` 决定 client 的 response body 与 status union;
- Typed 404: route 内返回 `c.json({ error }, 404)` 优于 `c.notFound()`, client 更容易推断错误 body;
- 顶层导出: 导出已注册子路由的 `routes` value, 供预编译 client 计算完整 RPC 类型;

```typescript
// routes/authors.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";

const authors = new Hono()
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        page: z.string().optional(),
      }),
    ),
    (c) => {
      const query = c.req.valid("query");
      return c.json({ authors: [], page: query.page ?? "1" }, 200);
    },
  )
  .get("/:id", (c) => {
    const id = c.req.param("id");

    if (id === "missing") {
      return c.json({ error: "author not found" }, 404);
    }

    return c.json({ author: { id, name: "Ada" } }, 200);
  })
  .post(
    "/",
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
      }),
    ),
    (c) => {
      const data = c.req.valid("json");
      return c.json({ author: { id: "1", name: data.name } }, 201);
    },
  );

export default authors;
```

```typescript
// routes/books.ts
import { Hono } from "hono";

const books = new Hono()
  .get("/", (c) => c.json({ books: [] }, 200))
  .post("/", (c) => c.json({ ok: true }, 201));

export default books;
```

```typescript
// app.ts
import { Hono } from "hono";
import authors from "./routes/authors";
import books from "./routes/books";

const app = new Hono();

export const routes = app.route("/authors", authors).route("/books", books);

export default app;
```

### 预编译 Typed Client

- 核心问题: `hc<typeof routes>()` 会触发大量 type instantiation, route 越多, IDE `tsserver` 越慢;
- 预编译思路: 在 server 或 shared client package 中创建 `hcWithType`, 让 `tsc` 在构建阶段提前计算 client type;
- 前端用法: frontend 只 import 编译后的 `hcWithType`, 不在业务文件里反复写 `hc<typeof routes>()`;
- Monorepo 边界: server package 应启用 TypeScript project references 或独立 build, frontend 依赖其产物和 `.d.ts`;

```typescript
// rpc-client.ts
import { hc } from "hono/client";
import { routes } from "./app";

export type RpcClient = ReturnType<typeof hc<typeof routes>>;

export const hcWithType = (...args: Parameters<typeof hc>): RpcClient => {
  return hc<typeof routes>(...args);
};
```

- `routes` value import: 让 `tsc` 编译 `rpc-client.ts` 时能计算完整 route client 类型;
- `RpcClient`: 保存 `hc<typeof routes>` 的返回类型, 业务侧复用这个已计算类型;
- `hcWithType`: 运行时仍调用 Hono 官方 `hc`, 只是把重型类型推断集中到一个预编译文件;
- 业务侧限制: 不直接 import `routes` 或重新调用 `hc<typeof routes>`, 否则 IDE 仍会在业务项目里重复实例化类型;
- 构建顺序: 先 build API/shared package, 再启动或 typecheck frontend;

### Client Usage

```typescript
// web/api-client.ts
import { hcWithType } from "@acme/api/rpc-client";

export const apiClient = hcWithType("http://localhost:8787/", {
  init: {
    credentials: "include",
  },
});
```

```typescript
// web/authors.ts
import type { InferRequestType, InferResponseType } from "hono/client";
import { apiClient } from "./api-client";

const $createAuthor = apiClient.authors.$post;

type CreateAuthorJson = InferRequestType<typeof $createAuthor>["json"];
type CreateAuthorResponse = InferResponseType<typeof $createAuthor, 201>;

const input: CreateAuthorJson = { name: "Grace" };

const createdRes = await $createAuthor({ json: input });

if (createdRes.status === 201) {
  const data: CreateAuthorResponse = await createdRes.json();
  console.log(data.author.name);
}

const detailRes = await apiClient.authors[":id"].$get({
  param: {
    id: "missing",
  },
});

if (detailRes.status === 404) {
  const data = await detailRes.json();
  console.log(data.error);
}

const listRes = await apiClient.authors.$get({
  query: {
    page: "1",
  },
});

if (listRes.ok) {
  const data = await listRes.json();
  console.log(data.authors);
}
```

- 调用形态: `apiClient.authors.$get()` 对应 `GET /authors`, `apiClient.authors[':id'].$get()` 对应 `GET /authors/:id`;
- Request 推断: `InferRequestType<typeof method>` 可提取 `json/form/query/param` 的输入类型;
- Response 推断: `InferResponseType<typeof method, 201>` 可提取指定 status 的 response body;
- Response 处理: 返回值兼容 Fetch `Response`, 用 `res.ok`、`res.status`、`res.json()` 分支处理;
- Cookies: `hcWithType(baseUrl, { init: { credentials: 'include' } })` 可让所有请求带 cookie;
- Headers: 通用 header 可放在 client 初始化, 单次请求 header 可放在具体 method 参数中;
- Slash 参数: `hc` 不会自动 URL-encode `param`, param 值含 slash 时自行 `encodeURIComponent` 或使用 regexp route;

### 大型 RPC 边界

- 类型保真: Validator 和 `c.req.valid()` 是 request 类型推断的关键, 只读 `c.req.json()` 会丢失校验类型;
- 导出对象: 导出最终 `routes` 的类型, 不导出尚未注册子路由的空 `app` 类型;
- IDE 性能: route 数量多时优先预编译 `hcWithType`, 其次拆分 client, 最后才考虑手写部分 type argument;
- 版本一致: frontend/backend Hono version mismatch 可能导致类型过深或不兼容;
- Project references: backend 与 frontend 分包时, 用 TypeScript project references 或显式 build 产物连接类型边界;
- Global errors: `app.onError()` 或全局 middleware 的 response 不会自动进入每条 RPC response type, 需要额外类型辅助时再引入 `ApplyGlobalResponse`;

## 测试 Testing

### app.request()

```typescript
import { describe, expect, test } from "vitest";
import app from "../src/app";

describe("posts API", () => {
  test("GET /posts returns text", async () => {
    const res = await app.request("/posts");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Many posts");
  });

  test("POST /posts returns json", async () => {
    const res = await app.request("/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Hello" }),
      headers: new Headers({
        "Content-Type": "application/json",
      }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      message: "Created",
    });
  });
});
```

- `app.request(path, options?)`: 直接向 Hono app 发请求, 返回 Web `Response`;
- URL 或 pathname: 可以传 `/posts`, 也可以传完整 URL;
- Request object: 也可以传 `new Request('http://localhost/posts', { method: 'POST' })`;
- JSON 测试: body 是 JSON 字符串时, 记得设置 `Content-Type: application/json`;
- Form 测试: 可传 `FormData` 作为 body;

### Env Mock

```typescript
const mockEnv = {
  API_HOST: "https://example.com",
  JWT_SECRET: "test-secret",
};

const res = await app.request("/auth/me", {}, mockEnv);
```

- 第三个参数: `app.request(path, options, env)` 可给 `c.env` 注入 mock;
- 适用场景: Cloudflare Workers bindings、secrets、database binding、service binding 的轻量 mock;
- Runtime-specific tests: Cloudflare Workers 官方推荐 `@cloudflare/vitest-pool-workers`, Bun 可用 `bun:test`, Deno 可用 `Deno.test`;

### 测试分层

| 层级                | 测什么                                                  | 工具                             |
| ------------------- | ------------------------------------------------------- | -------------------------------- |
| Route test          | method/path/status/body/header                          | `app.request()`                  |
| Middleware test     | header、auth、early response、`c.var`                   | `app.request()` + mock env       |
| Service test        | 纯业务逻辑                                              | 普通 unit test                   |
| Runtime integration | Workers bindings、Node adapter、static files、WebSocket | runtime-specific test/dev server |

## 部署选择

### 决策顺序

- 先定硬约束: 是否必须用某个平台、是否依赖 Node-only SDK、是否需要 edge、是否需要 WebSocket/static files、是否有数据库位置限制;
- 再定 runtime: 根据硬约束选择 Cloudflare Workers、Node.js、Bun、Deno、Vercel 等;
- 再定 adapter: 只有 runtime 需要 adapter 或 helper 时才引入, 如 Node.js 使用 `@hono/node-server`;
- 最后定项目结构: app logic 与 runtime entry 拆开, 便于迁移和测试;

### 场景建议

| 约束                         | 优先选择                              | 原因                           |
| ---------------------------- | ------------------------------------- | ------------------------------ |
| 全球低延迟 API               | Cloudflare Workers/Fastly/Deno Deploy | Edge runtime 更贴近用户        |
| 依赖 Node SDK 或本地文件系统 | Node.js                               | Node ecosystem 和 adapter 支持 |
| 与 Vercel frontend 同部署    | Vercel template                       | 路由和部署体验统一             |
| 想用 Bun runtime             | Bun template                          | TypeScript 运行和本地开发简单  |
| 想用 Deno Deploy 或 JSR      | Deno template                         | Deno.serve 和 Deno Deploy 对齐 |
| 不确定                       | `create-hono` template                | 先用官方模板拿到正确入口       |

### 部署前检查

- Entry point: 当前 runtime 是否要求 `export default app`、`app.fetch`、`serve(app)` 或 `Deno.serve(app.fetch)`;
- Env typing: secrets/bindings 是否用 `Bindings` 类型声明;
- CORS: browser client 是否需要跨域, CORS middleware 是否在 route 前;
- Error body: 是否统一错误结构, 生产环境是否避免泄露 stack;
- Tests: 至少覆盖 health route、核心 route、validation 失败、auth 失败、not found、unexpected error;
- Runtime docs: static files、WebSocket、binary body、streaming 等平台能力必须查对应 runtime guide;

## 常见误区

### Express 心智模型

- 误区: 在 Hono handler 中寻找 `req`/`res` 参数并调用 `res.send()`;
- 正解: Hono handler 接收 `Context c`, 返回 `c.text()`、`c.json()`、`c.html()` 或 raw `Response`;

### Middleware 顺序

- 误区: 把 `app.get('*')` fallback 或 auth route 放在更具体 route 前;
- 正解: middleware 和 handler 按注册顺序执行, fallback 放最后, CORS/logger/auth 放需要保护的 route 前;

### route() 顺序

- 误区: `app.route('/two', two)` 后才给 `two` 添加子路由;
- 正解: 先在 child app 上注册 route, 再挂载到 parent app;

### JSON Validation 缺少 Content-Type

- 误区: 测试里只传 `body: JSON.stringify(...)`, 不传 `Content-Type`;
- 正解: `validator('json', ...)` 需要 `Content-Type: application/json`, 否则可能收到空对象;

### Header Key 大小写

- 误区: `const headers = c.req.header(); headers['X-Foo']`;
- 正解: 全量 header record 的 key 是 lowercase, 单个 header 用 `c.req.header('X-Foo')`, validator header 用 lowercase key;

### c.set() 跨请求持久化

- 误区: 把 `c.set()` 当全局 store;
- 正解: `c.set()`/`c.get()` 只在当前 request 生命周期内有效;

### ContextVariableMap 滥用

- 误区: 全局扩展变量类型, 但 middleware 只在部分 route 上注册;
- 正解: 只在 app-wide middleware 确保变量必定存在时使用全局扩展, 否则用 `Variables` generic 或链式 middleware 推断;

### RPC 类型丢失

- 误区: 大型 app 中导出没有链式捕获 routes 的 `typeof app`;
- 正解: `export const routes = app.route(...).route(...)`, 然后在预编译 client 中集中创建 `hcWithType`;

### RPC Not Found

- 误区: route 内 `return c.notFound()` 后期待 client 推断 404 body;
- 正解: route 内显式 `return c.json({ error: 'not found' }, 404)`;

### Path Param 含 Slash

- 误区: `hc` 传 `param: { id: 'a/b' }` 期待普通 `:id` 匹配;
- 正解: 普通 param 不匹配 slash, 需要 encode 或 route 使用正则如 `:id{.+}`;

### JWT Authorization Scheme

- 误区: 只传 token 值, 如 `Authorization: my.token`;
- 正解: 传带 scheme 的值, 如 `Authorization: Bearer my.token`;

### Node Static Root

- 误区: Node `serveStatic({ root: './' })` 以源码文件所在目录解析;
- 正解: `root` 相对 `process.cwd()` 解析, 需要稳定路径时用 `import.meta.url` 转换;

### HEAD Handler

- 误区: 使用 `app.head('/api/users', ...)` 期待单独 HEAD handler 执行;
- 正解: Hono 会把 HEAD 转为 GET 并移除 body, HEAD-specific 逻辑用 middleware 或设计独立 endpoint;

### app.fire()

- 误区: 新项目使用 `app.fire()` 作为 Service Worker 入口;
- 正解: 官方快照标记 `app.fire()` deprecated, 使用 `hono/service-worker` 的 `fire()`;

## 学习路径

### 第 1 阶段: Web Standards

- 学习目标: 能解释 `Request`、`Response`、`Headers`、`URL`、`FormData`;
- 练习: 写一个 handler 直接 `return new Response('ok', { status: 200 })`;
- 验证: 用 `app.request('/')` 获取 response 并断言 status/body;

### 第 2 阶段: Hono Core

- 学习目标: 掌握 `new Hono()`、`app.get/post`、`c.text()`、`c.json()`、`c.req.param()`、`c.req.query()`;
- 练习: 实现 `/posts/:id?page=1`;
- 验证: 测试 path param 和 query 返回值;

### 第 3 阶段: Middleware

- 学习目标: 理解 `await next()` 前后顺序、early return、response 修改;
- 练习: 写 request id middleware, 给 response 加 `X-Request-Id`;
- 验证: route test 检查 header 存在;

### 第 4 阶段: Validation

- 学习目标: 理解 HTTP input 不可信, 使用 `validator` 或 `zValidator`;
- 练习: 实现 POST `/posts`, 校验 title/body;
- 验证: 测试成功 201、缺字段 400、缺 `Content-Type` 的失败行为;

### 第 5 阶段: Error Handling

- 学习目标: 掌握 `app.notFound()`、`app.onError()`、`HTTPException`;
- 练习: 登录失败抛 `HTTPException(401)`, 未知错误返回统一 500;
- 验证: 测试 401 body 和 500 body;

### 第 6 阶段: RPC

- 学习目标: 掌握链式 `routes` 导出、预编译 `hcWithType`、`InferRequestType`、`InferResponseType`;
- 练习: 给 `/authors` 和 `/books` 创建大型应用 typed client;
- 验证: 在 client 端故意传错字段, 观察 TypeScript 报错;

### 第 7 阶段: Runtime 与部署

- 学习目标: 区分 app logic、runtime entry、adapter/helper;
- 练习: 同一个 app 分别写 Workers entry 和 Node entry;
- 验证: route test 不依赖 runtime entry, runtime integration test 单独覆盖启动行为;

## 快速复习清单

- Hono app: `const app = new Hono()`;
- Route: `app.get('/path', (c) => c.text('ok'))`;
- JSON: `return c.json({ ok: true }, 200)`;
- Path param: `c.req.param('id')`;
- Query: `c.req.query('page')`;
- Header: `c.req.header('User-Agent')`;
- Body JSON: `await c.req.json()`;
- Form body: `await c.req.parseBody()`;
- Validated data: `c.req.valid('json')`;
- Request variables: `c.set('key', value)` + `c.get('key')` or `c.var.key`;
- Env bindings: `c.env.MY_KEY`;
- Middleware: `app.use(async (c, next) => { await next() })`;
- CORS: `import { cors } from 'hono/cors'`;
- Logger: `import { logger } from 'hono/logger'`;
- JWT: `import { jwt } from 'hono/jwt'`;
- Error: `app.onError((err, c) => c.json({ error: 'internal' }, 500))`;
- HTTPException: `throw new HTTPException(401, { message: 'Unauthorized' })`;
- Test: `const res = await app.request('/path')`;
- RPC client: `const client = hcWithType('http://localhost:8787/')`;
- Node adapter: `import { serve } from '@hono/node-server'`;
- Workers entry: `export default app`;
- Bun entry: `export default { port: 3000, fetch: app.fetch }`;
- Deno entry: `Deno.serve(app.fetch)`;
