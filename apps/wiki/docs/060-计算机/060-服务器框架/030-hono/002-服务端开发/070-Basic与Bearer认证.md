---
id: 2f5a9646-967a-4a57-91d9-af98eda9c863
---

# Basic 与 Bearer 认证

## 认证方案怎么选？

| 场景                     | 方案                         | 中间件                                  |
| ------------------------ | ---------------------------- | --------------------------------------- |
| 内部工具、临时保护       | Basic Auth                   | `hono/basic-auth`                       |
| 服务间调用、固定 API Key | Bearer Token                 | `hono/bearer-auth`                      |
| 用户登录态、可携带声明   | JWT / JWK                    | 见 [JWT 与 JWK](./080-JWT与JWK.md)      |
| 浏览器会话               | 签名 Cookie + 服务端 session | 见 [Cookie 与会话](./160-Cookie读写.md) |

- 原则: 认证结果只写进 `Context`（`c.set('user', ...)`），业务 Handler 不再解析 token;

## Basic Auth 怎么用？

```ts
import { basicAuth } from "hono/basic-auth";

app.use("/admin/*", basicAuth({ username: "admin", password: "secret" }));

// 自己校验（密码哈希比对、查库）
app.use(
  "/admin/*",
  basicAuth({
    verifyUser: (username, password, c) => checkPassword(username, password),
  }),
);
```

- 明文 base64，只适合 HTTPS + 内部场景;
- 失败返回 401 + `WWW-Authenticate`，realm 默认 `Secure Area`;

## Bearer Token 怎么用？

```ts
import { bearerAuth } from "hono/bearer-auth";

app.use("/api/*", bearerAuth({ token: "honoiscool" }));

// 多 token：读接口宽松，写接口收紧
app.on(["POST", "PUT", "DELETE"], "/api/*", bearerAuth({ token: privilegedToken }));

// 动态校验
app.use(
  "/v2/*",
  bearerAuth({
    verifyToken: async (token, c) => token === (await loadTokenFromDb(c)),
  }),
);
```

- token 必须匹配 `/[A-Za-z0-9._~+/-]+=*/`，否则直接 400;
- 生产环境务必用 `verifyToken` + 哈希比较，避免把密钥写进代码;
- 需要按请求动态取密钥时，在中间件里构造：`(c, next) => bearerAuth({ token: c.env.TOKEN })(c, next)`;

## 失败响应能定制吗？

```ts
app.use(
  "/api/*",
  bearerAuth({
    token,
    noAuthenticationHeader: { message: "缺少凭证" },
    invalidToken: { message: "凭证无效" },
  }),
);
```

- 三个可定制点: `noAuthenticationHeader`、`invalidAuthenticationHeader`、`invalidToken`;
- 每个都可给 `wwwAuthenticateHeader` 与 `message`，也支持传函数按请求动态生成;
- 认证能力的完整清单（含 OAuth、OIDC 等第三方方案）见 [内置中间件速查](../090-按需查阅/010-内置中间件速查.md);
