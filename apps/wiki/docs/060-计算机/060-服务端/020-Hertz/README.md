# Hertz 服务端开发

Hertz 是 CloudWeGo 的 HTTP 框架。本目录是「术」：只写 Hertz 怎么接；原理与判断规则去 [000-服务端知识](../000-服务端知识/README.md)。

## 阅读顺序

- [001-心智模型](./001-心智模型.md)：一次 HTTP 请求在 Hertz 里怎么走；
- [002-最小服务](./002-最小服务.md)：`server.Default` + `h.Spin()` 跑起来；
- [003-Engine与生命周期](./003-Engine与生命周期.md)：Default 与 New、超时、退出时序；
- [004-路由](./004-路由.md)：路由组、命名参数、404 与 405；
- [005-Handler与RequestContext](./005-Handler与RequestContext.md)：取参、传值、上下文复用；
- [006-请求绑定与校验](./006-请求绑定与校验.md)：`BindAndValidate` 与 `vd` 表达式；
- [007-响应与中间件](./007-响应与中间件.md)：`c.JSON`、洋葱模型、`c.Abort()`；
- [008-hz与IDL](./008-hz与IDL.md)：`hz@v0.9.7`、thrift replace、契约变更；
- [HTTP 注解](./009-HTTP注解.md) / [生成目录与所有权](./010-生成目录与所有权.md)：`api.*` 注解与生成目录所有权；
- [011-HertzClient](./011-HertzClient.md)：出站请求与对象池；
- [012-反向代理与重试](./012-反向代理与重试.md)：转发、hop-by-hop 与重试预算；
- [013-扩展生态](./013-扩展生态.md)：jwt/cors/sessions/csrf/secure 与第三方清单；
- [错误与认证接入](./014-错误与认证接入.md) / [浏览器安全接入](./015-浏览器安全接入.md)：错误体、JWT、跨源、会话/CSRF、安全头、请求边界；
- [016-运维接入](./016-运维接入.md)：优雅退出、健康检查、请求 ID 与日志。

## 怎么用

- 第一次用：读 001、002，先把服务跑起来；
- 用 hz 生成：读 008、009，先弄清哪些文件不能手改；
- 上线前：读 003、007、013，把退出、错误体和扩展补齐；
- 需要原理：去 000；换框架时只重读各篇里指向 000 的接入点。

来源：[CloudWeGo Hertz 文档](https://github.com/cloudwego/cloudwego.github.io/tree/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz)。
