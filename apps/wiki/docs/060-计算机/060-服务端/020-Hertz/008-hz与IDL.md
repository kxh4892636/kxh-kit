---
id: 843cda8b-9451-4d94-8170-ac2bf6c981fd
anki: true
---

# hz 与 IDL

## hz 版本不一致会怎样？

- 会漂移: `hz` 决定模型、路由、Handler 骨架与目录布局，版本不同生成物不同;

```bash
go install github.com/cloudwego/hertz/cmd/hz@v0.9.7
hz --version
```

- 本机与 CI 用同一个 `hz`、Thrift 依赖与 Go 版本，写进工具清单或构建镜像，不用 `@latest`。

## IDL 改完契约怎么更新？

```bash
hz update -idl idl/article.thrift
git diff -- biz router.go
go test ./...
```

- 顺序: 改 IDL → 兼容性审查 → `hz update` → 看生成 diff → 改 Handler/Service → 测试;
- 生成的模型直接用于 Handler，签名不要手改:

```go
func Get(ctx context.Context, c *app.RequestContext) {
	var req model.GetArticleRequest
	if err := c.BindAndValidate(&req); err != nil {
		c.JSON(consts.StatusBadRequest, map[string]string{"code": "INVALID_ARGUMENT"})
		return
	}
	// 用 req.ID 调 Service，再用 model.Article 组装响应。
}
```

- IDL 是接口契约，不是数据库模型;
- 字段能不能删、编号能不能复用见 [接口契约](../000-服务端知识/020-契约与错误/010-契约.md)。
