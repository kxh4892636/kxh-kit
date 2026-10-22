---
id: 7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d
---

# createFactory 统一 Env

## 如何用 `createFactory` 统一 Env 与初始化？

```ts
// factory.ts
type Env = {
  Variables: { db: Db };
};

export default createFactory<Env>({
  initApp: (app) => {
    app.use(async (c, next) => {
      c.set("db", createDb(process.env.DATABASE_URL!));
      await next();
    });
  },
});

// feature.ts
import factory from "./factory";
const app = factory.createApp();
app.get("/users", (c) => c.json(c.var.db.listUsers()));
```

- `createFactory<Env>()` 一处声明类型，`createApp()`、`createMiddleware()`、`createHandlers()` 全部继承;
- `initApp` 适合放「所有路由都要的装配」：注入数据库、加载配置、注册全局中间件;

## 为什么需要它？

```ts
// 不用 factory：Env 要写两遍，且容易写错
const app = new Hono<Env>();
const mw = createMiddleware<Env>(async (c, next) => {
  await next();
});
```

| 做法                                               | Env 声明次数 | 风险                     |
| -------------------------------------------------- | ------------ | ------------------------ |
| 直接 `new Hono<Env>()` + `createMiddleware<Env>()` | 2 次以上     | 两处不一致时类型静默失真 |
| `createFactory<Env>()`                             | 1 次         | 统一来源，改一次全生效   |

## `createApp()` 还能带哪些默认选项？

```ts
const factory = createFactory({
  defaultAppOptions: { strict: false },
});

const app = factory.createApp(); // strict: false 已生效
```

- 适合统一关闭尾斜杠严格模式、统一指定路由器等全局行为;
- 选项含义见 [路径匹配规则](../001-快速上手/060-路径匹配规则.md) 与 [路由器与预设](../003-上线/060-路由器与预设.md);

## 什么时候不需要 factory？

- 单文件小服务：直接 `new Hono()` 更直观;
- 只有一个中间件、没有 `Variables`：`createMiddleware` 足够;
- 团队规模上来、需要统一注入与类型时再引入，避免过度设计;
