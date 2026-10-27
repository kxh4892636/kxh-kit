---
id: 843cda8b-9451-4d94-8170-ac2bf6c981fd
anki: true
---

# hz 与 IDL

## hz 版本不一致会怎样？

- 会漂移: `hz` 是 Hertz 的命令行生成器，读 Thrift/Protobuf IDL，生成模型、路由、Handler 骨架和工程布局；本机与 CI 必须用同一个 `hz`、Thrift 依赖和 Go 版本;

```bash
go install github.com/cloudwego/hertz/cmd/hz@v0.9.7
hz --version
```

- 版本写进工具清单或构建镜像，不使用 `@latest`;

## 从 IDL 生成工程要补哪一步？

- 补 `replace`: 生成代码按 `apache/thrift v0.13.0` 的签名编译，不补会报 `ReadStructBegin` 一类签名不兼容;

```bash
go mod init example.com/article-api
hz new -module example.com/article-api -idl idl/article.thrift
go mod edit -replace github.com/apache/thrift=github.com/apache/thrift@v0.13.0
go mod tidy
```

- `-module` 必须与 `go.mod` 里的 module 一致；`-idl` 的 include 相对路径要保持稳定;
- 生成后先看目录与 `git diff`，再补业务实现;

## IDL 改完契约怎么更新？

- 顺序: 改 IDL → 兼容性审查 → `hz update` → 看生成 diff → 改 Handler/Service → 测试;

```bash
hz update -idl idl/article.thrift
git diff -- biz router.go
go test ./...
```

- 生成的模型直接用于 Handler，签名不要手改;

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

- Thrift 在 Hertz 里只驱动 HTTP 代码生成，不改变 HTTP 传输；IDL 是接口契约，不是数据库模型;
- 契约能不能删字段、能不能复用编号，见 [接口契约与演进](../000-服务端知识/020-契约与错误/010-接口契约与演进/010-契约不变量与形状.md);
