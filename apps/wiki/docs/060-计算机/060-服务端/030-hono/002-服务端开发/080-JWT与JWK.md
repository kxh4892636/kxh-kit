---
id: 6ec94d62-78c0-42cb-af1b-af8f9aa20fa6
---

# JWT 与 JWK

## JWT 怎么签发和校验？

```ts
import { sign, verify, decode } from "hono/jwt";

// 签发
const token = await sign(
  { sub: "user123", role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 },
  process.env.JWT_SECRET!,
);

// 手动校验（自定义头、cookie、多来源）
const payload = await verify(token, secret, "HS256", issuer, audience);

// 只看内容，不验签（调试用）
const { header, payload } = decode(token);
```

- 默认算法 `HS256`；支持 HS/RS/PS/ES 系列与 `EdDSA`;
- 自动校验 `exp`、`nbf`、`iat`（存在才校验），`iss`/`aud` 需显式传参;
- 注意 `decode()` 不做任何校验，绝不能拿它的结果做鉴权;

## 用中间件保护一组路由怎么写？

```ts
import { jwt, type JwtVariables } from "hono/jwt";

const app = new Hono<{ Variables: JwtVariables }>();

app.use("/auth/*", jwt({ secret: process.env.JWT_SECRET!, alg: "HS256" }));

app.get("/auth/me", (c) => c.json(c.get("jwtPayload")));

// secret 来自环境变量时，包一层拿 c
app.use("/v2/*", (c, next) => jwt({ secret: c.env.JWT_SECRET, alg: "HS256" })(c, next));

// 从 cookie 取 token
app.use("/web/*", jwt({ secret, alg: "HS256", cookie: "token" }));
```

- 成功后 payload 放在 `c.get('jwtPayload')`，类型用 `JwtVariables`;
- 需要校验发行方/受众时传 `verification: { iss, aud }`;
- 401 时返回 `WWW-Authenticate` 质询，`realm` 默认是请求 URL;

## 用公钥（JWK）验证 RS256 令牌怎么写？

```ts
import { jwk } from "hono/jwk";

app.use(
  "/api/*",
  jwk({
    jwks_uri: "https://auth.example.com/.well-known/jwks.json",
    alg: ["RS256"],
    verification: { iss: "https://auth.example.com", aud: "my-api" },
  }),
);
```

- 适用: 令牌由独立认证服务用私钥签发，本服务只持有公钥;
- `jwk()` 要求 JWT 头带 `kid` 并拒绝 HS 系列算法，只接受不对称算法;
- 公钥列表支持 `keys` 直接给，或 `jwks_uri` 远程拉取（可传函数按请求决定）;
- 对称密钥用 `hono/jwt`（HS256），非对称验签用 `hono/jwk`;
