---
id: 7c15823c-6a78-40d0-b1d4-e2b31ce40108
---

# OpenID Connect 身份认证

## OIDC 怎样在授权之上表达用户身份？

- OIDC: OpenID Connect，在 OAuth 2.0 之上加入身份认证语义，使客户端能验证“谁已登录”;
- RP: Relying Party，即依赖身份提供方结果的应用;
- OP: OpenID Provider，负责用户认证并提供身份声明的服务，不只是一个转发一次性验证码的中间站;
- ID Token: 面向客户端的身份声明，采用 JWT，不能与用于访问资源的 Access Token 混用;
- UserInfo: 客户端在获准范围内通过访问令牌获取用户资料的端点;
- 验证: 按流程校验签名、签发者、受众、有效期及必要的 nonce，收到一个 JWT 字符串并不代表已验证登录;
- 依据: [OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html)区分身份令牌与资源访问令牌，未规定统一的一小时有效期;

## 授权与认证在设计中如何分开？

- 认证: 确认当前主体是谁，由 OIDC 等认证机制提供;
- 授权: 决定该主体能对哪个资源执行哪些操作，OAuth 的 scope 仍需结合资源级规则;
- 实施成本: 权限词汇、令牌生命周期和信任配置由系统管理，选择标准协议不代表集成没有安全复杂度;

## 为什么拿到 Access Token 不等于完成用户登录？

- 受众区别: Access Token 通常面向资源服务器，ID Token 面向当前客户端，不能把一方的令牌冒充另一方的凭据;
- 登录上下文: 客户端必须把认证响应绑定到自己发起的请求，验证签发者、受众及有效期，防止接收不属于本次登录的结果;
- 前置流程: 授权码、scope 与资源访问流程见 [OAuth 2.0](070-OAuth.md)，这里只负责身份声明的解释;

## 本篇依据哪些材料？

- 来源: Karan Pratap Singh 的 System Design，[原文 L3382–L3398](https://github.com/karanpratapsingh/system-design/blob/b150e62ef30c1343cffbe83f4df60d14ab1d234f/README.md#L3382-L3398)；本篇按概念重组，修正和补充已在相关段落注明;
