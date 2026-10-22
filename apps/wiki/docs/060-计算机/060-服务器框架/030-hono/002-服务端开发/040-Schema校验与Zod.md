---
id: 912b990b-8883-4e56-bc31-6695e22b1903
---

# Schema 校验与 Zod

## 为什么用 schema 库而不是手写 if？

- 手写 if 的代价: 类型要手写一遍、错误信息不统一、嵌套结构难维护;
- schema 库一次定义同时得到「运行时校验 + TS 类型 + 错误细节」;
- Hono 支持两类：专用于 Zod 的 `zValidator`，以及兼容任意 Standard Schema（Zod/Valibot/ArkType）的 `sValidator`;

## 用 Zod 怎么写？

```ts
import * as z from "zod";
import { zValidator } from "@hono/zod-validator";

const schema = z.object({
  title: z.string().min(1),
  body: z.string(),
  tags: z.array(z.string()).default([]),
});

app.post("/posts", zValidator("json", schema), (c) => {
  const data = c.req.valid("json"); // 已收窄为 schema 的类型
  return c.json({ ok: true, data }, 201);
});
```

- 查询参数都是字符串，数字用 `z.coerce.number()`;
- 校验失败默认返回 400，响应体含 Zod 的 issue 列表;

## Standard Schema 版本怎么用？

```ts
import { sValidator } from "@hono/standard-validator";
import * as v from "valibot";

const schema = v.object({ name: v.string(), age: v.number() });

app.post("/author", sValidator("json", schema), (c) => {
  const data = c.req.valid("json");
  return c.json({ ok: true, message: `${data.name} is ${data.age}` });
});
```

- 换库不需要换中间件，适合已有 Valibot/ArkType 代码库;
- Zod、Valibot、ArkType 产出的类型同样能透传给 RPC 客户端;

## 多个位置一起校验怎么写？

```ts
app.post(
  "/posts/:id",
  zValidator("param", z.object({ id: z.string() })),
  zValidator("query", z.object({ draft: z.coerce.boolean().optional() })),
  zValidator("json", schema),
  (c) => {
    const { id } = c.req.valid("param");
    return c.json({ ok: true, id });
  },
);
```

- 每个位置一个校验器，顺序无关;
- 每个校验器都会独立解析自己那一块，不会互相干扰;

## 校验结果如何影响类型安全客户端？

- `zValidator('json', schema)` 会让 `AppType` 里的请求体类型变成 schema 的输入类型;
- 客户端 `client.posts.$post({ json: {...} })` 因此获得补全与报错;
- 这条链路要求路由是链式注册的，见 [RPC 服务端准备](../090-按需查阅/060-RPC服务端准备.md);
