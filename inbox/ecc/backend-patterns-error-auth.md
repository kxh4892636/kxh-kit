---
id: 9ec49580-487f-49ea-8a6e-a45d3402b82e
---

# Backend 错误认证授权模式

API 错误如何集中处理? 重试为什么用指数退避? JWT 认证如何拆成服务? RBAC 授权怎样与认证分离?

## Centralized Error Handler

- ApiError: 用普通错误值表达 HTTP 状态、消息和是否可预期;
- Factory: `createApiError` 统一生成错误值, 抛错点不重复拼结构;
- Type guard: `isApiError` 把 `unknown` 收窄为 API 错误;
- Central handler: handler 只捕获错误, 响应格式由统一函数决定;
- Validation error: Zod 校验失败返回 400 和 details; 未预期错误记录日志并返回 500;

```typescript
interface ApiError {
  kind: "ApiError";
  statusCode: number;
  message: string;
  isOperational: boolean;
}

function createApiError(statusCode: number, message: string, isOperational = true): ApiError {
  return { kind: "ApiError", statusCode, message, isOperational };
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && (error as ApiError).kind === "ApiError";
}
```

## Retry With Exponential Backoff

- Retry: 适合短暂性失败, 例如网络抖动、临时限流、依赖服务偶发 5xx;
- Exponential backoff: 每次失败后等待时间翻倍, 例: 1s、2s、4s;
- Last error: 所有尝试失败后抛最后一次错误, 保留最接近失败现场的信息;
- Idempotency: 非幂等写操作需要幂等键, 否则重试可能重复创建资源;

```typescript
function createRetrier(delay: (ms: number) => Promise<void>) {
  return async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) await delay(2 ** attempt * 1000);
      }
    }
    throw lastError ?? createApiError(500, "Retry failed");
  };
}
```

## JWT Token Validation

- Authentication: 认证回答“你是谁”; JWT 校验 token 签名并得到 `userId`、`email`、`role`;
- Secret: `JWT_SECRET` 是签名信任根, 缺失或泄漏都会破坏认证可信度;
- requireAuth: 从 request header 提取 bearer token, 缺失或无效时抛 401;
- Service composition: auth service 注入 `verifyJwt` 和 `secret`, API route 只调用接口;

```typescript
type UserRole = "admin" | "moderator" | "user";

interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

interface User {
  id: string;
  email: string;
  role: UserRole;
}

interface AuthService {
  requireAuth(request: Request): Promise<User>;
}

function createAuthService(deps: {
  secret: string;
  verifyJwt(token: string, secret: string): JWTPayload;
}): AuthService {
  return {
    async requireAuth(request) {
      const token = request.headers.get("authorization")?.replace("Bearer ", "");
      if (!token) throw createApiError(401, "Missing authorization token");
      try {
        const payload = deps.verifyJwt(token, deps.secret);
        return { id: payload.userId, email: payload.email, role: payload.role };
      } catch {
        throw createApiError(401, "Invalid token");
      }
    },
  };
}
```

## Role-Based Access Control

- Authorization: 授权回答“你能做什么”; 它应在认证之后执行;
- Permission table: 角色到权限的映射集中维护, handler 不散落权限判断;
- Wrapper: `requirePermission` 包裹业务 handler, 拦截权限不足请求;
- Failure code: 权限不足返回 403, 与未登录的 401 分开;

```typescript
type Permission = "read" | "write" | "delete" | "admin";

const rolePermissions: Record<User["role"], Permission[]> = {
  admin: ["read", "write", "delete", "admin"],
  moderator: ["read", "write", "delete"],
  user: ["read", "write"],
};

function requirePermission(permission: Permission, auth: AuthService) {
  return (handler: (request: Request, user: User) => Promise<Response>) =>
    async (request: Request) => {
      const user = await auth.requireAuth(request);
      if (!rolePermissions[user.role].includes(permission))
        throw createApiError(403, "Insufficient permissions");
      return handler(request, user);
    };
}
```
