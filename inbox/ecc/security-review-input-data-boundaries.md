---
id: 5423f154-e94a-40c5-885f-0fe1352951f7
---

# Security Review 输入与数据边界

什么时候启用 security-review? secret 应怎样进入程序? 用户输入、文件上传、SQL 查询各自要守住什么边界?

## 适用范围

- security-review: 添加认证授权、处理用户输入、管理 secret、创建 API endpoint、实现支付或敏感功能时启用;
- 第三方集成: 接入外部 API 时也要启用, 因为凭证、回调、错误面和权限边界都会扩大攻击面;
- 审查目标: 找出可被利用的输入路径、凭证暴露、注入点、越权点和敏感数据泄露点;

## Secrets Management

- Hardcoded secret: API key、token、密码不得写入源码, 包括示例、测试数据和注释;
- Environment variable: secret 通过环境变量读取, 本地 `.env.local` 必须进入 `.gitignore`;
- Startup validation: 服务启动时检查必需 secret, 缺失立即失败, 不等到请求路径才报错;
- Git history: 当前文件无 secret 不够, 还要确认历史提交没有泄露;
- Production secret: 生产环境 secret 放 Vercel、Railway 等托管平台的 secret store;

```typescript
interface SecretConfig {
  openAiApiKey: string;
  databaseUrl: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw createApiError(500, `${name} not configured`);
  return value;
}

function createSecretConfig(): SecretConfig {
  return {
    openAiApiKey: requireEnv("OPENAI_API_KEY"),
    databaseUrl: requireEnv("DATABASE_URL"),
  };
}
```

## Input Validation

- Schema validation: 所有用户输入先用 schema 校验, 再进入业务逻辑或数据库;
- Whitelist: 使用白名单定义允许格式, 不用黑名单猜测攻击字符串;
- Error surface: 用户看到字段级校验错误即可, 不暴露内部异常、SQL、栈信息;
- Query boundary: 未校验输入不得直接拼进查询、路径、命令或第三方请求;

```typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150),
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;

function parseCreateUser(input: unknown): CreateUserInput {
  return CreateUserSchema.parse(input);
}

async function createUser(input: unknown, users: UserRepository) {
  const validated = parseCreateUser(input);
  return users.create(validated);
}
```

## File Upload Validation

- Size check: 上传文件必须限制大小, 原材料示例使用 5MB 上限;
- MIME type: 只允许明确列出的类型, 例如 JPEG、PNG、GIF;
- Extension check: 文件扩展名也要白名单校验, 不能只信 `file.type`;
- Defense in depth: size、MIME、extension 是三道不同检查, 不应互相替代;

```typescript
interface UploadPolicy {
  maxSizeBytes: number;
  allowedTypes: string[];
  allowedExtensions: string[];
}

function validateFileUpload(file: File, policy: UploadPolicy): boolean {
  if (file.size > policy.maxSizeBytes) throw createApiError(400, "File too large");
  if (!policy.allowedTypes.includes(file.type)) throw createApiError(400, "Invalid file type");
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!extension || !policy.allowedExtensions.includes(extension)) {
    throw createApiError(400, "Invalid file extension");
  }
  return true;
}
```

## SQL Injection Prevention

- SQL injection: 把用户输入拼进 SQL 字符串会让输入变成指令;
- Parameterized query: 原始 SQL 使用占位符和参数数组, 让数据库把输入当值处理;
- Query builder: Supabase / ORM 查询也要按 API 参数传值, 不绕回字符串拼接;
- Verification: 检查所有查询无 SQL 字符串拼接、无未校验输入直达查询;

```typescript
async function findUserByEmail(db: DatabaseClient, userEmail: string) {
  return db.query("SELECT id, email, role FROM users WHERE email = $1", [userEmail]);
}

async function findUserByEmailWithSupabase(supabase: SupabaseClient, userEmail: string) {
  return supabase.from("users").select("id, email, role").eq("email", userEmail);
}
```
