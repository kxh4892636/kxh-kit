---
id: 2c5f1c0d-0b18-45e5-b06a-6d2068daac0e
anki: true
---

# Handler 与 RequestContext

## 从请求里取路径、查询和 Header 用什么方法？

- 三个入口: `c.Param`、`c.GetQuery`、`c.GetHeader`;

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

- `c.Query` 只返回值; 要区分缺失与空串用 `c.GetQuery`;
- `c.GetHeader` 返回 `[]byte`, 需要字符串就显式转换;
- `c.Request` 是原始协议对象, 一般用 RequestContext 的方法就够;

## 中间件怎么把身份传给 Handler？

- `c.Set`/`c.Get`: 认证中间件放规范化后的身份, Handler 读时校验存在性与类型;

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

## 请求结束后 RequestContext 还能用吗？

- 不能: 它来自 Engine 的 `sync.Pool`, 请求结束会被 `Reset`;
- 后台任务用 `c.Copy()` 拿可脱离请求作用域的副本; `c.Exile()` 标记不回收, 是实验特性;
- 只复制业务需要的数据, 不要把整个 Context 塞进异步任务;
