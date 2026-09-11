---
id: 2c5f1c0d-0b18-45e5-b06a-6d2068daac0e
---

# Handler 与 RequestContext

## 如何在 Handler 中读取 HTTP 输入？

```go
func getArticle(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	keyword := c.Query("keyword")
	contentType := c.Request.Header.Get("Content-Type")

	c.JSON(consts.StatusOK, map[string]string{
		"id": id, "keyword": keyword, "content_type": contentType,
	})
}
```

- `ctx`: 传递取消、deadline 和请求范围值给 Service 与外部依赖;
- `c`: 读取 HTTP 请求并构造 HTTP 响应;
- `Param`: 获取路由参数;
- `Query`: 获取查询参数; 缺失和空字符串需要按契约区分;
- `Request.Header`: 读取 Header; Header 名大小写不应承载业务差异;

## 如何读取中间件传入的身份？

```go
c.Set("user_id", int64(42))
value, exists := c.Get("user_id")
```

- 使用场景: 认证中间件把已经验证的身份传给 Handler;
- 类型边界: 读取后必须检查 `exists` 和类型断言;
- 敏感数据: 不把密码、完整 Token 或大对象放入上下文;

## 如何避免 RequestContext 越过有效期？

- RequestContext: 请求结束即被复用，后台任务不能持有原引用；必要时用 `Copy()` 或 `Exile()`，一般只复制业务所需数据;
- 实践: 异步任务需要复制所需值和字节; 不直接捕获 `c`;
- Service: 不依赖 `*app.RequestContext`; 只接收标准 context 和领域参数;
- Handler: 不负责事务、缓存策略和复杂业务分支;

## 如何把取消和超时传给下游？

- 下游请求: 使用传入的 `ctx` 并派生业务 deadline；不要假设客户端断开就自动取消所有 Handler 或下游调用;
- 独立异步任务: 明确决定是否脱离请求取消，并交给任务系统处理;
- 超时错误: 区分客户端取消、服务端 deadline 和下游超时;

## 需要核对具体用法时查哪里？

- 官方入口: [请求上下文](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/basic-feature/context/_index.md)、[请求](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/basic-feature/context/request.md);
