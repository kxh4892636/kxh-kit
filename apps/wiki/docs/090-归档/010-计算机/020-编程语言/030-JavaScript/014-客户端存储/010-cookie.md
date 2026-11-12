---
id: 9f6187b8-ac80-4258-9a59-6546e154338f
---

# cookie

## cookie 的构成与限制是什么？

- 规格: 明文存储 HTTP 会话信息, 单个 cookie 至多约 4096 字节;
- 组成: 名称、值、域、路径、过期时间、有效时间、安全标志与 HTTP 标识;

| 字段       | 作用                     |
| ---------- | ------------------------ |
| `domain`   | 指定携带该 cookie 的域名 |
| `path`     | 指定携带该 cookie 的路径 |
| `expires`  | 过期时间, 到点删除       |
| `max-age`  | 存活时长, 到点删除       |
| `secure`   | 仅 HTTPS 下发送          |
| `httpOnly` | 禁止 JavaScript 读取     |
| `SameSite` | 限制跨站点请求携带       |

## 如何用 JavaScript 读写 cookie？

- 入口: `document.cookie` 是字符串, 读取时返回当前可读 cookie 的拼接串;

```js
document.cookie; // 读取
document.cookie = "name=Nicholas"; // 写入一条
```

- 局限: 没有按名读写的原生 API, 需要自行解析字符串, 且无法读取 `httpOnly` cookie;

## 如何降低 cookie 的安全风险？

- XSS: 用 `httpOnly` 阻止脚本读取会话 cookie;
- CSRF: 用 `SameSite` 限制跨站点请求携带;
- 传输: 用 `Secure` 保证只在 HTTPS 下发送;
