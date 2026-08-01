---
id: 18d62eb6-57f1-4ce8-ae65-665ba759f637
---

# 迁移到 Hertz

## 迁移脚本

```shell
cd your_project_path
sh -c "$(curl -fsSL https://raw.github.com/hertz-contrib/migrate/main/migrate.sh)"
```

- 脚本处理后仍有少量代码需手动迁移;
- API 迁移提示: Header 在 Request/Response 中, 对应 `ctx.Request.Header.XXX()`;
- 常用 API 在 ctx 上有快捷方法(如 `ctx.Body`);

## FastHTTP 迁移

- Handler 签名: `func(ctx *fasthttp.RequestCtx)` → `func(ctx context.Context, c *app.RequestContext)`;
- `UserValue` → 二选一: `RequestContext.Keys`(请求内, 结束回收)或标准库 `context.Value`(可异步使用);
- 路由参数: `c.UserValue("name")` → `c.Param("name")`;
- 路由语法: `/hello/{name}` → `/hello/:name`;
- 无 `ListenAndServe`, 监听在初始化参数中指定, 用 `h.Spin()` 运行;

## Gin 迁移

- Handler: `func(ctx *gin.Context)` → `func(ctx context.Context, c *app.RequestContext)`;
- 参数绑定: Hertz `Bind` 绑定所有数据, 不单独绑定 Query/Body;
- 响应设置: Hertz 支持乱序设置 Header 与 Body, Gin 必须先 Header 后 Body;
- 不使用 `http.Server` 监听, 需在初始化时指定端口;

## 转换对照表

- [FastHTTP -> Hertz](https://github.com/hertz-contrib/migrate/blob/main/fasthttp_to_hertz.md);
- [Gin -> Hertz](https://github.com/hertz-contrib/migrate/blob/main/gin_to_hertz.md);
