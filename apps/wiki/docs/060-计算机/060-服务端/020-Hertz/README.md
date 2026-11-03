# Hertz 服务端开发

Hertz 是 CloudWeGo 的 HTTP 框架。本目录是「术」: 只写 Hertz 与 `hz` 的 API、默认值、生成物归属和框架陷阱。原理与判断规则去 [000-服务端知识](../000-服务端知识/README.md)。

## 阅读顺序

- [001-心智模型](./001-心智模型.md): Hertz 与 `hz` 分工、Handler 三件事、新增接口顺序;
- [002-最小服务](./002-最小服务.md): `server.Default` + `h.Spin()` 跑起来、`ut.PerformRequest` 验证;
- [003-Engine与生命周期](./003-Engine与生命周期.md): Default 与 New、默认值、HTTP/2 开关;
- [004-路由](./004-路由.md): 路由组、命名参数、404 与 405;
- [005-Handler与RequestContext](./005-Handler与RequestContext.md): 取参、传值、上下文复用;
- [006-请求绑定与校验](./006-请求绑定与校验.md): `BindAndValidate`、来源 tag、`vd` 边界;
- [007-响应与中间件](./007-响应与中间件.md): `c.JSON`、洋葱顺序、`c.Abort()`;
- [008-hz与IDL](./008-hz与IDL.md) / [009-HTTP注解](./009-HTTP注解.md) / [010-生成目录与所有权](./010-生成目录与所有权.md): 版本、注解、生成物谁能改;
- [011-HertzClient](./011-HertzClient.md): 对象池、超时三写法、与 Kitex 分工;
- [012-反向代理与重试](./012-反向代理与重试.md): 白名单代理、hop-by-hop、`retryable` 判定;
- [013-扩展生态](./013-扩展生态.md): 中间件顺序与 hertz-contrib 清单;
- [014-错误与认证接入](./014-错误与认证接入.md) / [015-浏览器安全接入](./015-浏览器安全接入.md): 错误体、JWT、CORS、会话、安全头、请求边界;
- [016-运维接入](./016-运维接入.md): 退出、探针、请求 ID。

## 怎么用

- 第一次用: 001、002 跑起来;
- 用 hz 生成: 008、009、010，先弄清哪些文件不能手改;
- 上线前: 003、007、011、016 补退出、错误体与观测;
- 需要「为什么」: 去 000；本目录只留指向，不重复解释。

来源：[CloudWeGo Hertz 文档](https://github.com/cloudwego/cloudwego.github.io/tree/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz)。
