---
id: 1113f3a2-3aef-43c1-9a8b-0e0165589e33
---

# Cookie 读写

## Cookie 怎么读写和删除？

```ts
import { setCookie, getCookie, deleteCookie } from "hono/cookie";

app.post("/login", (c) => {
  setCookie(c, "session", "abc123", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 3600,
  });
  return c.json({ ok: true });
});

app.get("/me", (c) => c.json({ session: getCookie(c, "session") }));
app.get("/cookies", (c) => c.json(getCookie(c))); // 全部 Cookie
app.post("/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.body(null, 204);
});
```

## 各个选项分别防什么？

| 选项                 | 作用                                       |
| -------------------- | ------------------------------------------ |
| `httpOnly`           | JS 读不到，防 XSS 窃取                     |
| `secure`             | 仅 HTTPS 传输                              |
| `sameSite`           | `Strict` / `Lax` / `None`，CSRF 第一道防线 |
| `maxAge` / `expires` | 过期策略，前者相对秒数、后者绝对时间       |
| `domain` / `path`    | 作用域，删除时要与设置时一致               |
| `priority`           | 浏览器淘汰优先级                           |
| `partitioned`        | CHIPS 分区 Cookie                          |

- 删除时必须带上与原设置相同的 `path`/`domain`，否则删不掉;
- `sameSite: 'None'` 时必须同时 `secure: true`，否则浏览器拒收;

## 前缀约束与校验规则是什么？

```ts
setCookie(c, "pref", "dark", { prefix: "secure" }); // __Secure- 前缀
setCookie(c, "sid", "abc", { prefix: "host" }); // __Host- 前缀

getCookie(c, "pref", "secure"); // 读取时也要声明前缀
```

- Hono 按 RFC6265bis / CHIPS 校验，以下情况会抛错：

| 违规                         | 报错原因   |
| ---------------------------- | ---------- |
| `__Secure-` 未设 `secure`    | 前缀要求   |
| `__Host-` 未设 `secure`      | 前缀要求   |
| `__Host-` 的 `path` 不是 `/` | 前缀要求   |
| `__Host-` 设了 `domain`      | 前缀禁止   |
| `maxAge` 超过 400 天         | 浏览器上限 |

- 前缀不是命名习惯，是浏览器强制的安全约束;
- 签名 Cookie 与会话方案见 [签名 Cookie 与会话](./165-签名Cookie与会话.md)。
