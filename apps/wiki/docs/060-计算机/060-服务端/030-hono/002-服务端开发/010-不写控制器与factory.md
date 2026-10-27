---
id: 0963d646-568d-46df-a0d1-b336930c5f2b
anki: true
---

# 不写控制器与 factory

## 把 Handler 抽成独立函数会丢什么？

- 丢两样: `param('id')` 的字面量类型，和 `AppType` 推断；RPC 客户端与 `testClient` 都跟着失效;

```ts
import { Hono, type Context } from "hono";

const app = new Hono();

// 🙁 独立函数：param('id') 推不出字面量类型
const bookPermalink = (c: Context) => c.json(`get ${c.req.param("id")}`);
app.get("/books/:id", bookPermalink);

// 😃 就地写：param('id') 有字面量类型
app.get("/books/:id", (c) => c.json(`get ${c.req.param("id")}`));
```

- 根因: 路由类型靠 `app.get(path, handler)` 的链式泛型推导，Handler 抽成独立函数就断了类型链;

## createFactory 怎么把类型收到一处？

- 一处声明，全部继承: `createFactory<Env>({ initApp, defaultAppOptions })` 之后，`createApp()` / `createMiddleware()` / `createHandlers()` 共用同一 `Env`;

```ts
import { createFactory } from "hono/factory";
import { logger } from "hono/logger";
type Db = { listUsers: () => string[] };
const createDb = (_url: string): Db => ({ listUsers: () => ["alice"] });
type Env = { Bindings: { DATABASE_URL: string }; Variables: { userId: string; db: Db } };
const factory = createFactory<Env>({
  initApp: (app) => {
    app.use(async (c, next) => {
      c.set("db", createDb(c.env.DATABASE_URL));
      await next();
    });
  },
  defaultAppOptions: { strict: false },
});
const auth = factory.createMiddleware(async (c, next) => {
  c.set("userId", "1");
  await next();
});
const handlers = factory.createHandlers(logger(), auth, (c) =>
  c.json({ userId: c.var.userId, users: c.var.db.listUsers() }),
);
const app = factory.createApp().get("/api", ...handlers);
```

- `initApp` 放所有路由都要的装配：注入数据库、加载配置、注册全局中间件；`defaultAppOptions: { strict: false }` 统一关闭尾斜杠严格模式或指定路由器;
- `createHandlers(...)` 返回可展开的数组，中间件在前、Handler 最后；不用 factory 时要在 `new Hono<Env>()` + `createMiddleware<Env>()` 写两遍 `Env`，不一致会静默失真;
- `Bindings` 走 `c.env`（请求期间只读），`Variables` 走 `c.set`/`c.var`；只在 Node 跑可直接用 `process.env`，跨运行时用 `env<{ DATABASE_URL: string }>(c)`（`hono/adapter`，只能放在 handler 里）;

## 什么时候才该抽 Service？

- 抽的时机: 只有同一段逻辑被多个路由复用时才抽，且抽成 Service（只收普通对象，不收 `Context`），见 [分层与依赖方向](../../000-服务端知识/010-基础模型/020-分层与依赖方向/010-依赖方向.md);
- 必须保留独立 Handler 时用 `factory.createHandlers()`，不要用裸函数;
- 其余规则: `factory.createApp()` 仍要链式注册；导出类型时导出「链式赋值后的变量」，不要导出裸 `app`；单文件小服务、只有一个中间件且没有 `Variables` 时，直接 `new Hono()` 更直观;
- 相邻主题: 链式注册与 `AppType` 见 [路由与匹配](../001-快速上手/030-路由与匹配.md)；`Env` 泛型见 [类型与请求级变量](./030-类型与请求级变量.md)；RPC 服务端准备见 [hc 客户端与 AppType](../090-按需查阅/050-hc客户端.md);
