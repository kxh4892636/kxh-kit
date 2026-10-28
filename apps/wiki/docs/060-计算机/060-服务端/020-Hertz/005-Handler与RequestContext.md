---
id: 2c5f1c0d-0b18-45e5-b06a-6d2068daac0e
anki: true
---

# Handler 与 RequestContext

## 从请求里取路径、查询和 Header 用什么方法？

- 三个入口: `c.Param` 取路由参数、`c.GetQuery` 取查询串、`c.GetHeader` 取 Header;

```go
func getArticle(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	keyword, hasKeyword := c.GetQuery("keyword") // 能区分缺失与空串
	auth := string(c.GetHeader("Authorization"))

	c.JSON(consts.StatusOK, map[string]any{
		"id": id, "keyword": keyword, "has_keyword": hasKeyword, "auth": auth,
	})
}
```

- `c.Query` 只返回值，要区分缺失与空串时用 `c.GetQuery`;
- `c.GetHeader` 返回 `[]byte`，要字符串就显式转换；Header 名大小写不承载业务差异;
- `c.Request` 是原始请求；一般用 RequestContext 的方法就够，不必直接拆协议对象;

## 中间件怎么把身份传给 Handler？

- 用 `c.Set`/`c.Get`: 认证中间件放规范化后的身份，Handler 读取时校验存在性与类型;

```go
c.Set("user_id", int64(42))

v, exists := c.Get("user_id")
uid, ok := v.(int64)
if !exists || !ok {
	c.AbortWithStatus(consts.StatusUnauthorized)
	return
}
```

- 中间件写入的请求 ID 用 `c.GetString("request_id")` 读;
- 不把密码、完整 Token 或大对象放进上下文;

## 请求结束后 RequestContext 还能用吗？

- 不能: 它来自 Engine 的 `sync.Pool`，请求结束会被 `Reset`;

- 后台任务不能直接持有 `c`；`c.Copy()` 返回可脱离请求作用域的副本，适合传给 goroutine;
- `c.Exile()` 把当前上下文标记为不回收，无返回值，是实验特性;
- 一般只复制业务需要的数据，不要把整个 Context 塞进异步任务;
- Handler 的职责边界见 [分层与依赖方向](../000-服务端知识/010-基础模型/020-依赖方向.md);
