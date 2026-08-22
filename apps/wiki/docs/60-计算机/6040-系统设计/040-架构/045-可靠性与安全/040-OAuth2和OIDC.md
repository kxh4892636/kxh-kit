---
id: a81f62ba-254c-4332-a11e-ac06924319ca
---

# OAuth 2.0 和 OIDC

OAuth 2.0 解决什么问题？有哪些实体和流程？OIDC 如何在其上增加身份层？

## OAuth 2.0

- 定义: Open Authorization，授权标准，允许代表用户授权访问资源，不共享用户凭证;
- 性质: 授权协议，不是认证协议;

### 概念

- Resource Owner: 拥有资源并能授权访问的用户/系统;
- Client: 需要访问受保护资源的系统;
- Authorization Server: 认证资源所有者并颁发 Access Token;
- Resource Server: 保护资源并校验 Access Token;
- Scopes: 指定授权访问原因/范围;
- Access Token: 代表用户访问资源的授权数据;

### 流程

1. 客户端向授权服务器请求授权，提供 client id/secret、scopes、回调 URI;
2. 授权服务器认证客户端并校验 scopes;
3. 资源所有者交互授权;
4. 授权服务器重定向返回 Authorization Code 或 Access Token，可能附 Refresh Token;
5. 客户端用 Access Token 向资源服务器请求资源;

### 缺点

- 缺少内置安全特性;
- 实现无统一标准;
- 无通用 scopes;

## OpenID Connect

- 定义: 在 OAuth 2.0 之上增加登录与用户资料信息的薄层;
- 实体: Relying Party（当前应用）、OpenID Provider（提供一次性代码）、Token Endpoint（用 OTC 换 JWT）、UserInfo Endpoint（返回用户信息）;
- 区别: OIDC token 使用 JWT，规范比基础 OAuth 更严格;
