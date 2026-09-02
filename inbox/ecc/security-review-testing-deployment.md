---
id: fa5dad06-9e84-4b41-933f-c69240d93093
---

# Security Review 测试与发布门禁

安全测试应覆盖哪些行为? 生产发布前 checklist 怎样扫一遍? security-review 的元数据和外部资源有什么用?

## Automated Security Tests

- Authentication test: 受保护 endpoint 无凭证访问必须返回 401;
- Authorization test: 普通用户访问 admin endpoint 必须返回 403;
- Input validation test: 非法输入必须返回 400, 不能进入业务处理;
- Rate limit test: 超过阈值后至少一部分请求返回 429;
- Regression value: 安全测试不是证明系统安全, 而是防止已知防线被改坏;

```typescript
test("requires authentication", async () => {
  const response = await fetch("/api/protected");
  expect(response.status).toBe(401);
});

test("requires admin role", async () => {
  const response = await fetch("/api/admin", {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  expect(response.status).toBe(403);
});

test("rejects invalid input", async () => {
  const response = await fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email" }),
  });
  expect(response.status).toBe(400);
});

test("enforces rate limits", async () => {
  const responses = await Promise.all(Array.from({ length: 101 }, () => fetch("/api/endpoint")));
  expect(responses.some((response) => response.status === 429)).toBe(true);
});
```

## Pre-Deployment Security Checklist

- Secrets: 无硬编码 secret, 所有 secret 来自环境变量或托管平台 secret store;
- Input validation: 所有用户输入均校验, 文件上传限制 size、type、extension;
- SQL injection: 所有查询参数化, 无 SQL 字符串拼接;
- XSS: 用户内容已清洗, CSP 已配置, 无未经验证的动态 HTML 渲染;
- CSRF: 状态变更操作有 CSRF token, cookie 使用 `SameSite=Strict`;
- Authentication: token 处理安全, 不放 `localStorage`;
- Authorization: 角色检查和敏感操作前置检查到位;
- Rate limiting: 所有 endpoint 有基础限流, 高成本操作有更严格限流;
- HTTPS: 生产强制 HTTPS;
- Security headers: CSP、`X-Frame-Options` 等安全 header 已配置;
- Error handling: 用户响应不包含内部错误、栈、SQL 或 secret;
- Logging: 日志不包含密码、token、secret、CVV 等敏感字段;
- Dependencies: 依赖更新, audit 无未处理漏洞, lock file 已提交;
- Supabase RLS: 表启用 Row Level Security 并配置访问策略;
- CORS: 跨域来源、方法、header 配置最小化;
- Wallet signatures: 涉及链上功能时已验证钱包签名和交易细节;

## Checklist 使用方式

- Before production: 每次生产发布前逐项过 checklist, 不只在初次上线时使用;
- Sensitive change: 认证、支付、上传、第三方 API、权限模型改动后必须重新过相关小节;
- Evidence: 对每个高风险项留下测试、配置、代码位置或审查记录;
- Bias: 有疑问时选择更保守方案, 因为一个漏洞可能导致整个平台失守;

## Resources

- OWASP Top 10: Web 应用常见高风险漏洞清单, 用于建立审查基线;
- Next.js Security: Next.js 项目的安全配置和运行时注意事项;
- Supabase Security: Supabase Auth、RLS、策略配置的参考入口;
- Web Security Academy: 用于学习和复现 Web 漏洞的训练材料;

## Skill Metadata

- Display name: `Security Review`; 对用户展示的技能名称;
- Short description: `Security checklist and vulnerability review`; 工具列表中的短说明;
- Brand color: `#EF4444`; 界面识别色;
- Default prompt: `Use $security-review to review sensitive code with the security checklist.`; 显式调用提示;
- Implicit invocation: `allow_implicit_invocation: true`; 添加敏感代码时可自动启用;
