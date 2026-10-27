---
id: 0692b70b-d2b5-4d7a-9685-49dce3a7548a
anki: true
---

# 会话与 CSRF

## 有状态会话把状态放在哪里？

- 浏览器只持有随机 session id，权限与业务状态存服务端；纯 RPC 或纯 Bearer 接口不适用;

- 多实例必须共享 session store（Redis 等），或明确使用粘性会话;
- 只删客户端 Cookie，服务端会话仍有效，攻击者可以继续使用。

## 会话 Cookie 与 session id 怎么设才安全？

- `HttpOnly` 禁止 JS 读、`Secure` 只走 HTTPS、`SameSite` 限制跨站携带、`Path` 限制路径;

- 登录成功、权限提升后更换 session id，防会话固定;
- session id 用密码学随机数，长度足够，不用可预测的自增 ID;
- Cookie 名可用 `__Host-` 前缀，限制作用域与 `Secure`。

## 会话的 Cookie 与请求长什么样？

```http
HTTP/1.1 200 OK
Set-Cookie: sid=8f3c...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

```http
POST /articles HTTP/1.1
Cookie: sid=8f3c...
Origin: https://app.example.com
X-CSRF-Token: 5d1e...
```

- 登出要服务端失效，不能只让浏览器删 Cookie。

## CSRF 为什么不能只靠 SameSite？

- Cookie 会被浏览器自动携带，攻击站点可以借用户的登录态发请求；`SameSite=Lax` 挡不住同站子域与部分跨站场景，token 仍是必要补充;

- 防护组合: `SameSite` + CSRF token + `Origin`/`Referer` 校验;
- CSRF token 与 session 绑定，每个会话一个，或每个表单一个，服务端校验后一次性使用;
- 安全方法（GET/HEAD/OPTIONS）不修改状态，否则预取和爬虫会触发写操作。

## 会话从登录到登出怎么走？

```text
登录：校验凭据 → 生成随机 session id → 服务端存状态 → Set-Cookie
请求：读 Cookie → 查 store → 续期/校验 → 写身份
写操作：校验 CSRF token 或 Origin；token 与 session 绑定
登出：删除服务端会话 → 清 Cookie
```

## 会话与 CSRF 做错会有哪些症状？

| 症状                       | 原因                                     |
| -------------------------- | ---------------------------------------- |
| 登录后换设备仍能访问旧会话 | 登出只删了 Cookie                        |
| 子域被攻破后主站失守       | Cookie 作用域过大，或没有 `__Host-` 前缀 |
| CSRF token 形同虚设        | token 没和 session 绑定，或 GET 也能写   |
| 多实例随机掉登录           | session 存在进程内存                     |
| 会话固定攻击               | 登录后没有更换 session id                |
