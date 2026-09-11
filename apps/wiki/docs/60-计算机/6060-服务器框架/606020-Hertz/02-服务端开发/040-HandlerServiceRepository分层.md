---
id: 9477e4ec-ca7a-4297-94bf-799b1c804950
---

# Handler、Service、Repository 分层

## 如何限定各层的依赖方向？

```text
Hertz/IDL → Handler → Service → Repository 接口 ← MySQL 实现
```

- Handler: 绑定输入、读取身份、调用 Service、映射 HTTP 响应;
- Service: 业务规则、授权判断和事务用例; 不导入 Hertz 包;
- Repository: 领域所需的持久化接口; 不暴露 GORM 查询对象;
- main: 创建实现并注入依赖; 业务包不读取全局单例;

## 如何让 Service 依赖存储接口？

```go
type ArticleRepository interface {
	Create(ctx context.Context, article *Article) error
	FindByID(ctx context.Context, id int64) (*Article, error)
}

type ArticleService struct {
	repo ArticleRepository
}

func (s *ArticleService) Get(ctx context.Context, id int64) (*Article, error) {
	if id <= 0 {
		return nil, ErrInvalidArticleID
	}
	return s.repo.FindByID(ctx, id)
}
```

## 如何把 HTTP 输入转换为业务调用？

```go
func (h *ArticleHandler) Get(ctx context.Context, c *app.RequestContext) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		writeError(c, 400, "INVALID_ARGUMENT", "invalid article id")
		return
	}
	article, err := h.service.Get(ctx, id)
	h.writeResult(c, article, err)
}
```

## 如何检查分层是否有效？

- Service: 单测不启动 HTTP Server;
- Repository: 接口围绕业务用例设计，不复制 ORM 的通用 CRUD;
- Handler: 不决定 SQL、事务隔离级别或缓存一致性;
- 实践: 领域错误通过 `errors.Is` 分类，底层错误使用 `%w` 保留 error chain;

## 需要核对具体用法时查哪里？

- 官方入口: [hz 生成代码的结构](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/toolkit/layout.md);
- 应用约定: 分层、业务码、数据模型、配置优先级和交付清单是笔记的开发示例，按项目调整；框架 API 以对应官方版本为准;
