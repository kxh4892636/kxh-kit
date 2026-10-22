---
id: 5f819e4f-3c01-4054-88c2-e7f4546621fb
---

# 安全响应头与 CSRF

## 安全响应头中间件做了什么？

```ts
import { secureHeaders } from "hono/secure-headers";

app.use(secureHeaders());

// 关掉不需要的
app.use("*", secureHeaders({ xFrameOptions: false, xXssProtection: false }));

// 覆盖默认值
app.use(
  "*",
  secureHeaders({ strictTransportSecurity: "max-age=63072000; includeSubDomains; preload" }),
);
```

| 默认开启的头                   | 值                                    |
| ------------------------------ | ------------------------------------- |
| `X-Powered-By`                 | 删除                                  |
| `Strict-Transport-Security`    | `max-age=15552000; includeSubDomains` |
| `X-Content-Type-Options`       | `nosniff`                             |
| `X-Frame-Options`              | `SAMEORIGIN`                          |
| `Referrer-Policy`              | `no-referrer`                         |
| `Cross-Origin-Resource-Policy` | `same-origin`                         |
| `Permissions-Policy` / CSP     | 默认不设置，按需开启                  |

- 顺序敏感: 与 `poweredBy()` 同名头会互相覆盖，后执行的赢;
- CSP 与 `reportTo`/`reportingEndpoints` 用于上报违规，按项目需要开;

## CSRF 中间件校验什么？

```ts
import { csrf } from "hono/csrf";

app.use(csrf()); // 默认：同源
app.use(csrf({ origin: ["https://app.example.com"] }));
app.use(csrf({ secFetchSite: ["same-origin", "none"] }));
```

- 只校验「非安全方法（非 GET/HEAD/OPTIONS）+ 可被表单提交的 content-type」;
- 同时校验 `Origin` 与 `Sec-Fetch-Site`，任一通过即放行;
- 反向代理剥掉了 `Origin` 的环境需要显式配置 `origin` 或改用 token 方案;
- 动态判断时务必校验协议与结尾，不能只做前向匹配：

```ts
app.use("*", csrf({ origin: (origin) => /https:\/\/(\w+\.)?myapp\.example\.com$/.test(origin) }));
```

## 常见安全疏漏有哪些？

| 疏漏                                       | 后果                 | 修法                                                      |
| ------------------------------------------ | -------------------- | --------------------------------------------------------- |
| token 校验失败仍继续执行                   | 越权                 | 校验失败必须 `return c.json(..., 401)` 短路               |
| 只在前端校验权限                           | 直接调接口即绕过     | 每个写接口都在服务端校验角色                              |
| secret 写死在代码                          | 泄露即失守           | 走环境变量 + 启动时校验长度                               |
| CORS 设成 `origin: '*'` 又开 `credentials` | 浏览器拒绝或放宽过头 | 明确白名单，见 [CORS](./130-CORS.md)                      |
| 未限制请求体大小                           | 内存打满             | `bodyLimit`，见 [压缩体积与超时](./120-压缩体积与超时.md) |
| 错误详情直接返回客户端                     | 泄漏内部结构         | `onError` 里只回通用信息，细节进日志                      |
