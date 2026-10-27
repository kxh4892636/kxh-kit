---
id: 2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f
---

# 签名 Cookie 与会话

## 签名 Cookie 有什么用，怎么用？

```ts
import { setSignedCookie, getSignedCookie, generateSignedCookie } from "hono/cookie";

await setSignedCookie(c, "uid", "42", process.env.COOKIE_SECRET!);
const uid = await getSignedCookie(c, process.env.COOKIE_SECRET!, "uid");
```

- 签名用 HMAC-SHA256，防客户端篡改；**不加密**内容，敏感数据别放进去;
- 因为是 WebCrypto，读写签名 Cookie 都是 `async`;
- 返回值有三种语义：

| 返回        | 含义                                   |
| ----------- | -------------------------------------- |
| 字符串      | 验证通过                               |
| `false`     | 有签名但校验失败（被篡改）             |
| `undefined` | 没有这个 Cookie，或格式不是签名 Cookie |

- 两者都是假值，所以 `if (!value)` 能同时兜住；要区分「被篡改」和「没有」时才分别判断;

## 只生成 Cookie 字符串而不写响应头怎么办？

```ts
const cookie = generateCookie("theme", "dark", { path: "/", secure: true });
const signed = await generateSignedCookie("uid", "42", secret, { httpOnly: true });

c.header("Set-Cookie", cookie); // 自己决定何时设置、设置几个
```

- 适用场景: 一次响应要 Set 多个 Cookie、或在非 Handler 位置预生成;
- 注意 `generate*` 只返回字符串，不会自动加到响应里;

## Session 该怎么做？

| 方案              | 存什么                       | 优点                   | 缺点           |
| ----------------- | ---------------------------- | ---------------------- | -------------- |
| 无状态 Cookie/JWT | 用户标识 + 签名              | 无需存储、易水平扩展   | 无法立刻失效   |
| 有状态 session    | 随机 sessionId，数据在 Redis | 可立刻登出、可集中管控 | 需要存储与清理 |

- Hono 不自带 session 存储，两种做法都要自己接;
- 有状态方案里 Cookie 只放不透明的 sessionId，`deleteCookie` + 删 Redis 即登出;
- 后台管理与权限敏感接口优先选有状态方案;
- JWT 方案见 [JWT 与 JWK](./080-JWT与JWK.md)。
