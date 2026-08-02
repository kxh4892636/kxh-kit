---
id: 2c5f1c0d-0b18-45e5-b06a-6d2068daac0e
---

# Handler 与 RequestContext

## Handler 签名

```go
func getArticle(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	keyword := c.Query("keyword")
	authorization := c.Request.Header.Get("Authorization")

	c.JSON(consts.StatusOK, map[string]string{
		"id": id, "keyword": keyword, "authorization": authorization,
	})
}
```

- `ctx`: 传递取消、deadline 和请求范围值给 Service 与外部依赖;
- `c`: 读取 HTTP 请求并构造 HTTP 响应;
- `Param`: 获取路由参数;
- `Query`: 获取查询参数; 缺失和空字符串需要按契约区分;
- `Request.Header`: 读取 Header; Header 名大小写不应承载业务差异;

## 中间件数据

```go
c.Set("user_id", int64(42))
value, exists := c.Get("user_id")
```

- 使用场景: 认证中间件把已经验证的身份传给 Handler;
- 类型边界: 读取后必须检查 `exists` 和类型断言;
- 敏感数据: 不把密码、完整 Token 或大对象放入上下文;

## 生命周期约束

- RequestContext 会被框架复用; 不得在请求结束后由 goroutine 持有;
- 异步任务需要复制所需值和字节; 不直接捕获 `c`;
- Service 不依赖 `*app.RequestContext`; 只接收标准 context 和领域参数;
- Handler 不负责事务、缓存策略和复杂业务分支;

## 取消传播

- 下游请求: 使用传入的 `ctx`，不要替换为 `context.Background()`;
- 独立异步任务: 明确决定是否脱离请求取消，并交给任务系统处理;
- 超时错误: 区分客户端取消、服务端 deadline 和下游超时;
