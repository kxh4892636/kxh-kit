---
id: 04de19cd-65c7-4751-a7bf-24e5c065c61c
---

# Cookie 与状态管理

## HTTP 为什么是无状态的, 又怎样维持状态？

- 无状态: HTTP 不保存请求与响应之间的通信状态, 减少服务端开销;
- 代价: 服务端无法把两次请求关联到同一个用户;
- 状态管理: 由 Cookie 承担;

## Cookie 的完整流程是怎样的？

- 服务端生成 Cookie, 在响应报文中通过 `Set-Cookie` 下发;
- 客户端保存后, 后续请求自动通过 `Cookie` 首部回传;
- 服务端据此恢复通信状态;

```bash
Set-Cookie: status=enable; expires=Tue, 05 Jul 2011 07:26:31 GMT; path=/; domain=.hackr.jp;
Cookie: status=enable
```

![Cookie 状态管理](../images/2024-01-15-19-13-16.png)

## 请求自动携带 Cookie 的条件是什么？

- `domain` 相同;
- 协议相同, 或 Cookie 未设置 `secure`;
- 请求 URL 落在 Cookie 的 `path` 及其子路径内;

## 跨域请求怎样携带 Cookie？

- 客户端: 设置 `withCredentials: true`;
- 服务端:
  - `Access-Control-Allow-Origin` 必须为具体来源, 不能是 `*`;
  - 返回 `Access-Control-Allow-Credentials: true`;
- 限制跨站携带的安全属性见 [浏览器与服务器安全措施](../090-Web安全/070-浏览器与服务器安全措施.md);
