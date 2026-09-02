---
id: a7750cfa-d889-40e6-9950-fbac6763de7a
---

# Security Review 身份与浏览器防护

JWT token 应放哪里? 授权检查和 RLS 如何互补? XSS、CSP、CSRF、限流分别挡住什么攻击?

## Authentication

- Token storage: JWT 不放 `localStorage`, 因为 XSS 可读取; 使用 `HttpOnly; Secure; SameSite=Strict` cookie;
- Session boundary: 认证证明用户是谁, 不能替代授权检查;
- Secure cookie: `HttpOnly` 阻止脚本读取, `Secure` 限定 HTTPS, `SameSite=Strict` 降低跨站请求风险;

```typescript
interface CookieWriter {
  setHeader(name: string, value: string): void;
}

function setSessionCookie(res: CookieWriter, token: string): void {
  res.setHeader("Set-Cookie", `token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
}
```

## Authorization

- Authorization check: 敏感操作前先确认 requester 权限, 再执行删除、付款、导出等动作;
- RBAC: 角色到权限的映射集中维护, handler 不散落角色判断;
- Failure code: 已登录但无权限返回 403, 未登录返回 401;

```typescript
interface UserRecord {
  id: string;
  role: "admin" | "user";
}

interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  deleteById(id: string): Promise<void>;
}

async function deleteUser(userId: string, requesterId: string, users: UserRepository) {
  const requester = await users.findById(requesterId);
  if (!requester || requester.role !== "admin") throw createApiError(403, "Unauthorized");
  await users.deleteById(userId);
}
```

## Row Level Security

- RLS: Supabase 表级策略让数据库也执行访问控制, 不是只依赖 API 代码;
- Own data policy: 用户只能 SELECT / UPDATE 自己的数据, 典型条件是 `auth.uid() = id`;
- Defense in depth: API 层授权和数据库 RLS 同时存在, 任一层遗漏时另一层仍可拦截;

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

## XSS Prevention

- XSS: 攻击者把脚本作为内容注入页面, 进而读取用户数据或代用户操作;
- Sanitization: 用户提供 HTML 必须先清洗, 只允许必要标签和属性;
- React protection: 默认文本插值有转义保护, 但 `dangerouslySetInnerHTML` 必须额外审查;
- CSP: Content Security Policy 用 header 限制脚本、图片、字体和连接来源;

```typescript
import DOMPurify from "isomorphic-dompurify";

function sanitizeUserHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "p"],
    ALLOWED_ATTR: [],
  });
}
```

```typescript
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: `
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self';
    connect-src 'self' https://api.example.com;
  `
      .replace(/\s{2,}/g, " ")
      .trim(),
  },
];
```

## CSRF Protection

- CSRF: 用户已登录时, 恶意站点诱导浏览器向目标站点发起状态变更请求;
- CSRF token: `POST`、`PUT`、`PATCH`、`DELETE` 等状态变更操作校验 token;
- Double-submit cookie: cookie 和 header / body 同时提交 token, 服务端比对一致性;
- SameSite: cookie 使用 `SameSite=Strict`, 作为 CSRF 的基础防线;

```typescript
interface CsrfVerifier {
  verify(token: string | null): boolean;
}

function requireCsrf(request: Request, csrf: CsrfVerifier): void {
  const token = request.headers.get("X-CSRF-Token");
  if (!csrf.verify(token)) throw createApiError(403, "Invalid CSRF token");
}
```

## Rate Limiting

- API limit: 所有 API endpoint 都应有限流, 防止暴力破解、刷接口和资源耗尽;
- Expensive operation: 搜索、AI 调用、支付、文件处理等高成本接口应设置更严格限制;
- Key choice: 匿名流量按 IP, 已登录流量按 userId 或 API key, 两者可组合;
