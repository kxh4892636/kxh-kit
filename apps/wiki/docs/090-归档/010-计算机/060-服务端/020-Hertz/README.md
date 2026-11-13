# Hertz 服务端开发

Hertz 是 CloudWeGo 的 HTTP 框架。本目录是「术」: 只写 Hertz 与 `hz` 的 API、默认值、生成物归属和框架陷阱。原理与判断规则去 [000-服务端知识](../000-服务端知识/README.md)。

## 阅读顺序

- [001-心智模型](./001-心智模型.md): Hertz 与 `hz` 分工、最小服务骨架、Handler 三件事、新增接口顺序;
- [002-Engine与生命周期](./002-Engine与生命周期.md): Default 与 New、超时与 body 上限、HTTP/2 开关、退出顺序;
- [003-路由](./003-路由.md): 路由组、命名参数、404 与 405;
- [004-Handler与RequestContext](./004-Handler与RequestContext.md): 取参、传值、上下文复用;
- [005-请求绑定与校验](./005-请求绑定与校验.md): `BindAndValidate`、来源 tag、`vd` 边界;
- [006-响应与中间件](./006-响应与中间件.md): `c.JSON`、洋葱顺序、`c.Abort()`;
- [007-hz与IDL](./007-hz与IDL.md): `hz` 版本、`api.*` 注解、生成物谁能改;
- [008-HertzClient](./008-HertzClient.md): 对象池、超时三写法、与 Kitex 分工;
- [009-扩展生态](./009-扩展生态.md): hertz-contrib 能力清单与选型边界。

## 怎么用

- 第一次用: 001 跑起来;
- 用 hz 生成: 007，先弄清哪些文件不能手改;
- 写业务: 003 定路由、004 取参、005 校验、006 写响应;
- 上线前: 002 定超时与退出等待，006 统一错误体;
- 需要「为什么」: 去 000；本目录只留指向，不重复解释。

来源：[CloudWeGo Hertz 文档](https://github.com/cloudwego/cloudwego.github.io/tree/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz)。
